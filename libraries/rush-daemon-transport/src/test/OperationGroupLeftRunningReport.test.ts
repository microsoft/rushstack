// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import type { IProcessStat } from '../DaemonProcessStat';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';

import { OPERATION_CHILD, OPERATION_GROUP, operationTree, recordGroups, stat } from './OperationGroupFixture';
import { REUSED_LEADER, reapLeftRunningAsync, withGroupMembers } from './OperationGroupLeftRunningFixture';
import type { ILeftRunningReap } from './OperationGroupLeftRunningFixture';
import { DEAD_PID, createFakeGroup } from './OrphanReaperFixture';
import type { IFakeGroup } from './OrphanReaperFixture';

const ONCE: number = 1;

it.each<[string, readonly IProcessStat[]]>([
  ['whose only members have exited', [{ ...stat(OPERATION_CHILD, OPERATION_GROUP), exited: true }]],
  ['that has no process at all', []]
])('reports no group %s', async (title, processes) => {
  const { fake, outcome, groups }: ILeftRunningReap = await reapLeftRunningAsync({ processes });
  expect(outcome).toBe('none');
  expect(fake.signals).toEqual([]);
  expect(groups).toEqual([]);
});

it('reports a group that it stopped only to onOrphansReaped', async () => {
  const onOrphansReaped: jest.Mock = jest.fn();
  const { outcome, groups }: ILeftRunningReap = await reapLeftRunningAsync(
    { processes: operationTree(OPERATION_GROUP) },
    { onOrphansReaped }
  );
  expect(outcome).toBe('terminated');
  expect(onOrphansReaped).toHaveBeenCalledTimes(ONCE);
  expect(groups).toEqual([]);
});

it('reads no group again without onOperationGroupLeftRunning', async () => {
  const fake: IFakeGroup = createFakeGroup({ processes: [REUSED_LEADER] });
  const listLiveGroupMembers: jest.Mock = jest.fn(() => []);
  const options: IDaemonOrphanReaperOptions = withGroupMembers(fake, listLiveGroupMembers);
  const lockfilePath: string = recordGroups([OPERATION_GROUP]);
  await expect(reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, options)).resolves.toBe('none');
  expect(fake.signals).toEqual([]);
  expect(listLiveGroupMembers).not.toHaveBeenCalled();
});

it('loses only the report of a group that it cannot read again', async () => {
  const fake: IFakeGroup = createFakeGroup({ processes: [REUSED_LEADER] });
  const failingRead: jest.Mock = jest.fn(() => {
    throw new Error('EACCES');
  });
  const { outcome, groups }: ILeftRunningReap = await reapLeftRunningAsync(
    { processes: [REUSED_LEADER] },
    withGroupMembers(fake, failingRead)
  );
  expect(outcome).toBe('none');
  expect(failingRead).toHaveBeenCalledTimes(ONCE);
  expect(groups).toEqual([]);
});
