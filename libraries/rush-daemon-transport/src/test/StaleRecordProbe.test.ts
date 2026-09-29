// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import type { IDaemonProcessGroupOps } from '../DaemonProcessGroup';
import type { IProcessStat } from '../DaemonProcessStat';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';

import {
  OPERATION_GROUP,
  OTHER_OPERATION_GROUP,
  operationTree,
  recordGroups,
  recordsRemain
} from './OperationGroupFixture';
import { DEAD_PID, createFakeGroup } from './OrphanReaperFixture';
import type { IFakeGroup } from './OrphanReaperFixture';

interface IScanCount {
  /** The group of each scan of the process table for a group's members, in order. */
  readonly scannedGroups: number[];
  readonly options: IDaemonOrphanReaperOptions;
}

// The options of `fake`, which also count each scan of its process table for a group's members.
function countScans(fake: IFakeGroup): IScanCount {
  const ops: IDaemonProcessGroupOps = fake.options.ops as IDaemonProcessGroupOps;
  const scannedGroups: number[] = [];
  const listLiveGroupMembers = (groupId: number): IProcessStat[] => {
    scannedGroups.push(groupId);
    return ops.listLiveGroupMembers(groupId);
  };
  return { scannedGroups, options: { ...fake.options, ops: { ...ops, listLiveGroupMembers } } };
}

it('drops a record whose group has no process without a scan of every process', async () => {
  const fake: IFakeGroup = createFakeGroup({
    exitsOn: 'SIGTERM',
    processes: operationTree(OPERATION_GROUP, false)
  });
  const { scannedGroups, options } = countScans(fake);
  const lockfilePath: string = recordGroups([OTHER_OPERATION_GROUP, OPERATION_GROUP]);
  await expect(reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, options)).resolves.toBe(
    'terminated'
  );
  expect(scannedGroups).toEqual([OPERATION_GROUP]);
  expect(fake.targets).toEqual([OPERATION_GROUP]);
  expect(recordsRemain(lockfilePath)).toBe(false);
});

it('still decides by the proof when a group that kill() finds has no live member', async () => {
  const fake: IFakeGroup = createFakeGroup({ anyGroupExists: true, processes: [] });
  const { scannedGroups, options } = countScans(fake);
  const lockfilePath: string = recordGroups([OTHER_OPERATION_GROUP]);
  await expect(reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, options)).resolves.toBe('none');
  expect(scannedGroups).toEqual([OTHER_OPERATION_GROUP]);
  expect(fake.signals).toEqual([]);
  expect(recordsRemain(lockfilePath)).toBe(false);
});
