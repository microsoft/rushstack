// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  DaemonTransportErrorCode,
  tryAcquireReclaimLock,
  type IDaemonOperationGroupLeftRunning,
  type IDaemonOrphanReap,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { reclaimAbandonedOwnershipAsync } from '../DaemonOwnership';
import {
  describeGroupLeftRunning,
  isRunning,
  readClientLogTexts,
  readProcessStartTime,
  recordDaemonOwner,
  recordOperationGroup,
  startDetachedOperationAsync,
  stopOperationIfRunning
} from './OrphanedOperation';

const linuxIt: typeof it = process.platform === 'linux' ? it : it.skip;

describe(`${reclaimAbandonedOwnershipAsync.name} when a process that started later has the recorded PID`, () => {
  let folder: string;
  let paths: IDaemonPaths;
  let operationPids: number[];
  let reaps: IDaemonOrphanReap[];
  const onOrphansReaped = (reap: IDaemonOrphanReap): void => {
    reaps.push(reap);
  };

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-abandoned-'));
    paths = {
      runtimeDir: folder,
      socketPath: path.join(folder, 'd.sock'),
      lockfilePath: path.join(folder, 'daemon.pid.json')
    };
    operationPids = [];
    reaps = [];
  });

  afterEach(async () => {
    operationPids.forEach(stopOperationIfRunning);
    await fs.promises.rm(folder, { recursive: true, force: true });
  });

  /**
   * Records an owner whose PID a process that started later has now, as if the owner recorded that process's
   * group and one group that it started. Returns the PIDs of that process and of the recorded group's leader.
   */
  async function recordReusedOwnerAsync(): Promise<[number, number]> {
    // Each leads a process group and session of its own, as an operation does.
    const unrelated: number = await startDetachedOperationAsync(operationPids);
    const recorded: number = await startDetachedOperationAsync(operationPids);
    recordDaemonOwner(paths, unrelated, new Date(Date.now() - 3600000).toISOString());
    recordOperationGroup(paths.lockfilePath, unrelated, unrelated, readProcessStartTime(unrelated));
    recordOperationGroup(paths.lockfilePath, unrelated, recorded, readProcessStartTime(recorded));
    return [unrelated, recorded];
  }

  linuxIt('stops the recorded operations before it removes the record, but never that process', async () => {
    const [unrelated, recorded] = await recordReusedOwnerAsync();
    await reclaimAbandonedOwnershipAsync(paths, { onOrphansReaped });
    expect(isRunning(recorded)).toBe(false);
    expect(isRunning(unrelated)).toBe(true);
    expect(reaps).toEqual([{ daemonPid: unrelated, processGroupIds: [recorded], outcome: 'terminated' }]);
    // The group of that process is left running, and the launcher log says why.
    expect(readClientLogTexts(paths)).toEqual([
      describeGroupLeftRunning(unrelated, unrelated, 'daemonPidInUse')
    ]);
    expect(fs.existsSync(paths.lockfilePath)).toBe(false);
    expect(fs.existsSync(`${paths.lockfilePath}.groups-${unrelated}`)).toBe(false);
  });

  linuxIt(
    'gives a recorded group that it leaves running to onOperationGroupLeftRunning instead',
    async () => {
      const [unrelated, recorded] = await recordReusedOwnerAsync();
      const groups: IDaemonOperationGroupLeftRunning[] = [];
      await reclaimAbandonedOwnershipAsync(paths, {
        onOrphansReaped,
        onOperationGroupLeftRunning: (group: IDaemonOperationGroupLeftRunning) => groups.push(group)
      });
      expect(isRunning(recorded)).toBe(false);
      expect(isRunning(unrelated)).toBe(true);
      expect(groups).toEqual([{ daemonPid: unrelated, processGroupId: unrelated, reason: 'daemonPidInUse' }]);
      expect(readClientLogTexts(paths)).toEqual([]);
    }
  );

  linuxIt(
    'keeps the record and signals nothing while the recorded operations cannot be stopped',
    async () => {
      const [unrelated, recorded] = await recordReusedOwnerAsync();
      const record: string = fs.readFileSync(paths.lockfilePath, 'utf8');
      // For example, a daemon that starts reclaims the endpoint under this lock.
      const reclaimLockPath: string = `${paths.lockfilePath}.reclaim`;
      expect(tryAcquireReclaimLock(reclaimLockPath)).toEqual({ acquired: true });
      try {
        await expect(reclaimAbandonedOwnershipAsync(paths, { onOrphansReaped })).rejects.toMatchObject({
          code: DaemonTransportErrorCode.daemonAlreadyRunning
        });
      } finally {
        fs.unlinkSync(reclaimLockPath);
      }
      expect(isRunning(recorded)).toBe(true);
      expect(isRunning(unrelated)).toBe(true);
      expect(reaps).toEqual([]);
      expect(readClientLogTexts(paths)).toEqual([]);
      expect(fs.readFileSync(paths.lockfilePath, 'utf8')).toBe(record);
      expect(fs.existsSync(`${paths.lockfilePath}.groups-${unrelated}`)).toBe(true);
    }
  );
});
