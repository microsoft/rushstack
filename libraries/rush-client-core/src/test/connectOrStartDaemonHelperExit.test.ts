// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delayAsync } from 'node:timers/promises';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { captureDaemonRequest } from '../captureDaemonRequest';
import { DaemonClient } from '../DaemonClient';
import { connectOrStartDaemonAsync, type IConnectOrStartDaemonOptions } from '../connectOrStartDaemon';
import { trackPendingDelays, type IPendingDelays } from './PendingDelays';
import { removeTestFolderAsync, waitForTestProcessExitAsync } from './TestProcessExit';

function readIfPresent(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

/** Times from `performance.now()`. */
interface IStartupTimeline {
  /** When each connection attempt by this process began. */
  readonly attempts: number[];
  /** How many failed attempts were held open until the startup helper closed. */
  held: number;
  /** When the startup helper that this process spawned closed. */
  helperClosedAt?: number;
}

/**
 * Records a startup timeline until `restore` is called. A connection attempt that begins at least
 * `holdFailedAttemptsAfterMs` after the startup helper spawned, and fails while the helper runs, fails only
 * once the helper has closed.
 */
function recordStartupTimeline(holdFailedAttemptsAfterMs: number = Infinity): {
  timeline: IStartupTimeline;
  restore: () => void;
} {
  const childProcess = jest.requireActual<typeof import('node:child_process')>('node:child_process');
  const originalSpawn: typeof spawn = childProcess.spawn;
  const originalConnectAsync: typeof DaemonClient.connectAsync = DaemonClient.connectAsync;
  const timeline: IStartupTimeline = { attempts: [], held: 0 };
  let helperSpawnedAt: number = Infinity;
  let helperClosed: Promise<void> | undefined;
  const observer = jest.spyOn(childProcess, 'spawn').mockImplementation((command, args, spawnOptions) => {
    const child = originalSpawn(command, args, spawnOptions);
    if (args?.includes(require.resolve('../runDaemonStartup'))) {
      helperSpawnedAt = performance.now();
      // This listener runs before the one that tells the client that the helper closed.
      helperClosed = new Promise<void>((resolve) =>
        child.once('close', () => {
          timeline.helperClosedAt = performance.now();
          resolve();
        })
      );
    }
    return child;
  });
  const connect = jest.spyOn(DaemonClient, 'connectAsync').mockImplementation(async (connectOptions) => {
    const startedAt: number = performance.now();
    timeline.attempts.push(startedAt);
    try {
      return await originalConnectAsync.call(DaemonClient, connectOptions);
    } catch (error) {
      if (
        helperClosed &&
        timeline.helperClosedAt === undefined &&
        startedAt - helperSpawnedAt >= holdFailedAttemptsAfterMs
      ) {
        timeline.held++;
        await helperClosed;
      }
      throw error;
    }
  });
  return {
    timeline,
    restore: () => {
      connect.mockRestore();
      observer.mockRestore();
    }
  };
}

// A file of its own, since connectOrStartDaemon.test.ts is close to the 2,000-line max-lines limit.
describe('detached daemon startup while the startup helper runs', () => {
  let folder: string;
  let paths: IDaemonPaths;
  let options: IConnectOrStartDaemonOptions;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-helper-exit-'));
    paths = {
      runtimeDir: folder,
      socketPath:
        process.platform === 'win32'
          ? `\\\\.\\pipe\\rush-client-helper-exit-${path.basename(folder)}`
          : path.join(folder, 'd.sock'),
      lockfilePath: path.join(folder, 'daemon.pid.json')
    };
    const environment = captureDaemonRequest({
      argv: [],
      commandName: 'test',
      commandOrigin: 'custom',
      cwd: folder,
      environment: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
      terminal: { isTTY: false, supportsColor: false }
    }).environment;
    options = {
      paths,
      expectedDaemonVersion: 'fixture',
      startupTimeoutMs: 7000,
      startCommand: {
        command: process.execPath,
        args: [path.join(__dirname, 'fixtures/daemon.js'), JSON.stringify(paths)],
        cwd: folder,
        environment
      }
    };
  });

  afterEach(async () => {
    if (fs.existsSync(path.join(folder, 'starts'))) {
      fs.writeFileSync(path.join(folder, 'stop'), '');
      const pids: string[] = fs.readFileSync(path.join(folder, 'starts'), 'utf8').trim().split('\n');
      await Promise.all(pids.map((pid) => waitForTestProcessExitAsync(Number(pid))));
      expect(pids.every((pid) => fs.existsSync(path.join(folder, `stopped-${pid}`)))).toBe(true);
    }
    // A fixture daemon that fails a check records it here.
    expect(readIfPresent(path.join(folder, 'failures'))).toBe('');
    if (fs.existsSync(path.join(folder, 'parents'))) {
      const parents = new Set(fs.readFileSync(path.join(folder, 'parents'), 'utf8').trim().split('\n'));
      await Promise.all([...parents].map((pid) => waitForTestProcessExitAsync(Number(pid))));
    }
    await removeTestFolderAsync(folder);
  });

  it.each<{ signalUse: string; abortSignal: AbortSignal | undefined }>([
    { signalUse: 'without', abortSignal: undefined },
    { signalUse: 'with', abortSignal: new AbortController().signal }
  ])(
    'connects when its startup helper exits, not at the end of a backoff step ($signalUse an abort signal)',
    async ({ abortSignal }) => {
      // The daemon listens after a second, when this client and its helper both poll every 500 milliseconds.
      // This client holds the start mutex, so it drops each connection until the helper releases the
      // reservation and exits.
      fs.writeFileSync(path.join(folder, 'startup-delay-ms'), '1000');
      const delays: IPendingDelays = trackPendingDelays();
      const { timeline, restore } = recordStartupTimeline();
      try {
        const client: DaemonClient = await connectOrStartDaemonAsync({ ...options, abortSignal });
        await new Promise<void>((resolve) => setImmediate(resolve));
        // A backoff timer left running would keep a client process alive for the rest of its step.
        expect(delays.pending.size).toBe(0);
        await client.closeAsync();
        const { attempts, helperClosedAt } = timeline;
        expect(helperClosedAt).toBeDefined();
        const afterExit: number[] = attempts.filter((attempt) => attempt >= helperClosedAt!);
        expect(afterExit).toHaveLength(1);
        expect(afterExit[0] - helperClosedAt!).toBeLessThan(100);
      } finally {
        restore();
        delays.restore();
      }
    }
  );

  it('retries at once when its startup helper exits during a failed connection attempt', async () => {
    // The daemon listens after a second. Attempts that fail from 300 milliseconds after the spawn end only
    // once the helper has closed, so the helper exits while an attempt runs, not while this client sleeps.
    fs.writeFileSync(path.join(folder, 'startup-delay-ms'), '1000');
    const { timeline, restore } = recordStartupTimeline(300);
    try {
      const client: DaemonClient = await connectOrStartDaemonAsync(options);
      await client.closeAsync();
      const { attempts, held, helperClosedAt } = timeline;
      expect(held).toBe(1);
      expect(helperClosedAt).toBeDefined();
      const afterExit: number[] = attempts.filter((attempt) => attempt >= helperClosedAt!);
      expect(afterExit).toHaveLength(1);
      expect(afterExit[0] - helperClosedAt!).toBeLessThan(100);
    } finally {
      restore();
    }
  });

  it('waits a whole backoff step between attempts once its startup helper has exited', async () => {
    // The daemon reports another version, so this client never connects, but the helper sees it ready
    // and exits.
    const { timeline, restore } = recordStartupTimeline();
    try {
      await expect(
        connectOrStartDaemonAsync({
          ...options,
          startupTimeoutMs: 3000,
          startCommand: { ...options.startCommand!, args: [...options.startCommand!.args, 'other'] }
        })
      ).rejects.toThrow('Daemon startup timed out awaiting hello/ping readiness.');
      const { attempts, helperClosedAt } = timeline;
      expect(helperClosedAt).toBeDefined();
      const afterExit: number[] = attempts.filter((attempt) => attempt >= helperClosedAt!);
      // Only the first attempt after the exit comes early. Each later one waits a whole step, so fewer
      // than 10 fit in the rest of the deadline.
      expect(afterExit.length).toBeGreaterThan(1);
      expect(afterExit.length).toBeLessThan(10);
    } finally {
      restore();
    }
  }, 15000);

  it('stops at once when aborted while it waits for its startup helper', async () => {
    // The daemon waits before it listens, so this client sleeps between refused connection attempts.
    fs.writeFileSync(path.join(folder, 'hold-prebind'), '');
    const abort: AbortController = new AbortController();
    const reason: Error = new Error('cancelled while the daemon starts');
    const { timeline, restore } = recordStartupTimeline();
    try {
      const pending: Promise<unknown> = connectOrStartDaemonAsync({
        ...options,
        abortSignal: abort.signal
      }).then(
        () => new Error('Expected startup to be aborted.'),
        (rejection: unknown) => rejection
      );
      const barrier: string = path.join(folder, 'prebind');
      const deadline: number = Date.now() + 5000;
      while (!fs.existsSync(barrier) && Date.now() < deadline) await delayAsync(20);
      expect(fs.existsSync(barrier)).toBe(true);
      // Abort 20 milliseconds after an attempt begins: a refused attempt ends at once, and each step lasts 50
      // milliseconds or more.
      const attemptCount: number = timeline.attempts.length;
      while (timeline.attempts.length === attemptCount && Date.now() < deadline) await delayAsync(1);
      expect(timeline.attempts.length).toBeGreaterThan(attemptCount);
      await delayAsync(20);
      abort.abort(reason);
      const abortedAt: number = performance.now();
      expect(await pending).toMatchObject({ name: 'AbortError', cause: reason });
      expect(performance.now() - abortedAt).toBeLessThan(100);
    } finally {
      restore();
    }
  }, 10000);
});
