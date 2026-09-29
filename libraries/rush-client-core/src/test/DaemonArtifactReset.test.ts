// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  tryAcquireReclaimLock,
  type IDaemonOrphanReap,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { resetDaemonArtifactsAsync } from '../DaemonOwnership';
import { getDaemonStartupFilePath } from '../DaemonStartup';
import { tryAcquireStartupLockAsync, type IStartupLock } from '../StartupLock';
import {
  isRunning,
  readProcessStartTime,
  recordDaemonOwner,
  recordOperationGroup,
  startDetachedOperationAsync,
  startExitedProcessAsync,
  startOrphanedOperationAsync,
  stopOperationIfRunning
} from './OrphanedOperation';

const linuxIt: typeof it = process.platform === 'linux' ? it : it.skip;

function getDaemonPaths(runtimeDir: string): IDaemonPaths {
  return {
    runtimeDir,
    socketPath: path.join(runtimeDir, 'd.sock'),
    lockfilePath: path.join(runtimeDir, 'daemon.pid.json')
  };
}

/** A listener that was killed without cleanup leaves a socket file that refuses connections. */
async function leaveStaleSocketAsync(socketPath: string): Promise<void> {
  const listener: ChildProcess = spawn(
    process.execPath,
    [
      '-e',
      `require('net').createServer().listen(${JSON.stringify(socketPath)}, () => process.kill(process.pid, 'SIGKILL'))`
    ],
    { stdio: 'ignore' }
  );
  await once(listener, 'close');
}

describe(`${resetDaemonArtifactsAsync.name} when the owner exited without shutting down`, () => {
  let folder: string;
  let paths: IDaemonPaths;
  let operationPids: number[];
  let warning: jest.SpyInstance;
  let reaps: IDaemonOrphanReap[];
  const onOrphansReaped = (reap: IDaemonOrphanReap): void => {
    reaps.push(reap);
  };

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-reset-'));
    paths = getDaemonPaths(folder);
    operationPids = [];
    reaps = [];
    warning = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warning.mockRestore();
    operationPids.forEach(stopOperationIfRunning);
    await fs.promises.rm(folder, { recursive: true, force: true });
  });

  linuxIt('stops the operations that the owner left running before it removes its files', async () => {
    const { daemonPid, operationPid } = await startOrphanedOperationAsync(operationPids);
    await leaveStaleSocketAsync(paths.socketPath);
    recordDaemonOwner(paths, daemonPid);
    fs.writeFileSync(getDaemonStartupFilePath(paths), 'abandoned');
    expect(await resetDaemonArtifactsAsync(paths, { onOrphansReaped })).toEqual({
      removedPaths: [paths.lockfilePath, getDaemonStartupFilePath(paths), paths.socketPath]
    });
    expect(isRunning(operationPid)).toBe(false);
    expect(reaps).toEqual([{ daemonPid, processGroupIds: [daemonPid], outcome: 'terminated' }]);
    expect(warning).not.toHaveBeenCalled();
    expect(await resetDaemonArtifactsAsync(paths, { onOrphansReaped })).toEqual({ removedPaths: [] });
    expect(reaps).toHaveLength(1);
  });

  linuxIt(
    'stops a recorded operation group but never one whose leader has another start time, and removes the records',
    async () => {
      const daemonPid: number = await startExitedProcessAsync();
      const recorded: number = await startDetachedOperationAsync(operationPids);
      const other: number = await startDetachedOperationAsync(operationPids);
      recordDaemonOwner(paths, daemonPid);
      recordOperationGroup(paths.lockfilePath, daemonPid, recorded, readProcessStartTime(recorded));
      // As if the daemon recorded an operation whose PID a process that started later now has.
      const earlier: string = String(Number(readProcessStartTime(other)) - 1);
      recordOperationGroup(paths.lockfilePath, daemonPid, other, earlier);
      expect(await resetDaemonArtifactsAsync(paths)).toEqual({ removedPaths: [paths.lockfilePath] });
      expect(isRunning(recorded)).toBe(false);
      expect(isRunning(other)).toBe(true);
      // Without onOrphansReaped, each set of stopped groups is reported as a process warning.
      expect(warning.mock.calls).toEqual([
        [
          `Reclaimed dead daemon ${daemonPid}: its orphaned operation process groups ${recorded} were terminated.`,
          expect.objectContaining({ code: 'RUSH_DAEMON_ORPHANS_REAPED' })
        ]
      ]);
      expect(fs.existsSync(`${paths.lockfilePath}.groups-${daemonPid}`)).toBe(false);
    }
  );

  linuxIt(
    'waits while another process reclaims the owner, and signals and removes nothing until then',
    async () => {
      const { daemonPid, operationPid } = await startOrphanedOperationAsync(operationPids);
      recordDaemonOwner(paths, daemonPid);
      const record: string = fs.readFileSync(paths.lockfilePath, 'utf8');
      // For example, a daemon that starts reclaims the endpoint of the owner that exited under this lock.
      const reclaimLockPath: string = `${paths.lockfilePath}.reclaim`;
      expect(tryAcquireReclaimLock(reclaimLockPath)).toEqual({ acquired: true });
      await expect(resetDaemonArtifactsAsync(paths, { onOrphansReaped })).rejects.toThrow(
        `Another process is reclaiming the files of rushd (PID ${daemonPid})`
      );
      expect(isRunning(operationPid)).toBe(true);
      expect(fs.readFileSync(paths.lockfilePath, 'utf8')).toBe(record);
      expect(reaps).toEqual([]);
      const release: NodeJS.Timeout = setTimeout(() => fs.unlinkSync(reclaimLockPath), 300);
      try {
        expect(await resetDaemonArtifactsAsync(paths, { onOrphansReaped, waitTimeoutMs: 5000 })).toEqual({
          removedPaths: [paths.lockfilePath]
        });
      } finally {
        clearTimeout(release);
      }
      expect(isRunning(operationPid)).toBe(false);
      expect(reaps).toEqual([{ daemonPid, processGroupIds: [daemonPid], outcome: 'terminated' }]);
    }
  );

  linuxIt('signals and removes nothing when it cannot reclaim the owner', async () => {
    const { daemonPid, operationPid } = await startOrphanedOperationAsync(operationPids);
    await leaveStaleSocketAsync(paths.socketPath);
    recordDaemonOwner(paths, daemonPid);
    fs.writeFileSync(getDaemonStartupFilePath(paths), 'abandoned');
    const record: string = fs.readFileSync(paths.lockfilePath, 'utf8');
    // The reclaim trusts no record in a runtime folder that it reaches through a symbolic link.
    const link: string = path.join(folder, 'link');
    fs.symlinkSync(folder, link);
    await expect(resetDaemonArtifactsAsync(getDaemonPaths(link), { onOrphansReaped })).rejects.toThrow(
      `rushd (PID ${daemonPid}) exited without shutting down, and stopping the operations that it left ` +
        `running failed, so no file was removed: The daemon runtime folder ${link} is unsafe`
    );
    expect(isRunning(operationPid)).toBe(true);
    expect(reaps).toEqual([]);
    expect(fs.readFileSync(paths.lockfilePath, 'utf8')).toBe(record);
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(true);
    expect(fs.existsSync(paths.socketPath)).toBe(true);
  });

  /**
   * Records an owner whose PID a process that started later now has, as if the owner recorded that process's
   * group (with its start time), one group `recorded` that it started, and one group whose leader has another
   * start time than the recorded one. Returns those three PIDs.
   */
  async function recordReusedOwnerAsync(): Promise<[number, number, number]> {
    // Each leads a process group and session of its own, as an operation does.
    const unrelated: number = await startDetachedOperationAsync(operationPids);
    const recorded: number = await startDetachedOperationAsync(operationPids);
    const other: number = await startDetachedOperationAsync(operationPids);
    recordDaemonOwner(paths, unrelated, new Date(Date.now() - 3600000).toISOString());
    recordOperationGroup(paths.lockfilePath, unrelated, unrelated, readProcessStartTime(unrelated));
    recordOperationGroup(paths.lockfilePath, unrelated, recorded, readProcessStartTime(recorded));
    const earlier: string = String(Number(readProcessStartTime(other)) - 1);
    recordOperationGroup(paths.lockfilePath, unrelated, other, earlier);
    return [unrelated, recorded, other];
  }

  linuxIt(
    'stops the proven operation groups of an owner whose PID a later process has, but never that process',
    async () => {
      const [unrelated, recorded, other] = await recordReusedOwnerAsync();
      expect(await resetDaemonArtifactsAsync(paths, { onOrphansReaped })).toEqual({
        removedPaths: [paths.lockfilePath]
      });
      expect(isRunning(recorded)).toBe(false);
      expect(isRunning(other)).toBe(true);
      expect(isRunning(unrelated)).toBe(true);
      expect(reaps).toEqual([{ daemonPid: unrelated, processGroupIds: [recorded], outcome: 'terminated' }]);
      expect(warning).not.toHaveBeenCalled();
      expect(fs.existsSync(`${paths.lockfilePath}.groups-${unrelated}`)).toBe(false);
    }
  );

  linuxIt(
    'signals and removes nothing while another process reclaims, when a later process has the PID',
    async () => {
      const [unrelated, recorded] = await recordReusedOwnerAsync();
      const record: string = fs.readFileSync(paths.lockfilePath, 'utf8');
      const reclaimLockPath: string = `${paths.lockfilePath}.reclaim`;
      expect(tryAcquireReclaimLock(reclaimLockPath)).toEqual({ acquired: true });
      try {
        await expect(resetDaemonArtifactsAsync(paths, { onOrphansReaped })).rejects.toThrow(
          `Another process is reclaiming the files of rushd (PID ${unrelated})`
        );
      } finally {
        fs.unlinkSync(reclaimLockPath);
      }
      expect(isRunning(recorded)).toBe(true);
      expect(isRunning(unrelated)).toBe(true);
      expect(reaps).toEqual([]);
      expect(fs.readFileSync(paths.lockfilePath, 'utf8')).toBe(record);
      expect(fs.existsSync(`${paths.lockfilePath}.groups-${unrelated}`)).toBe(true);
    }
  );

  linuxIt(
    'removes a record whose PID a process that started later now has, and signals nothing',
    async () => {
      // It leads a process group of its own, so a signal to the group that the record names would stop it.
      const unrelated: number = await startDetachedOperationAsync(operationPids);
      recordDaemonOwner(paths, unrelated, new Date(Date.now() - 3600000).toISOString());
      expect(await resetDaemonArtifactsAsync(paths, { onOrphansReaped })).toEqual({
        removedPaths: [paths.lockfilePath]
      });
      expect(isRunning(unrelated)).toBe(true);
      expect(reaps).toEqual([]);
      expect(warning).not.toHaveBeenCalled();
    }
  );

  linuxIt(
    'says that another client may be resetting the daemon while it holds the start mutex, and signals nothing',
    async () => {
      const { daemonPid, operationPid } = await startOrphanedOperationAsync(operationPids);
      recordDaemonOwner(paths, daemonPid);
      // For example, a concurrent "daemon stop --force" that still stops what the owner left running.
      const lock: IStartupLock | undefined = await tryAcquireStartupLockAsync(paths);
      expect(lock).toBeDefined();
      try {
        await expect(resetDaemonArtifactsAsync(paths, { onOrphansReaped })).rejects.toThrow(
          `Another client is starting or resetting the daemon for ${paths.lockfilePath}; retry after it finishes.`
        );
        expect(isRunning(operationPid)).toBe(true);
        expect(reaps).toEqual([]);
      } finally {
        await lock!.releaseAsync();
      }
      expect(await resetDaemonArtifactsAsync(paths, { onOrphansReaped })).toEqual({
        removedPaths: [paths.lockfilePath]
      });
      expect(isRunning(operationPid)).toBe(false);
      expect(reaps).toEqual([{ daemonPid, processGroupIds: [daemonPid], outcome: 'terminated' }]);
    }
  );
});
