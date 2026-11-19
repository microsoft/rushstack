// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import type { IProcessStat } from '../DaemonProcessStat';
import type { IDaemonOperationGroupLeftRunning } from '../DaemonReclaimOptions';

import {
  OPERATION_GROUP,
  OTHER_OPERATION_GROUP,
  operationTree,
  recordGroups,
  recordsRemain,
  stat
} from './OperationGroupFixture';
import { reapLeftRunningAsync, withGroupMembers } from './OperationGroupLeftRunningFixture';
import { DEAD_PID, createFakeGroup } from './OrphanReaperFixture';
import type { IFakeGroup } from './OrphanReaperFixture';

// A later process that has the PID of the recorded leader of OTHER_OPERATION_GROUP.
const OTHER_LEADER: IProcessStat = {
  ...stat(OTHER_OPERATION_GROUP, OTHER_OPERATION_GROUP),
  startTime: '999'
};

it('reads no group again that has no process', async () => {
  const listLiveGroupMembers: jest.Mock = jest.fn(() => []);
  const fake: IFakeGroup = createFakeGroup({ processes: [] });
  const { groups } = await reapLeftRunningAsync(
    { processes: [] },
    withGroupMembers(fake, listLiveGroupMembers)
  );
  expect(groups).toEqual([]);
  expect(listLiveGroupMembers).not.toHaveBeenCalled();
});

it('reports nothing, and keeps the records, when a group that it proved survives SIGKILL', async () => {
  // Without `exitsOn`, no process of the table ever exits.
  const fake: IFakeGroup = createFakeGroup({ processes: [...operationTree(OPERATION_GROUP), OTHER_LEADER] });
  const groups: IDaemonOperationGroupLeftRunning[] = [];
  const onOperationGroupLeftRunning = (group: IDaemonOperationGroupLeftRunning): number => groups.push(group);
  const lockfilePath: string = recordGroups([OPERATION_GROUP, OTHER_OPERATION_GROUP]);
  const reap: Promise<string> = reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, {
    ...fake.options,
    onOperationGroupLeftRunning
  });
  await expect(reap).rejects.toThrow(/survived SIGKILL/);
  expect(fake.targets.every((groupId: number) => groupId === OPERATION_GROUP)).toBe(true);
  expect(groups).toEqual([]);
  expect(recordsRemain(lockfilePath)).toBe(true);
});
