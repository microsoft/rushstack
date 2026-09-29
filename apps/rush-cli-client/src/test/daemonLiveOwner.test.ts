// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@microsoft/rush/lib/start', () => ({}));

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';
import { writeDaemonLockfile, type IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { executeDaemonCommandAsync } from '../daemonCommands';
import * as connectionOptions from '../daemonConnectionOptions';

function readState(pid: number): string | undefined {
  const stat: string = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  return stat.slice(stat.lastIndexOf(')') + 2)[0];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Removes a test's folder. The sockets that killed daemons left there go first, without a stat: after a plain stat
 * of a socket, which `fs.rmSync` makes, the next `require()` in this process could fail to find a package's
 * dependencies (nodejs/node#65113).
 */
function removeFolder(folder: string): void {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.isSocket()) fs.unlinkSync(path.join(folder, entry.name));
  }
  fs.rmSync(folder, { recursive: true });
}

/** Listens as rushd does, with the paths in its argument, never answers, and exits after the time in the last. */
const FAKE_DAEMON_SCRIPT: string = [
  'const [transport, protocol, paths, exitAfterMs] = process.argv.slice(2);',
  'require(transport)',
  '  .DaemonFrameListener.listenAsync(JSON.parse(paths), {',
  '    protocolVersion: require(protocol).DAEMON_PROTOCOL_VERSION,',
  '    onConnection: () => undefined',
  '  })',
  "  .then(() => console.log('listening'));",
  'setTimeout(() => process.exit(0), Number(exitAfterMs));',
  ''
].join('\n');

// It needs /proc to tell what the live owner is doing.
(process.platform === 'linux' ? describe : describe.skip)(
  'daemon commands and a live owner that does not answer',
  () => {
    let folder: string;
    let paths: IDaemonPaths;
    let children: ChildProcess[];
    let stderr: string[];
    let stdout: string[];

    beforeEach(() => {
      children = [];
      stderr = [];
      stdout = [];
      folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-live-owner-'));
      paths = {
        runtimeDir: folder,
        socketPath: path.join(folder, 'd.sock'),
        lockfilePath: path.join(folder, 'daemon.pid.json')
      };
      fs.writeFileSync(
        path.join(folder, 'rush.json'),
        JSON.stringify({ rushVersion: '5.178.1', pnpmVersion: '10.27.0', projects: [] })
      );
      jest.spyOn(connectionOptions, 'getDaemonConnectionOptionsAsync').mockResolvedValue({ paths });
      for (const [stream, lines] of [
        [process.stderr, stderr],
        [process.stdout, stdout]
      ] as const) {
        jest.spyOn(stream, 'write').mockImplementation(((
          chunk: string | Uint8Array,
          ...rest: unknown[]
        ): boolean => {
          lines.push(Buffer.from(chunk).toString());
          (rest.find((argument) => typeof argument === 'function') as (() => void) | undefined)?.();
          return true;
        }) as typeof stream.write);
      }
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      for (const child of children) {
        if (child.exitCode !== null || child.signalCode !== null) continue;
        const exited: Promise<unknown> = once(child, 'exit');
        // Only this test's own children, by their PIDs: resume a stopped one so that it can exit.
        process.kill(child.pid!, 'SIGCONT');
        child.kill('SIGKILL');
        await exited;
      }
      removeFolder(folder);
    });

    /**
     * A process whose command line looks like rushd's, which listens as rushd does with `daemonPaths` (by
     * default this workspace's), but never answers: it binds its socket under a private name, links the
     * endpoint to it, then writes its ownership record and keeps it open. Its listen backlog accepts
     * connections even while a signal stops it. This workspace's ownership record names it either way.
     */
    async function startFakeDaemonAsync(
      exitAfterMs: number = 600_000,
      daemonPaths: IDaemonPaths = paths
    ): Promise<number> {
      const script: string = path.join(folder, 'rush-daemon', 'fake.js');
      fs.mkdirSync(path.dirname(script), { recursive: true });
      fs.writeFileSync(script, FAKE_DAEMON_SCRIPT);
      const child: ChildProcess = spawn(
        process.execPath,
        [
          script,
          require.resolve('@rushstack/rush-daemon-transport'),
          require.resolve('@rushstack/rush-daemon-protocol'),
          JSON.stringify(daemonPaths),
          String(exitAfterMs)
        ],
        { stdio: ['ignore', 'pipe', 'ignore'] }
      );
      children.push(child);
      await once(child.stdout!, 'data');
      const pid: number = child.pid!;
      if (daemonPaths !== paths) {
        writeDaemonLockfile(paths.lockfilePath, {
          pid,
          protocolVersion: DAEMON_PROTOCOL_VERSION,
          startedAt: new Date().toISOString(),
          socketPath: paths.socketPath
        });
      }
      return pid;
    }

    async function stopChildAsync(pid: number): Promise<void> {
      process.kill(pid, 'SIGSTOP');
      const deadline: number = Date.now() + 5000;
      while (readState(pid) !== 'T') {
        if (Date.now() >= deadline) throw new Error(`PID ${pid} did not stop.`);
        await delayAsync(10);
      }
    }

    async function runAsync(...argv: string[]): Promise<Error | undefined> {
      return await executeDaemonCommandAsync({
        argv,
        environment: {},
        rushJsonPath: path.join(folder, 'rush.json'),
        rushVersion: '5.178.1'
      }).then(
        () => undefined,
        (error: Error) => error
      );
    }

    it('says that a signal stopped the daemon, and how to resume it, for status, stop and stop --force', async () => {
      const pid: number = await startFakeDaemonAsync();
      await stopChildAsync(pid);
      const timeout: string = `Daemon at ${paths.socketPath} did not complete hello/ping readiness within 5000ms.`;
      const description: string = `rushd \\(PID ${pid}\\) still owns ${escapeRegExp(paths.lockfilePath)}: it is stopped \\(state T\\), for example by SIGSTOP, and it started \\d+ s ago\\.`;
      const owner: RegExp = new RegExp(`${description}\\n`);
      const stopHint: string = `Resume it with "kill -CONT ${pid}", then run "rush-client daemon stop" again.`;

      const status: Error | undefined = await runAsync('status');
      expect(status?.message.startsWith(`${timeout} `)).toBe(true);
      expect(status?.message).toMatch(owner);
      expect(status?.message.split('\n')[1]).toBe(
        `Resume it with "kill -CONT ${pid}"; it then serves the next command.`
      );

      const stop: Error | undefined = await runAsync('stop');
      expect(stop?.message.startsWith(`${timeout} `)).toBe(true);
      expect(stop?.message).toMatch(owner);
      expect(stop?.message.split('\n')[1]).toBe(stopHint);

      // Like a reset that a live owner refuses, it says that it killed nothing.
      const forceStop: Error | undefined = await runAsync('stop', '--force');
      expect(forceStop?.message.startsWith(`${timeout} `)).toBe(true);
      expect(forceStop?.message).toMatch(new RegExp(`${description} No process was killed\\.\\n`));
      expect(forceStop?.message.split('\n')[1]).toBe(stopHint);
      expect(readState(pid)).toBe('T');
      expect(stdout).toEqual([]);
    }, 30000);

    it("names no signal to send to a daemon that does not have this workspace's record open", async () => {
      // For example the daemon of another workspace, whose PID an old record of this workspace names: it has
      // only its own record open.
      const pid: number = await startFakeDaemonAsync(600_000, {
        runtimeDir: folder,
        socketPath: path.join(folder, 'other.sock'),
        lockfilePath: path.join(folder, 'other.pid.json')
      });
      await stopChildAsync(pid);

      const status: Error | undefined = await runAsync('status');

      expect(status?.message).toMatch(
        new RegExp(
          ` rushd \\(PID ${pid}\\) still owns ${escapeRegExp(paths.lockfilePath)}: its socket is missing, so no client can reach it; it is stopped \\(state T\\), for example by SIGSTOP, and it started \\d+ s ago\\.\\n`
        )
      );
      expect(status?.message.split('\n')[1]).toBe(
        `It may be busy, stopped or shutting down, or not this workspace's daemon; "rush-client daemon logs" shows the daemon's last lines. If it is this workspace's daemon, end that process; if it is not, delete ${paths.lockfilePath}. Either way, the next command then starts a new daemon.`
      );
      expect(readState(pid)).toBe('T');
      expect(stdout).toEqual([]);
    }, 30000);

    it('waits for a daemon that no longer listens to exit before stop reports that none runs', async () => {
      const pid: number = await startFakeDaemonAsync(1500);
      // It still runs, with its record open, but no client can reach it.
      fs.unlinkSync(paths.socketPath);
      const started: number = Date.now();

      expect(await runAsync('stop')).toBeUndefined();

      expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
      expect(stderr).toHaveLength(1);
      expect(stderr[0]).toMatch(
        new RegExp(
          `^rush-client: Nothing listens at ${escapeRegExp(paths.socketPath)}, but rushd \\(PID ${pid}\\) still owns ${escapeRegExp(paths.lockfilePath)}: its socket is missing, so no client can reach it; it is (waiting|running) \\(state [SR]\\), and it started \\d+ s ago, so stop waits up to 1[34] s for it to exit\\.\\n$`
        )
      );
      expect(JSON.parse(stdout.join(''))).toMatchObject({
        state: 'notRunning',
        socketPath: paths.socketPath
      });
    }, 30000);

    it('fails stop, saying what the daemon is doing, when a daemon that no longer listens does not exit', async () => {
      const pid: number = await startFakeDaemonAsync();
      fs.unlinkSync(paths.socketPath);

      const error: Error | undefined = await runAsync('stop');

      expect(error?.message).toMatch(
        new RegExp(
          `^Nothing listens at ${escapeRegExp(paths.socketPath)}, but rushd \\(PID ${pid}\\) still owns ${escapeRegExp(paths.lockfilePath)}: its socket is missing, so no client can reach it; it is (waiting|running) \\(state [SR]\\), and it started 1\\d s ago\\.\\n`
        )
      );
      expect(error?.message.split('\n')[1]).toBe(
        `It may exit on its own once its running requests finish; "kill ${pid}" asks it to cancel them and exit. The next command then starts a new daemon.`
      );
      expect(stderr).toHaveLength(1);
      expect(stdout).toEqual([]);
    }, 30000);
  }
);
