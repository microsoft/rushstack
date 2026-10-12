// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import type { IDaemonPaths } from '../DaemonPaths';
import type { IProcessStat } from '../DaemonProcessStat';
import { tryAcquireReclaimLock } from '../DaemonReclaimLock';
import type { IDaemonOrphanReap } from '../DaemonReclaimOptions';
import { reapReusedOwnerOperationGroupsAsync } from '../DaemonReusedOwnerReap';
import { ensureDaemonRuntimeDir } from '../DaemonRuntimeDir';
import { DaemonTransportErrorCode } from '../DaemonTransportError';

import { OPERATION_GROUP, OTHER_OPERATION_GROUP, operationTree, stat } from './OperationGroupFixture';
import { recordDaemonFolder, removeCreatedEntries } from './OperationGroupSweepFixture';
import { DEAD_PID, createFakeGroup } from './OrphanReaperFixture';
import type { IFakeGroup } from './OrphanReaperFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const REUSED_START: string = '999';
const RECORDED_GROUPS: readonly number[] = [OPERATION_GROUP, OTHER_OPERATION_GROUP, DEAD_PID];

afterEach(removeCreatedEntries);

interface IReusedOwner {
  readonly paths: IDaemonPaths;
  readonly fake: IFakeGroup;
  /** The record folder of the owner. */
  readonly folder: string;
}

// A process that started after the daemon's lockfile was written has the daemon's pid, so the fake reports
// every pid alive. It leads group DEAD_PID with the start time recorded for that group, so only the rule for
// the owner's own group keeps it from being signaled. OTHER_OPERATION_GROUP's leader has another start time.
function recordReusedOwner(): IReusedOwner {
  const paths: IDaemonPaths = createTestDaemonPaths();
  ensureDaemonRuntimeDir(paths);
  const otherLeader: IProcessStat = {
    ...stat(OTHER_OPERATION_GROUP, OTHER_OPERATION_GROUP),
    startTime: REUSED_START
  };
  const fake: IFakeGroup = createFakeGroup({
    daemonAlive: true,
    exitsOn: 'SIGTERM',
    processes: [...operationTree(OPERATION_GROUP), otherLeader, stat(DEAD_PID, DEAD_PID)]
  });
  return { paths, fake, folder: recordDaemonFolder(paths.lockfilePath, DEAD_PID, RECORDED_GROUPS) };
}

it('stops only the proven groups of an owner whose pid a later process has, never that process', async () => {
  const { paths, fake, folder } = recordReusedOwner();
  const reaps: IDaemonOrphanReap[] = [];
  await reapReusedOwnerOperationGroupsAsync(paths, DEAD_PID, {
    ...fake.options,
    onOrphansReaped: (reap: IDaemonOrphanReap) => reaps.push(reap)
  });
  expect(fake.targets).toEqual([OPERATION_GROUP]);
  expect(reaps).toEqual([{ daemonPid: DEAD_PID, processGroupIds: [OPERATION_GROUP], outcome: 'terminated' }]);
  expect(fs.existsSync(folder)).toBe(false);
});

it('signals nothing and keeps the records while another process holds the reclaim lock', async () => {
  const { paths, fake, folder } = recordReusedOwner();
  const reclaimLockPath: string = `${paths.lockfilePath}.reclaim`;
  expect(tryAcquireReclaimLock(reclaimLockPath)).toEqual({ acquired: true });
  try {
    await expect(reapReusedOwnerOperationGroupsAsync(paths, DEAD_PID, fake.options)).rejects.toMatchObject({
      code: DaemonTransportErrorCode.daemonAlreadyRunning
    });
  } finally {
    fs.unlinkSync(reclaimLockPath);
  }
  expect(fake.signals).toEqual([]);
  expect(fs.existsSync(folder)).toBe(true);
});
