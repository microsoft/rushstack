// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import type {
  IDaemonOperationGroupLeftRunning,
  IDaemonOrphanReap,
  IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { getDaemonLogFilePath } from '../DaemonLogFile';
import { reclaimCrashedDaemonAsync } from '../ExitedDaemonReclaim';
import { isProcessDefunct } from '../ProcessStartTime';
import { findReclaimedDaemonPid } from '../ReclaimedDaemonLog';
import { tryAcquireStartupLockAsync, type IStartupLock } from '../StartupLock';
import {
  isRunning,
  readClientLogTexts,
  readProcessStartTime,
  recordDaemonOwner,
  recordOperationGroup,
  startDetachedOperationAsync,
  startExitedProcessAsync,
  startOrphanedOperationAsync,
  startStandInDaemonAsync,
  stopOperationIfRunning,
  type IStandInDaemon
} from './OrphanedOperation';
import { withUnreapedChildAsync } from './UnreapedChildProcess';

const linuxIt: typeof it = process.platform === 'linux' ? it : it.skip;

function getDaemonPaths(runtimeDir: string): IDaemonPaths {
  return {
    runtimeDir,
    socketPath: path.join(runtimeDir, 'd.sock'),
    lockfilePath: path.join(runtimeDir, 'daemon.pid.json')
  };
}

describe(reclaimCrashedDaemonAsync.name, () => {
  let folder: string;
  let paths: IDaemonPaths;
  let operationPids: number[];
  let warning: jest.SpyInstance;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-crash-reclaim-'));
    paths = getDaemonPaths(folder);
    operationPids = [];
    warning = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warning.mockRestore();
    operationPids.forEach(stopOperationIfRunning);
    await fs.promises.rm(folder, { recursive: true, force: true });
  });

  it('does nothing, and creates no runtime folder, when there is no ownership record', async () => {
    const runtimeDir: string = path.join(folder, 'runtime');
    await reclaimCrashedDaemonAsync(getDaemonPaths(runtimeDir));
    expect(fs.existsSync(runtimeDir)).toBe(false);
    expect(warning).not.toHaveBeenCalled();
  });

  linuxIt('stops the operations that a crashed daemon left running, and removes its files', async () => {
    const { daemonPid, operationPid } = await startOrphanedOperationAsync(operationPids);
    recordDaemonOwner(paths, daemonPid);
    await reclaimCrashedDaemonAsync(paths);
    expect(isRunning(operationPid)).toBe(false);
    expect(fs.existsSync(paths.lockfilePath)).toBe(false);
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining(`Reclaimed dead daemon ${daemonPid}:`),
      expect.objectContaining({ code: 'RUSH_DAEMON_ORPHANS_REAPED' })
    );
  });

  linuxIt('reports what it stopped to onOrphansReaped instead of a process warning', async () => {
    const { daemonPid, operationPid } = await startOrphanedOperationAsync(operationPids);
    recordDaemonOwner(paths, daemonPid);
    const reaps: IDaemonOrphanReap[] = [];
    await reclaimCrashedDaemonAsync(paths, {
      onOrphansReaped: (reap: IDaemonOrphanReap) => reaps.push(reap)
    });
    expect(isRunning(operationPid)).toBe(false);
    expect(fs.existsSync(paths.lockfilePath)).toBe(false);
    expect(reaps).toEqual([{ daemonPid, processGroupIds: [daemonPid], outcome: 'terminated' }]);
    expect(warning).not.toHaveBeenCalled();
  });

  /**
   * Records an exited owner that recorded one operation group whose leader has another start time, as if a
   * process that started later has the PID of the group's leader now. Returns the owner's PID and that PID.
   */
  async function recordChangedLeaderAsync(): Promise<[number, number]> {
    const daemonPid: number = await startExitedProcessAsync();
    const other: number = await startDetachedOperationAsync(operationPids);
    recordDaemonOwner(paths, daemonPid);
    const earlier: string = String(Number(readProcessStartTime(other)) - 1);
    recordOperationGroup(paths.lockfilePath, daemonPid, other, earlier);
    return [daemonPid, other];
  }

  linuxIt('logs a recorded group that it leaves running, before the line that names the daemon', async () => {
    const [daemonPid, other] = await recordChangedLeaderAsync();
    await reclaimCrashedDaemonAsync(paths);
    expect(isRunning(other)).toBe(true);
    expect(readClientLogTexts(paths)).toEqual([
      `left process group ${other} running, which the exited daemon (PID ${daemonPid}) recorded for an ` +
        `operation: the process with PID ${other} now is not the leader that the daemon recorded.`,
      `rushd (PID ${daemonPid}) exited without shutting down; stopped the operations it left running that ` +
        'could be proven to be its own, and removed its ownership record and socket.'
    ]);
    expect(findReclaimedDaemonPid(paths)).toBe(daemonPid);
    expect(fs.existsSync(paths.lockfilePath)).toBe(false);
    expect(fs.existsSync(`${paths.lockfilePath}.groups-${daemonPid}`)).toBe(false);
    expect(warning).not.toHaveBeenCalled();
  });

  linuxIt(
    'gives a recorded group that it leaves running to onOperationGroupLeftRunning instead',
    async () => {
      const [daemonPid, other] = await recordChangedLeaderAsync();
      const groups: IDaemonOperationGroupLeftRunning[] = [];
      await reclaimCrashedDaemonAsync(paths, {
        onOperationGroupLeftRunning: (group: IDaemonOperationGroupLeftRunning) => groups.push(group)
      });
      expect(isRunning(other)).toBe(true);
      expect(groups).toEqual([{ daemonPid, processGroupId: other, reason: 'leaderChanged' }]);
      expect(readClientLogTexts(paths)).toEqual([
        expect.stringMatching(new RegExp(`^rushd \\(PID ${daemonPid}\\) exited without shutting down;`))
      ]);
    }
  );

  linuxIt(
    'leaves a running daemon alone, without waiting while another client holds the start mutex',
    async () => {
      const { daemon, operationPid }: IStandInDaemon = await startStandInDaemonAsync(operationPids);
      // For example, a client that starts or replaces the daemon.
      const lock: IStartupLock | undefined = await tryAcquireStartupLockAsync(paths);
      try {
        expect(lock).toBeDefined();
        recordDaemonOwner(paths, daemon.pid!);
        const startedAt: number = Date.now();
        await reclaimCrashedDaemonAsync(paths);
        expect(Date.now() - startedAt).toBeLessThan(1000);
        expect(isRunning(daemon.pid!)).toBe(true);
        expect(isRunning(operationPid)).toBe(true);
        expect(fs.existsSync(paths.lockfilePath)).toBe(true);
        expect(warning).not.toHaveBeenCalled();
      } finally {
        await lock?.releaseAsync();
        daemon.kill('SIGKILL');
      }
    }
  );

  linuxIt('reclaims operation groups when the recorded daemon PID was reused', async () => {
    const operationPid: number = await startDetachedOperationAsync(operationPids);
    recordDaemonOwner(paths, process.pid, '1970-01-01T00:00:00.000Z');
    recordOperationGroup(paths.lockfilePath, process.pid, operationPid, readProcessStartTime(operationPid));

    await reclaimCrashedDaemonAsync(paths);

    expect(isRunning(operationPid)).toBe(false);
    expect(fs.existsSync(paths.lockfilePath)).toBe(false);
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining(`Reclaimed dead daemon ${process.pid}:`),
      expect.objectContaining({ code: 'RUSH_DAEMON_ORPHANS_REAPED' })
    );
  });

  linuxIt('leaves a daemon whose endpoint accepts connections, even when its PID seems reused', async () => {
    // After the wall clock jumps forward, a running daemon can seem to have started after its record.
    const endpoint: net.Server = net.createServer((socket: net.Socket) => socket.destroy());
    await new Promise<void>((resolve) => endpoint.listen(paths.socketPath, resolve));
    try {
      const operationPid: number = await startDetachedOperationAsync(operationPids);
      recordDaemonOwner(paths, process.pid, '1970-01-01T00:00:00.000Z');
      recordOperationGroup(paths.lockfilePath, process.pid, operationPid, readProcessStartTime(operationPid));

      await reclaimCrashedDaemonAsync(paths);

      expect(isRunning(operationPid)).toBe(true);
      expect(fs.existsSync(paths.lockfilePath)).toBe(true);
      expect(readClientLogTexts(paths)).toEqual([]);
      expect(warning).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => endpoint.close(() => resolve()));
    }
  });

  linuxIt('reclaims a crashed daemon that is not reaped yet once it is reaped', async () => {
    await withUnreapedChildAsync(async (child, parentPid) => {
      const deadline: number = Date.now() + 5000;
      while (!isProcessDefunct(child) && Date.now() < deadline) await delayAsync(20);
      recordDaemonOwner(paths, child);
      let settled: boolean = false;
      const reclaimed: Promise<void> = reclaimCrashedDaemonAsync(paths).finally(() => {
        settled = true;
      });
      // It waits up to 1 s for the process to be reaped.
      await delayAsync(100);
      expect(settled).toBe(false);
      expect(fs.existsSync(paths.lockfilePath)).toBe(true);
      // Once its parent exits, init or a subreaper reaps it.
      process.kill(parentPid, 'SIGTERM');
      await reclaimed;
      expect(fs.existsSync(paths.lockfilePath)).toBe(false);
    });
  });

  linuxIt('gives up after 1 s on a crashed daemon that is not reaped, and keeps its files', async () => {
    await withUnreapedChildAsync(async (child) => {
      const deadline: number = Date.now() + 5000;
      while (!isProcessDefunct(child) && Date.now() < deadline) await delayAsync(20);
      recordDaemonOwner(paths, child);
      const startedAt: number = Date.now();
      await reclaimCrashedDaemonAsync(paths);
      const waitedMs: number = Date.now() - startedAt;
      // Its parent never reaps it, so a longer wait would only delay the command.
      expect(waitedMs).toBeGreaterThanOrEqual(1000);
      expect(waitedMs).toBeLessThan(4000);
      expect(isProcessDefunct(child)).toBe(true);
      expect(fs.existsSync(paths.lockfilePath)).toBe(true);
      expect(warning).not.toHaveBeenCalled();
    });
  });

  linuxIt('does not act on the records in a runtime folder that is not private', async () => {
    const { daemonPid, operationPid } = await startOrphanedOperationAsync(operationPids);
    recordDaemonOwner(paths, daemonPid);
    // Another user could have created a link like this one, for example in /tmp.
    const link: string = path.join(os.tmpdir(), `${path.basename(folder)}-link`);
    fs.symlinkSync(folder, link);
    const linkPaths: IDaemonPaths = getDaemonPaths(link);
    // It does not even wait for the start mutex there.
    const lock: IStartupLock | undefined = await tryAcquireStartupLockAsync(linkPaths);
    try {
      expect(lock).toBeDefined();
      const startedAt: number = Date.now();
      await reclaimCrashedDaemonAsync(linkPaths);
      expect(Date.now() - startedAt).toBeLessThan(1000);
      expect(isRunning(operationPid)).toBe(true);
      expect(fs.existsSync(paths.lockfilePath)).toBe(true);
      expect(warning).not.toHaveBeenCalled();
      expect(fs.existsSync(getDaemonLogFilePath(paths))).toBe(false);
    } finally {
      await lock?.releaseAsync();
      fs.unlinkSync(link);
    }
  });

  linuxIt('logs the reclaim once, so that the daemon can be named after its record is gone', async () => {
    const { daemonPid } = await startOrphanedOperationAsync(operationPids);
    recordDaemonOwner(paths, daemonPid);
    await reclaimCrashedDaemonAsync(paths);
    expect(fs.existsSync(paths.lockfilePath)).toBe(false);
    const logFilePath: string = getDaemonLogFilePath(paths);
    const logged: string = fs.readFileSync(logFilePath, 'utf8');
    expect(logged).toMatch(
      new RegExp(
        `^\\S+Z rush-client \\(PID ${process.pid}\\): rushd \\(PID ${daemonPid}\\) exited without shutting down; ` +
          'stopped the operations it left running that could be proven to be its own, and removed its ' +
          'ownership record and socket\\.\\n$'
      )
    );
    expect(fs.statSync(logFilePath).mode % 0o1000).toBe(0o600);
    expect(findReclaimedDaemonPid(paths)).toBe(daemonPid);
    // Without a record there is nothing to reclaim, or to log.
    await reclaimCrashedDaemonAsync(paths);
    expect(fs.readFileSync(logFilePath, 'utf8')).toBe(logged);
  });
});
