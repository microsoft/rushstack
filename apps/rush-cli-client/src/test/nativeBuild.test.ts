// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import { DaemonClient } from '@rushstack/rush-client-core';
import { DAEMON_PROTOCOL_VERSION, RUSHD_GRAPH_SNAPSHOT } from '@rushstack/rush-daemon-protocol';
import { writeDaemonLockfile, type IDaemonPaths } from '@rushstack/rush-daemon-transport';
import {
  createNativeBuildTestFixture,
  type INativeBuildTestFixture,
  type INativeBuildResult as IResult
} from './NativeBuildTestFixture';

// A pending CLI startup can take 15s; allow its join plus daemon stop/drain and fixture removal.
const NATIVE_FIXTURE_CLEANUP_TIMEOUT_MS: number = 35_000;
// Windows runners take much longer to start the processes of the first build.
const NATIVE_FIXTURE_INITIAL_BUILD_TIMEOUT_MS: number = process.platform === 'win32' ? 120_000 : 30_000;
// An operation process that a stand-in daemon starts; it exits by itself after a minute.
const OPERATION_SCRIPT: string = 'setTimeout(()=>{},60000)';
// A stand-in daemon: like a phased operation, its operation process shares the daemon's process group.
const STAND_IN_DAEMON_SCRIPT: string =
  "const c=require('node:child_process')" +
  `.spawn(process.execPath,['-e','${OPERATION_SCRIPT}'],{stdio:'ignore'});` +
  "process.stdout.write(String(c.pid)+'\\n');setInterval(()=>{},1000);";

/** Records a stand-in daemon as the workspace's daemon, then SIGKILLs only it, so its operation keeps running. */
async function startCrashedDaemonAsync(
  paths: IDaemonPaths
): Promise<{ daemonPid: number; operationPid: number }> {
  const daemon: ChildProcess = spawn(process.execPath, ['-e', STAND_IN_DAEMON_SCRIPT], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore']
  });
  const [chunk] = (await once(daemon.stdout!, 'data')) as [Buffer];
  daemon.stdout!.destroy();
  writeDaemonLockfile(paths.lockfilePath, {
    pid: daemon.pid!,
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    startedAt: new Date().toISOString(),
    socketPath: paths.socketPath
  });
  daemon.kill('SIGKILL');
  await once(daemon, 'exit');
  return { daemonPid: daemon.pid!, operationPid: Number(chunk.toString().trim()) };
}

/**
 * Starts a stand-in daemon that exits without releasing its files once it acknowledges a shutdown, and waits until
 * it listens and its operation runs.
 */
async function startShutdownExitDaemonAsync(
  paths: IDaemonPaths
): Promise<{ daemon: ChildProcess; operationPid: number }> {
  const daemon: ChildProcess = spawn(
    process.execPath,
    [path.join(__dirname, 'ShutdownExitDaemonTestProcess.js'), JSON.stringify(paths), OPERATION_SCRIPT],
    { detached: true, stdio: ['ignore', 'pipe', 'inherit'] }
  );
  const listening: [Buffer] | undefined = await Promise.race([
    once(daemon.stdout!, 'data') as Promise<[Buffer]>,
    once(daemon, 'exit').then(() => undefined)
  ]);
  daemon.stdout!.destroy();
  if (!listening) throw new Error('The stand-in daemon exited before it listened.');
  return { daemon, operationPid: Number(listening[0].toString().trim()) };
}

/** False once the operation process has exited, even before it is reaped: a zombie's command line is empty. */
function isOperationRunning(pid: number): boolean {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(OPERATION_SCRIPT);
  } catch {
    return false;
  }
}

/**
 * Expects one line of `client` on `stream`, and no Node.js process warning, for the stand-in daemon's
 * operation.
 */
function expectOneReclaimLine(
  result: IResult,
  daemonPid: number,
  stream: 'stdout' | 'stderr',
  client: 'rush-client' | 'rushx-client' = 'rush-client'
): void {
  // The stand-in daemon's operation shares its process group, as a phased operation does.
  const reclaimLine: string =
    `${client}: Stopped the operations that the exited daemon (PID ${daemonPid}) left running ` +
    `(process group ${daemonPid}).`;
  const output: string = `${result.stdout}\n${result.stderr}`;
  expect(output.split('\n').filter((line) => line.includes('left running'))).toEqual([reclaimLine]);
  expect(result[stream]).toContain(reclaimLine);
  expect(output).not.toMatch(/RUSH_DAEMON_ORPHANS_REAPED|--trace-warnings|\(node:\d+\)/);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('native build through the standalone client', () => {
  let fixture: INativeBuildTestFixture | undefined;
  beforeEach(() => {
    fixture = undefined;
    fixture = createNativeBuildTestFixture();
  });
  afterEach(async () => {
    await fixture?.closeAsync();
  }, NATIVE_FIXTURE_CLEANUP_TIMEOUT_MS);

  function runWithFixtureAsync(work: (current: INativeBuildTestFixture) => Promise<void>): Promise<void> {
    if (!fixture) throw new Error('The native build fixture was not initialized.');
    return fixture.runAsync(work);
  }

  describe('after a successful initial native build', () => {
    const argv: string[] = ['build', '--to', 'b', '--verbose'];
    let firstPid: number | undefined;
    beforeEach(
      () =>
        runWithFixtureAsync(async ({ paths, invokeAsync }) => {
          const first: IResult = await invokeAsync(argv);
          expect(first.code).toBe(0);
          expect(first.stderr).not.toMatch(/using in-process/i);
          expect(first.stdout).toContain('built-a-one');
          expect(first.stdout).toContain('built-b-one');
          expect(first.stdout).toContain('==[');
          const client: DaemonClient = await DaemonClient.connectAsync({ socketPath: paths.socketPath });
          try {
            firstPid = (await client.status).pid;
          } finally {
            await client.closeAsync();
          }
        }),
      NATIVE_FIXTURE_INITIAL_BUILD_TIMEOUT_MS
    );

    it(
      'executes selected scripts, reuses warm state, and never confuses rushx build with rush build',
      () =>
        runWithFixtureAsync(async ({ folder, invokeAsync }) => {
          expect((await invokeAsync(argv)).code).toBe(0);
          expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe('a:one\nb:one\n');
          const native: IResult = await invokeAsync(['--no-daemon', ...argv]);
          expect(native.code).toBe(0);
          expect(native.stderr).not.toContain('Another Rush command');
          const beforeChange: string = fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8');
          fs.writeFileSync(path.join(folder, 'a/input.txt'), 'two');
          expect((await invokeAsync(argv)).code).toBe(0);
          expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe(
            `${beforeChange}a:two\nb:one\n`
          );
          const status = await invokeAsync(['daemon', 'status']);
          expect(JSON.parse(status.stdout).pid).toBe(firstPid);
          const script: IResult = await invokeAsync(['build'], true);
          expect(script.code).toBe(0);
          expect(script.stderr).not.toMatch(/using in-process/i);
          expect(script.stdout).toContain('rushx-only');
          expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe(
            `${beforeChange}a:two\nb:one\n`
          );
        }),
      30000
    );
  });

  it(
    'gates graph commands and inspects an uninitialized daemon without running work',
    () =>
      runWithFixtureAsync(async ({ folder, environment, paths, invokeAsync, snapshotAsync }) => {
        environment.RUSH_DAEMON_EXPERIMENTAL = '0';
        const disabled = await invokeAsync(['daemon', 'graph', 'show']);
        expect(disabled.code).toBe(1);
        expect(JSON.parse(disabled.stdout)).toMatchObject({ kind: 'graphError' });
        expect(disabled.stderr).toBe('');
        expect(fs.existsSync(paths.lockfilePath)).toBe(false);
        environment.RUSH_DAEMON_EXPERIMENTAL = '1';
        expect((await invokeAsync(['daemon', 'start'])).code).toBe(0);

        expect(await snapshotAsync('show')).toMatchObject({ initialized: false });
        expect(fs.existsSync(path.join(folder, 'runs.txt'))).toBe(false);
        expect((await invokeAsync(['daemon', 'graph', 'watch'])).code).toBe(1);
        expect(fs.existsSync(path.join(folder, 'runs.txt'))).toBe(false);
      }),
    30000
  );

  it(
    'provides presentation-free graph controls without implicitly executing scheduled work',
    () =>
      runWithFixtureAsync(async ({ folder, environment, invokeAsync, snapshotAsync }) => {
        environment.RUSH_DAEMON_EXPERIMENTAL = '1';
        expect((await invokeAsync(['build', '--to', 'b', '--parallelism', '3'])).code).toBe(0);
        expect(await snapshotAsync('scope-out', '--project', 'a')).toMatchObject({
          operations: [{ enabled: false }, { enabled: false }]
        });
        expect(await snapshotAsync('scope-in', '--operation', 'b (compile)')).toMatchObject({
          operations: [{ enabled: true }, { enabled: true, dependencyIds: ['a (compile)'] }]
        });
        expect(await snapshotAsync('pause')).toMatchObject({ pauseNextIteration: true });
        expect(await snapshotAsync('invalidate', '--project', 'a')).toMatchObject({
          hasScheduledIteration: false,
          operations: [{ status: 'READY' }, { status: 'SUCCESS' }]
        });
        expect(await snapshotAsync('resume')).toMatchObject({ pauseNextIteration: false });
        expect(await snapshotAsync('status')).toMatchObject({ initialized: true });
        expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe('a:one\nb:one\n');
      }),
    30000
  );

  it(
    'rejects invalid graph commands without native fallback or executing work',
    () =>
      runWithFixtureAsync(async ({ folder, environment, invokeAsync }) => {
        environment.RUSH_DAEMON_EXPERIMENTAL = '1';
        expect((await invokeAsync(['build', '--to', 'b'])).code).toBe(0);
        for (const args of [['invalid'], ['scope-out', '--project', 'missing'], ['pause', 'invalid']]) {
          const result = await invokeAsync(['daemon', 'graph', ...args]);
          expect(result.code).toBe(1);
          expect(result.stderr).toBe('');
          expect(JSON.parse(result.stdout)).toMatchObject({ kind: 'requestRejected' });
        }
        expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe('a:one\nb:one\n');
      }),
    30000
  );

  it(
    'streams graph changes and gracefully cancels through the CLI signal handler',
    () =>
      runWithFixtureAsync(async ({ folder, environment, invokeAsync, snapshotAsync, trackWatch }) => {
        environment.RUSH_DAEMON_EXPERIMENTAL = '1';
        expect((await invokeAsync(['build', '--to', 'b'])).code).toBe(0);
        const entry: string = path.resolve(
          __dirname,
          process.platform === 'win32' ? 'CliSignalTestProcess.js' : '../../bin/rush-client'
        );
        const watch = spawn(process.execPath, [entry, 'daemon', 'graph', 'watch'], {
          cwd: folder,
          env: environment,
          stdio: process.platform === 'win32' ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe']
        });
        const closed = once(watch, 'close');
        trackWatch(watch, closed);
        let output: string = '';
        let errors: string = '';
        watch.stderr!.on('data', (bytes: Buffer) => {
          errors += bytes.toString();
        });
        const ready = new Promise<void>((resolve) => {
          watch.stdout!.on('data', (bytes: Buffer) => {
            output += bytes.toString();
            if (output.includes('\n')) resolve();
          });
        });
        try {
          await Promise.race([
            ready,
            closed.then(() => {
              throw new Error(`Graph watch exited before its first snapshot: ${errors}`);
            })
          ]);
          expect(await snapshotAsync('scope-out', '--project', 'a')).toMatchObject({
            operations: [{ enabled: false }, { enabled: false }]
          });
          if (process.platform === 'win32') watch.send('SIGINT');
          else watch.kill('SIGINT');
          expect(await closed).toEqual([130, null]);
          expect(errors).toBe('');
          const records = output
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line));
          expect(records[0]).toMatchObject({ type: 'extension', payload: { name: RUSHD_GRAPH_SNAPSHOT } });
          expect(records.at(-1)).toMatchObject({
            kind: 'requestResult',
            payload: { outcome: 'aborted', exitCode: 130 }
          });
          expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe('a:one\nb:one\n');
        } finally {
          if (watch.exitCode === null && watch.signalCode === null) watch.kill('SIGTERM');
          await closed;
        }
      }),
    30000
  );

  describe('after observing cold and warm policy through CLI status', () => {
    let previousPid: number;
    let previousGeneration: number;
    let previousGenerationToken: string;
    beforeEach(
      () =>
        runWithFixtureAsync(async ({ folder, environment, invokeAsync }) => {
          delete environment.RUSH_DAEMON_WATCH;
          delete environment.RUSH_DAEMON_WARM_SET_MAX_PROJECTS;
          const started: IResult = await invokeAsync(['daemon', 'start']);
          expect(started.code).toBe(0);
          const cold = JSON.parse(started.stdout);
          expect(cold.workspace).toMatchObject({
            graphInitialized: false,
            generationToken: expect.any(String),
            lastReloadTier: 0
          });
          expect(cold.workspace.warmSet).toBeUndefined();
          expect(fs.existsSync(path.join(folder, 'runs.txt'))).toBe(false);
          expect((await invokeAsync(['build', '--to', 'b'])).code).toBe(0);
          const warmStatus: IResult = await invokeAsync(['daemon', 'status']);
          expect(warmStatus.code).toBe(0);
          const warm = JSON.parse(warmStatus.stdout);
          expect(warm.workspace).toMatchObject({
            graphInitialized: true,
            warmSet: {
              configuration: { watch: false },
              maintenanceState: 'running',
              watchedProjectNames: [],
              retainedProjectNames: expect.any(Array),
              daemonResidentMemoryBytes: expect.any(Number)
            }
          });
          previousPid = warm.pid;
          previousGeneration = warm.workspace.generation;
          previousGenerationToken = warm.workspace.generationToken;
        }),
      30000
    );

    it(
      'reports live warm policy and reload generations through ordinary CLI status without running work',
      () =>
        runWithFixtureAsync(async ({ folder, invokeAsync }) => {
          const rushJsonPath: string = path.join(folder, 'rush.json');
          const config = JSON.parse(fs.readFileSync(rushJsonPath, 'utf8'));
          fs.writeFileSync(
            rushJsonPath,
            JSON.stringify({
              ...config,
              daemon: { ...config.daemon, watch: true, warmSetMaxProjects: 1 }
            })
          );
          expect((await invokeAsync(['build', '--to', 'b'])).code).toBe(0);
          const runsBefore: string = fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8');
          const reloadedStatus: IResult = await invokeAsync(['daemon', 'status']);
          expect(reloadedStatus.code).toBe(0);
          const reloaded = JSON.parse(reloadedStatus.stdout);
          expect(reloaded.pid).toBe(previousPid);
          expect(reloaded.workspace.generation).toBeGreaterThan(previousGeneration);
          expect(reloaded.workspace.generationToken).not.toBe(previousGenerationToken);
          expect(reloaded.workspace).toMatchObject({
            lastReloadTier: 1,
            graphInitialized: true,
            warmSet: { configuration: { watch: true, warmSetMaxProjects: 1 } }
          });
          expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe(runsBefore);
        }),
      30000
    );
  });

  it(
    'runs the genuine preview-selected engine without rewriting the configured Rush version',
    () =>
      runWithFixtureAsync(async ({ folder, environment, invokeAsync }) => {
        const rushJsonPath: string = path.join(folder, 'rush.json');
        const configured = JSON.parse(fs.readFileSync(rushJsonPath, 'utf8'));
        const original: string = JSON.stringify({ ...configured, rushVersion: '5.178.1' });
        fs.writeFileSync(rushJsonPath, original);
        environment.RUSH_PREVIEW_VERSION = Rush.version;
        const result: IResult = await invokeAsync(['build', '--to', 'b', '--verbose']);
        expect(result.code).toBe(0);
        expect(result.stderr).not.toMatch(/using in-process/i);
        expect(result.stdout).toContain('built-a-one');
        expect(result.stdout).toContain('built-b-one');
        expect(fs.readFileSync(rushJsonPath, 'utf8')).toBe(original);
        const status: IResult = await invokeAsync(['daemon', 'status']);
        expect(status.code).toBe(0);
        const initialPid: number = JSON.parse(status.stdout).pid;
        expect((await invokeAsync(['daemon', 'restart'])).code).toBe(0);
        expect(JSON.parse((await invokeAsync(['daemon', 'status'])).stdout).pid).not.toBe(initialPid);
      }),
    30000
  );

  describe('after an initial native build', () => {
    const argv: string[] = ['build', '--to', 'b', '--verbose'];
    let previousPid: number;
    beforeEach(
      () =>
        runWithFixtureAsync(async ({ invokeAsync }) => {
          expect((await invokeAsync(argv)).code).toBe(0);
          previousPid = JSON.parse((await invokeAsync(['daemon', 'status'])).stdout).pid;
        }),
      30000
    );

    it(
      'transparently replaces a hard-input generation and executes the original request exactly once',
      () =>
        runWithFixtureAsync(async ({ folder, environment, invokeAsync }) => {
          environment.RUSHD_TEST_RESTART_VALUE = 'new-process-environment';
          fs.writeFileSync(path.join(folder, 'a/input.txt'), 'two');
          const changed: IResult = await invokeAsync(argv);
          expect(changed.code).toBe(0);
          expect(changed.stderr).not.toMatch(/using in-process/i);
          expect(changed.stdout).toContain('built-a-two');
          const after = JSON.parse((await invokeAsync(['daemon', 'status'])).stdout);
          expect(after.pid).not.toBe(previousPid);
          // One line names the variable that differed, never its value.
          expect(changed.stderr).toContain(
            `rush-client: A command restarted the daemon (PID ${after.pid}) because its environment differs ` +
              "from the daemon's in RUSHD_TEST_RESTART_VALUE.\n"
          );
          expect(changed.stderr.match(/restarted the daemon/g)).toHaveLength(1);
          expect(changed.stderr).not.toContain('new-process-environment');
          expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe('a:one\nb:one\na:two\nb:one\n');
          expect((await invokeAsync(argv)).code).toBe(0);
          expect(JSON.parse((await invokeAsync(['daemon', 'status'])).stdout).pid).toBe(after.pid);
          expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe('a:one\nb:one\na:two\nb:one\n');
        }),
      45000
    );

    it.each(['legacy', 'agent'] as const)(
      'says why the daemon restarted and runs in-process when the daemon that replaces it does not start (%s output)',
      (output) =>
        runWithFixtureAsync(async ({ folder, environment, invokeAsync }) => {
          // Only the daemon's launch fails; the client and the helper that starts the daemon still run.
          const refusePath: string = path.join(folder, 'refuse-daemon-launch.cjs');
          fs.writeFileSync(
            refusePath,
            "if (process.argv.some((arg) => arg.endsWith('SelectedDaemonBootstrap.js')) && " +
              "process.argv.includes('--launch')) process.exit(3);\n"
          );
          environment.RUSHD_OUTPUT = output;
          environment.NODE_OPTIONS = `--require ${JSON.stringify(refusePath)}`;
          const fallback: IResult = await invokeAsync(argv);
          delete environment.NODE_OPTIONS;
          delete environment.RUSHD_OUTPUT;
          // The restart happens before the build starts, so running it in-process repeats no work.
          expect(fallback.code).toBe(0);
          const cause: string =
            "A command restarted the daemon because its environment differs from the daemon's in NODE_OPTIONS; " +
            'the restarted daemon did not start: ';
          // One line gives the cause; the indented lines after it quote the launcher log.
          expect(fallback.stderr).toMatch(
            new RegExp(`^rush-client: ${escapeRegExp(cause)}[^\\n]+; using in-process Rush\\.\\n`, 'm')
          );
          expect(fallback.stderr).toContain('  Last launcher log lines:\n');
          expect(fallback.stderr).toContain('Launcher exited (3) before protocol readiness');
          expect(fallback.stdout).toContain('These operations were already up to date:');
          expect(`${fallback.stdout}${fallback.stderr}`).not.toContain('restarted the daemon (PID');
          expect(fallback.stderr).not.toContain('refuse-daemon-launch');
          expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe('a:one\nb:one\n');
        }),
      45000
    );
  });

  (process.platform === 'linux' ? it : it.skip)(
    'stops the operations that a crashed daemon left running before it builds without the daemon',
    () =>
      runWithFixtureAsync(async ({ folder, paths, invokeAsync }) => {
        const { daemonPid, operationPid } = await startCrashedDaemonAsync(paths);
        try {
          expect(isOperationRunning(operationPid)).toBe(true);
          const native: IResult = await invokeAsync(['--no-daemon', 'build']);
          expect(native.code).toBe(0);
          expectOneReclaimLine(native, daemonPid, 'stderr');
          expect(isOperationRunning(operationPid)).toBe(false);
          expect(fs.existsSync(paths.lockfilePath)).toBe(false);
          expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe('a:one\nb:one\n');
        } finally {
          // Only the operation process that this test started, not a process that reused its PID.
          if (isOperationRunning(operationPid)) process.kill(operationPid, 'SIGKILL');
        }
      }),
    30000
  );

  (process.platform === 'linux' ? it : it.skip).each([
    { output: 'legacy', stream: 'stderr' },
    { output: 'agent', stream: 'stdout' }
  ] as const)(
    'stops the operations that a crashed daemon left running before it starts the next daemon ($output output)',
    ({ output, stream }) =>
      runWithFixtureAsync(async ({ folder, paths, environment, invokeAsync }) => {
        environment.RUSHD_OUTPUT = output;
        const { daemonPid, operationPid } = await startCrashedDaemonAsync(paths);
        try {
          const served: IResult = await invokeAsync(['build']);
          expect(served.code).toBe(0);
          expect(served.stderr).not.toMatch(/using in-process/i);
          expectOneReclaimLine(served, daemonPid, stream);
          expect(isOperationRunning(operationPid)).toBe(false);
          expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe('a:one\nb:one\n');
          expect(JSON.parse((await invokeAsync(['daemon', 'status'])).stdout).pid).not.toBe(daemonPid);
        } finally {
          if (isOperationRunning(operationPid)) process.kill(operationPid, 'SIGKILL');
        }
      }),
    30000
  );

  (process.platform === 'linux' ? it : it.skip)(
    'says rushx-client when rushx stops the operations that a crashed daemon left running',
    () =>
      runWithFixtureAsync(async ({ paths, invokeAsync }) => {
        const { daemonPid, operationPid } = await startCrashedDaemonAsync(paths);
        try {
          const script: IResult = await invokeAsync(['build'], true);
          expect(script.code).toBe(0);
          expect(script.stderr).not.toMatch(/using in-process/i);
          expect(script.stdout).toContain('rushx-only');
          expectOneReclaimLine(script, daemonPid, 'stderr', 'rushx-client');
          expect(isOperationRunning(operationPid)).toBe(false);
        } finally {
          if (isOperationRunning(operationPid)) process.kill(operationPid, 'SIGKILL');
        }
      }),
    30000
  );

  (process.platform === 'linux' ? it : it.skip)(
    'stops the operations that a crashed daemon left running when "daemon start" starts the next daemon',
    () =>
      runWithFixtureAsync(async ({ paths, invokeAsync }) => {
        const { daemonPid, operationPid } = await startCrashedDaemonAsync(paths);
        try {
          const started: IResult = await invokeAsync(['daemon', 'start']);
          expect(started.code).toBe(0);
          expectOneReclaimLine(started, daemonPid, 'stderr');
          expect(isOperationRunning(operationPid)).toBe(false);
        } finally {
          if (isOperationRunning(operationPid)) process.kill(operationPid, 'SIGKILL');
        }
      }),
    30000
  );

  (process.platform === 'linux' ? it : it.skip)(
    'stops the operations that a crashed daemon left running when "daemon stop --force" removes its files',
    () =>
      runWithFixtureAsync(async ({ paths, invokeAsync }) => {
        const { daemonPid, operationPid } = await startCrashedDaemonAsync(paths);
        try {
          const reset: IResult = await invokeAsync(['daemon', 'stop', '--force']);
          expect(reset.code).toBe(0);
          expectOneReclaimLine(reset, daemonPid, 'stderr');
          expect(isOperationRunning(operationPid)).toBe(false);
          expect(JSON.parse(reset.stdout)).toEqual({
            state: 'reset',
            socketPath: paths.socketPath,
            removedPaths: [paths.lockfilePath],
            orphansReaped: [{ daemonPid, processGroupIds: [daemonPid], outcome: 'terminated' }]
          });
          // Nothing that the record led to is left, so a second reset stops and removes nothing.
          const again: IResult = await invokeAsync(['daemon', 'stop', '--force']);
          expect(again).toMatchObject({ code: 0, stderr: '' });
          expect(JSON.parse(again.stdout)).toEqual({
            state: 'notRunning',
            socketPath: paths.socketPath,
            removedPaths: []
          });
        } finally {
          if (isOperationRunning(operationPid)) process.kill(operationPid, 'SIGKILL');
        }
      }),
    30000
  );

  (process.platform === 'linux' ? it : it.skip)(
    'stops the operations that a daemon left running when it exits after it acknowledges "daemon stop --force"',
    () =>
      runWithFixtureAsync(async ({ paths, invokeAsync }) => {
        const { daemon, operationPid } = await startShutdownExitDaemonAsync(paths);
        const daemonPid: number = daemon.pid!;
        try {
          const stopped: IResult = await invokeAsync(['daemon', 'stop', '--force']);
          expect(stopped.code).toBe(0);
          expectOneReclaimLine(stopped, daemonPid, 'stderr');
          expect(isOperationRunning(operationPid)).toBe(false);
          expect(JSON.parse(stopped.stdout)).toEqual({
            state: 'shutdownAccepted',
            socketPath: paths.socketPath,
            removedPaths: [paths.lockfilePath, paths.socketPath],
            orphansReaped: [{ daemonPid, processGroupIds: [daemonPid], outcome: 'terminated' }]
          });
        } finally {
          // Node signals the stand-in only until it is reaped, so never a process that reused its PID.
          daemon.kill('SIGKILL');
          if (isOperationRunning(operationPid)) process.kill(operationPid, 'SIGKILL');
        }
      }),
    30000
  );

  it(
    'cancels a build whose output reader exits, as `head` does, and exits with 141',
    () =>
      runWithFixtureAsync(async ({ folder, environment, trackWatch }) => {
        // An operation that writes a line every 20 ms for 20 s.
        fs.writeFileSync(
          path.join(folder, 'a/build.cjs'),
          "let n=0;const t=setInterval(()=>{console.log('tick-'+ ++n);if(n===1000)clearInterval(t);},20);"
        );
        const client = spawn(
          process.execPath,
          [path.resolve(__dirname, '../../bin/rush-client'), 'build', '--to', 'a', '--verbose'],
          { cwd: folder, env: environment, stdio: ['ignore', 'pipe', 'pipe'] }
        );
        const closed = once(client, 'close');
        trackWatch(client, closed);
        let errors: string = '';
        client.stderr!.on('data', (bytes: Buffer) => {
          errors += bytes.toString();
        });
        let output: string = '';
        // Stops reading once the operation's output arrives, as `head -5` does.
        const read = new Promise<void>((resolve) => {
          client.stdout!.on('data', (bytes: Buffer) => {
            output += bytes.toString();
            if (output.includes('tick-')) {
              client.stdout!.destroy();
              resolve();
            }
          });
        });
        try {
          await Promise.race([
            read,
            closed.then(() => {
              throw new Error(`The build ended before its output arrived: ${errors}`);
            })
          ]);
          expect(await closed).toEqual([141, null]);
          // A socket (here) may report ECONNRESET where a shell's pipe reports EPIPE.
          expect(
            errors.split('\n').filter((line) => /cancel|connection|EPIPE|ECONNRESET/i.test(line))
          ).toEqual([
            expect.stringMatching(
              /^rush-client: build cancelled, because the process reading its stdout exited \((EPIPE|ECONNRESET)\)\.$/
            )
          ]);
        } finally {
          if (client.exitCode === null && client.signalCode === null) client.kill('SIGTERM');
          await closed;
        }
      }),
    30000
  );
});
