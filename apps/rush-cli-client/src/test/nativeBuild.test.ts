// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import { DaemonClient } from '@rushstack/rush-client-core';
import { RUSHD_GRAPH_SNAPSHOT } from '@rushstack/rush-daemon-protocol';
import {
  createNativeBuildTestFixture,
  type INativeBuildTestFixture,
  type INativeBuildResult as IResult
} from './NativeBuildTestFixture';

// A pending CLI startup can take 15s; allow its join plus daemon stop/drain and fixture removal.
const NATIVE_FIXTURE_CLEANUP_TIMEOUT_MS: number = 35_000;

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
      30000
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
          expect(changed.stderr).not.toMatch(/using in-process|restart/i);
          expect(changed.stdout).toContain('built-a-two');
          const after = JSON.parse((await invokeAsync(['daemon', 'status'])).stdout);
          expect(after.pid).not.toBe(previousPid);
          expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe('a:one\nb:one\na:two\nb:one\n');
          expect((await invokeAsync(argv)).code).toBe(0);
          expect(JSON.parse((await invokeAsync(['daemon', 'status'])).stdout).pid).toBe(after.pid);
          expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe('a:one\nb:one\na:two\nb:one\n');
        }),
      45000
    );
  });
});
