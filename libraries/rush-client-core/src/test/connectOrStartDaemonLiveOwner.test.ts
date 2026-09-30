// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { captureDaemonRequest } from '../captureDaemonRequest';
import { DaemonClientError } from '../DaemonClientError';
import { LiveDaemonOwnerError } from '../DaemonOwnerDiagnosis';
import { describeLiveDaemonOwner, resetDaemonArtifactsAsync } from '../DaemonOwnership';
import { DaemonStartupPendingError, connectOrAwaitDaemonStartupAsync } from '../connectOrAwaitDaemonStartup';
import type { IConnectOrStartDaemonOptions } from '../connectOrStartDaemon';
import { STOPPED_OWNER_WINDOW_MS, isDaemonOwnerStoppedAsync } from '../StoppedDaemonOwner';
import { recordDaemonOwner } from './OrphanedOperation';
import { removeTestFolderAsync, waitForTestProcessExitAsync } from './TestProcessExit';

const NOT_RUN_IN_PROCESS: string =
  'Rush was not run in-process, where it would compete with that daemon for the repository.';

/** Listens as rushd does, with the paths in its last argument, and never answers. */
const FAKE_DAEMON_SCRIPT: string = [
  'const [transport, protocol, paths] = process.argv.slice(2);',
  'require(transport)',
  '  .DaemonFrameListener.listenAsync(JSON.parse(paths), {',
  '    protocolVersion: require(protocol).DAEMON_PROTOCOL_VERSION,',
  '    onConnection: () => undefined',
  '  })',
  "  .then(() => console.log('listening'));",
  ''
].join('\n');

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  return await promise.then(
    () => new Error('Expected a rejection.'),
    (error: Error) => error
  );
}

function readState(pid: number): string | undefined {
  const stat: string = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  return stat.slice(stat.lastIndexOf(')') + 2)[0];
}

/** Field 22 of `/proc/<pid>/stat`: when the process started, in clock ticks after boot. */
function readStartTicks(pid: number): number {
  const stat: string = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]);
}

async function waitForStateAsync(pid: number, code: string): Promise<void> {
  const deadline: number = Date.now() + 5000;
  while (readState(pid) !== code) {
    if (Date.now() >= deadline) throw new Error(`PID ${pid} did not reach state ${code}.`);
    await delayAsync(10);
  }
}

async function waitForFileAsync(filePath: string): Promise<void> {
  const deadline: number = Date.now() + 10000;
  while (!fs.existsSync(filePath)) {
    if (Date.now() >= deadline) throw new Error(`${filePath} was not written.`);
    await delayAsync(10);
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Unlinks the sockets that killed daemons left in `folder`, without a stat: after a plain stat of a socket, which
 * removing the folder would make, the next `require()` in this process could fail to find a package's dependencies
 * (nodejs/node#65113).
 */
function unlinkSockets(folder: string): void {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.isSocket()) fs.unlinkSync(path.join(folder, entry.name));
  }
}

// A file of its own, since connectOrStartDaemon.test.ts is close to the 2,000-line max-lines limit. It needs
// /proc to tell what the live owner is doing.
(process.platform === 'linux' ? describe : describe.skip)('a live daemon owner that does not answer', () => {
  let folder: string;
  let paths: IDaemonPaths;
  let options: IConnectOrStartDaemonOptions;
  let children: ChildProcess[];

  beforeEach(() => {
    children = [];
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-live-owner-'));
    paths = {
      runtimeDir: folder,
      socketPath: path.join(folder, 'd.sock'),
      lockfilePath: path.join(folder, 'daemon.pid.json')
    };
    const environment = captureDaemonRequest({
      argv: [],
      commandName: 'test',
      commandOrigin: 'custom',
      cwd: folder,
      environment: { PATH: process.env.PATH },
      terminal: { isTTY: false, supportsColor: false }
    }).environment;
    options = {
      paths,
      expectedDaemonVersion: 'fixture',
      startupTimeoutMs: 1500,
      timeoutMs: 200,
      startCommand: {
        command: process.execPath,
        args: [path.join(__dirname, 'fixtures/daemon.js'), JSON.stringify(paths)],
        cwd: folder,
        environment
      }
    };
  });

  afterEach(async () => {
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      // Only this test's own children, by their PIDs: resume a stopped one so that it can exit.
      process.kill(child.pid!, 'SIGCONT');
      child.kill('SIGKILL');
      await waitForTestProcessExitAsync(child.pid!);
    }
    // No daemon was started or replaced.
    expect(fs.existsSync(path.join(folder, 'starts'))).toBe(false);
    unlinkSockets(folder);
    await removeTestFolderAsync(folder);
  });

  /**
   * A process whose command line looks like rushd's, which listens as rushd does with `daemonPaths` (by default
   * this workspace's), but never answers: it binds its socket under a private name, links the endpoint to it,
   * then writes its ownership record and keeps it open. Its listen backlog accepts connections even while a
   * signal stops it.
   */
  async function startFakeDaemonAsync(daemonPaths: IDaemonPaths = paths): Promise<number> {
    const script: string = path.join(folder, 'rush-daemon', 'fake.js');
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, FAKE_DAEMON_SCRIPT);
    const child: ChildProcess = await startChildAsync(process.execPath, [
      script,
      require.resolve('@rushstack/rush-daemon-transport'),
      require.resolve('@rushstack/rush-daemon-protocol'),
      JSON.stringify(daemonPaths)
    ]);
    await once(child.stdout!, 'data');
    return child.pid!;
  }

  /** The paths of another workspace's daemon, in the same runtime folder. */
  function getOtherWorkspacePaths(): IDaemonPaths {
    return {
      runtimeDir: folder,
      socketPath: path.join(folder, 'other.sock'),
      lockfilePath: path.join(folder, 'other.pid.json')
    };
  }

  async function startChildAsync(command: string, args: string[]): Promise<ChildProcess> {
    const child: ChildProcess = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    children.push(child);
    await once(child, 'spawn');
    return child;
  }

  async function stopChildAsync(pid: number): Promise<void> {
    process.kill(pid, 'SIGSTOP');
    await waitForStateAsync(pid, 'T');
  }

  function resumeHint(pid: number): string {
    return `Resume it with "kill -CONT ${pid}"; it then serves the next command.`;
  }

  it('says that a signal stopped the daemon and how to resume it, without running Rush in-process', async () => {
    const pid: number = await startFakeDaemonAsync();
    await stopChildAsync(pid);
    const onAwaitStartup: jest.Mock = jest.fn();

    // A deadline shorter than the 1.5 s for which a client samples a stopped daemon leaves no time to sample
    // it, so this waits for two such deadlines, as a client did before it sampled.
    const error: Error = await rejectionOf(
      connectOrAwaitDaemonStartupAsync({ ...options, startupTimeoutMs: 1000, onAwaitStartup })
    );

    expect(error).toBeInstanceOf(DaemonStartupPendingError);
    expect(error).not.toBeInstanceOf(DaemonClientError);
    expect(error.cause).toBeInstanceOf(LiveDaemonOwnerError);
    expect(error.message).toMatch(
      new RegExp(
        `^The daemon, rushd \\(PID ${pid}\\), did not answer at ${escapeRegExp(paths.socketPath)}: it is stopped \\(state T\\), for example by SIGSTOP, and it started \\d+ s ago\\.\\n${escapeRegExp(NOT_RUN_IN_PROCESS)}\\n`
      )
    );
    expect(error.message.split('\n')[2]).toBe(resumeHint(pid));
    expect((error.cause as LiveDaemonOwnerError).stoppedProcess).toBeUndefined();
    expect(onAwaitStartup.mock.calls).toEqual([
      [`A process listens at ${paths.socketPath} but was not ready in time`, expect.any(Number)]
    ]);
    expect(readState(pid)).toBe('T');
  }, 30000);

  it('stops waiting for a daemon that stays stopped, without running Rush in-process', async () => {
    const pid: number = await startFakeDaemonAsync();
    await stopChildAsync(pid);
    const onAwaitStartup: jest.Mock = jest.fn();
    const start: number = Date.now();

    const error: Error = await rejectionOf(
      connectOrAwaitDaemonStartupAsync({
        ...options,
        startupTimeoutMs: 15000,
        timeoutMs: 2000,
        onAwaitStartup
      })
    );

    // The first connection attempt times out after 2 s, and the 1.5 s for which the client samples the daemon
    // overlap it. Sampling after that attempt would take about 3.5 s; not sampling, two 15 s deadlines.
    const elapsedMs: number = Date.now() - start;
    expect(elapsedMs).toBeGreaterThanOrEqual(STOPPED_OWNER_WINDOW_MS);
    expect(elapsedMs).toBeLessThan(3000);
    expect(error).toBeInstanceOf(DaemonStartupPendingError);
    expect(error.cause).toBeInstanceOf(LiveDaemonOwnerError);
    expect((error.cause as LiveDaemonOwnerError).stoppedProcess).toEqual({
      pid,
      startTicks: readStartTicks(pid)
    });
    expect(error.message).toMatch(
      new RegExp(
        `^The daemon, rushd \\(PID ${pid}\\), did not answer at ${escapeRegExp(paths.socketPath)}: it is stopped \\(state T\\), for example by SIGSTOP, and it started \\d+ s ago\\.\\n${escapeRegExp(NOT_RUN_IN_PROCESS)}\\n${escapeRegExp(resumeHint(pid))}$`
      )
    );
    expect(onAwaitStartup).not.toHaveBeenCalled();
    expect(readState(pid)).toBe('T');
  }, 30000);

  it('stops waiting once a signal stops the daemon that it waits for', async () => {
    const pid: number = await startFakeDaemonAsync();
    const onAwaitStartup: jest.Mock = jest.fn();
    const start: number = Date.now();

    const rejected: Promise<Error> = rejectionOf(
      connectOrAwaitDaemonStartupAsync({ ...options, startupTimeoutMs: 10000, onAwaitStartup })
    );
    await delayAsync(500);
    await stopChildAsync(pid);
    const error: Error = await rejected;

    // Well before its first 10 s deadline.
    expect(Date.now() - start).toBeLessThan(7000);
    expect(error).toBeInstanceOf(DaemonStartupPendingError);
    expect((error.cause as LiveDaemonOwnerError).stoppedProcess).toEqual({
      pid,
      startTicks: readStartTicks(pid)
    });
    expect(error.message.split('\n')[2]).toBe(resumeHint(pid));
    expect(onAwaitStartup).not.toHaveBeenCalled();
  }, 30000);

  it('keeps waiting for another client that holds the start mutex while the owner stays stopped', async () => {
    const pid: number = await startFakeDaemonAsync();
    await stopChildAsync(pid);
    // The daemon still runs, with its record open, but nothing listens at the endpoint.
    fs.unlinkSync(paths.socketPath);
    await startChildAsync(process.execPath, [
      path.join(__dirname, 'fixtures/startLockHolder.js'),
      JSON.stringify(paths)
    ]);
    await waitForFileAsync(path.join(folder, 'lock-held'));
    const onAwaitStartup: jest.Mock = jest.fn();
    const start: number = Date.now();

    const error: Error = await rejectionOf(
      connectOrAwaitDaemonStartupAsync({ ...options, startupTimeoutMs: 3000, onAwaitStartup })
    );

    // Only a stopped owner at the endpoint ends the wait early: that client may still start a daemon.
    expect(Date.now() - start).toBeGreaterThanOrEqual(STOPPED_OWNER_WINDOW_MS + 2500);
    expect(error).toBeInstanceOf(DaemonStartupPendingError);
    expect(error.message).toContain(
      'Another client is still starting the daemon, so Rush was not run in-process'
    );
    expect(onAwaitStartup.mock.calls).toEqual([
      ['Another client is still starting the daemon', expect.any(Number)]
    ]);
    fs.writeFileSync(path.join(folder, 'release-lock'), '');
  }, 30000);

  it('keeps waiting while the stopped process that the record names does not have the record open', async () => {
    // This process listens at the endpoint without answering. The process that this workspace's record names,
    // stopped, is another workspace's daemon, which has only its own record open.
    const server: net.Server = net.createServer((socket: net.Socket) => socket.on('error', () => undefined));
    server.listen(paths.socketPath);
    await once(server, 'listening');
    try {
      const pid: number = await startFakeDaemonAsync(getOtherWorkspacePaths());
      await stopChildAsync(pid);
      recordDaemonOwner(paths, pid);
      const onAwaitStartup: jest.Mock = jest.fn();

      const error: Error = await rejectionOf(
        connectOrAwaitDaemonStartupAsync({ ...options, startupTimeoutMs: 3000, onAwaitStartup })
      );

      expect(error).toBeInstanceOf(DaemonStartupPendingError);
      expect(error.message).toMatch(
        new RegExp(
          `^The daemon did not answer at ${escapeRegExp(paths.socketPath)}, and its ownership record names rushd \\(PID ${pid}\\): it is stopped \\(state T\\)`
        )
      );
      expect((error.cause as LiveDaemonOwnerError).stoppedProcess).toBeUndefined();
      expect(onAwaitStartup).toHaveBeenCalledTimes(1);
    } finally {
      server.close();
    }
  }, 30000);

  it('does not run Rush in-process beside a daemon that lost its socket', async () => {
    const pid: number = await startFakeDaemonAsync();
    // The daemon still runs, with its record open, but no client can reach it.
    fs.unlinkSync(paths.socketPath);
    const onAwaitStartup: jest.Mock = jest.fn();

    const error: Error = await rejectionOf(connectOrAwaitDaemonStartupAsync({ ...options, onAwaitStartup }));

    // Nothing can make the daemon ready, but it still runs, so the caller must not run Rush in-process.
    expect(error).toBeInstanceOf(DaemonStartupPendingError);
    expect(error.cause).toBeInstanceOf(LiveDaemonOwnerError);
    expect(error.message).toMatch(
      new RegExp(
        `^The daemon, rushd \\(PID ${pid}\\), did not answer at ${escapeRegExp(paths.socketPath)}: its socket is missing, so no client can reach it; it is (waiting|running) \\(state [SR]\\), and it started \\d+ s ago\\.\\n${escapeRegExp(NOT_RUN_IN_PROCESS)}\\n`
      )
    );
    expect(error.message.split('\n')[2]).toBe(
      `It may exit on its own once its running requests finish; "kill ${pid}" asks it to cancel them and exit. The next command then starts a new daemon.`
    );
    expect(onAwaitStartup).not.toHaveBeenCalled();
    expect(readDaemonRecordPid()).toBe(pid);
  }, 30000);

  it("names no signal to send to a daemon that does not have this workspace's record open", async () => {
    // For example the daemon of another workspace, whose PID an old record of this workspace names: it has only its
    // own record open. Nothing shows that it is this workspace's daemon, so the caller may run Rush in-process.
    const pid: number = await startFakeDaemonAsync(getOtherWorkspacePaths());
    await stopChildAsync(pid);
    recordDaemonOwner(paths, pid);

    const error: Error = await rejectionOf(connectOrAwaitDaemonStartupAsync(options));

    expect(error).toBeInstanceOf(LiveDaemonOwnerError);
    expect(error.message).toMatch(
      new RegExp(
        `^The daemon did not answer at ${escapeRegExp(paths.socketPath)}, and its ownership record names rushd \\(PID ${pid}\\): its socket is missing, so no client can reach it; it is stopped \\(state T\\), for example by SIGSTOP, and it started \\d+ s ago\\.\\n`
      )
    );
    expect(error.message.split('\n')[1]).toBe(
      `It may be busy, stopped or shutting down, or not this workspace's daemon; "rush-client daemon logs" shows the daemon's last lines. If it is this workspace's daemon, end that process; if it is not, delete ${paths.lockfilePath}. Either way, the next command then starts a new daemon. Until then, each command that uses the daemon first waits 15 s for a daemon to answer.`
    );
    expect(readState(pid)).toBe('T');
  }, 30000);

  it('names the parent that has not reaped an owner that exited', async () => {
    // "sleep 0" exits at once, and the shell, now "sleep 600", never reaps it.
    const parent: ChildProcess = await startChildAsync('sh', ['-c', 'sleep 0 & echo $!; exec sleep 600']);
    const [output] = await once(parent.stdout!, 'data');
    const zombie: number = Number(String(output));
    await waitForStateAsync(zombie, 'Z');
    recordDaemonOwner(paths, zombie);

    const error: Error = await rejectionOf(connectOrAwaitDaemonStartupAsync(options));

    expect(error).toBeInstanceOf(LiveDaemonOwnerError);
    expect(error.message).toMatch(
      new RegExp(
        `^The daemon did not answer at ${escapeRegExp(paths.socketPath)}, and its ownership record names PID ${zombie}: its socket is missing, so no client can reach it; it has exited, but its parent process \\(PID ${parent.pid}\\) has not reaped it \\(state Z\\), and it started \\d+ s ago\\.\\n`
      )
    );
    expect(error.message.split('\n')[1]).toBe(
      `The next command reclaims its files once PID ${parent.pid} reaps it. Until then, each command that uses the daemon first waits 15 s for a daemon to answer.`
    );

    // Once that parent is gone, another process reaps it, and it no longer owns anything.
    const exited: Promise<unknown> = once(parent, 'exit');
    parent.kill('SIGKILL');
    await exited;
    const deadline: number = Date.now() + 5000;
    while (fs.existsSync(`/proc/${zombie}`)) {
      if (Date.now() >= deadline) throw new Error(`PID ${zombie} was not reaped.`);
      await delayAsync(10);
    }
    expect(describeLiveDaemonOwner(paths, 'use')).toBeUndefined();
  }, 30000);

  it('names a process that is not a daemon when a reset refuses to remove its record', async () => {
    const pid: number = (await startChildAsync('sleep', ['600'])).pid!;
    // Just after the spawn event, sleep can still be starting: running, and without its command line yet.
    await waitForStateAsync(pid, 'S');
    recordDaemonOwner(paths, pid);

    const error: Error = await rejectionOf(resetDaemonArtifactsAsync(paths));

    expect(error).toBeInstanceOf(DaemonClientError);
    expect(error.message).toMatch(
      new RegExp(
        `^PID ${pid} \\("sleep 600"\\) still owns ${escapeRegExp(paths.lockfilePath)}: its socket is missing, so no client can reach it; it is waiting \\(state S\\), and it started \\d+ s ago\\. No process was killed\\.\\n`
      )
    );
    expect(error.message.split('\n')[1]).toBe(
      `It does not look like a Rush daemon. If no daemon runs for this workspace, delete ${paths.lockfilePath}; the next command then starts a new daemon. Until then, each command that uses the daemon first waits 15 s for a daemon to answer.`
    );
    expect(readDaemonRecordPid()).toBe(pid);
    expect(readState(pid)).toBe('S');
  });

  it('describes the live owner for a command that could not stop the daemon', async () => {
    expect(describeLiveDaemonOwner(paths, 'stop')).toBeUndefined();
    const pid: number = await startFakeDaemonAsync();
    await stopChildAsync(pid);

    expect(describeLiveDaemonOwner(paths, 'stop')).toMatch(
      new RegExp(
        `^rushd \\(PID ${pid}\\) still owns ${escapeRegExp(paths.lockfilePath)}: it is stopped \\(state T\\), for example by SIGSTOP, and it started \\d+ s ago\\.\\nResume it with "kill -CONT ${pid}", then run "rush-client daemon stop" again\\.$`
      )
    );

    // Nothing to describe once that process is gone (and reaped), or when the record cannot be read.
    const child: ChildProcess = children[0];
    const exited: Promise<unknown> = once(child, 'exit');
    process.kill(pid, 'SIGCONT');
    child.kill('SIGKILL');
    await exited;
    expect(describeLiveDaemonOwner(paths, 'use')).toBeUndefined();
    fs.writeFileSync(paths.lockfilePath, 'not json');
    expect(describeLiveDaemonOwner(paths, 'use')).toBeUndefined();
  });

  it('tells a command that waits for the daemon to exit whether the daemon stays stopped', async () => {
    const pid: number = await startFakeDaemonAsync();
    let start: number = Date.now();

    // The first sample ends the sampling for a daemon that is not stopped.
    expect(await isDaemonOwnerStoppedAsync(paths, start + 15000)).toBe(false);
    expect(Date.now() - start).toBeLessThan(STOPPED_OWNER_WINDOW_MS);

    await stopChildAsync(pid);
    start = Date.now();
    expect(await isDaemonOwnerStoppedAsync(paths, start + 15000)).toBe(true);
    expect(Date.now() - start).toBeGreaterThanOrEqual(STOPPED_OWNER_WINDOW_MS);
    // Too little time before the deadline to sample it.
    expect(await isDaemonOwnerStoppedAsync(paths, Date.now() + STOPPED_OWNER_WINDOW_MS - 100)).toBe(false);
    expect(readState(pid)).toBe('T');
  }, 30000);

  function readDaemonRecordPid(): number {
    return JSON.parse(fs.readFileSync(paths.lockfilePath, 'utf8')).pid;
  }
});
