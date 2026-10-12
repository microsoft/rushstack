// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import type { IProcessStat } from '../DaemonProcessStat';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';
import type { IDaemonOrphanReap } from '../DaemonReclaimOptions';

import {
  OPERATION_GROUP,
  OTHER_OPERATION_GROUP,
  operationTree,
  recordGroups,
  recordsRemain,
  stat
} from './OperationGroupFixture';
import { DEAD_PID, SELF_PID, createFakeGroup } from './OrphanReaperFixture';
import type { IFakeGroup, IFakeGroupSpec } from './OrphanReaperFixture';

const BOTH_GROUPS: readonly number[] = [OPERATION_GROUP, OTHER_OPERATION_GROUP];
const SWAPPER_PID: number = 0;
const INIT_PID: number = 1;
const UNSAFE_GROUPS: readonly number[] = [SWAPPER_PID, INIT_PID, SELF_PID];

function createOperations(spec: IFakeGroupSpec): IFakeGroup {
  return createFakeGroup({
    ...spec,
    processes: [...operationTree(OPERATION_GROUP), ...operationTree(OTHER_OPERATION_GROUP)]
  });
}

it('signals every proven group together and escalates the survivors to SIGKILL', async () => {
  const fake: IFakeGroup = createOperations({ exitsOn: 'SIGKILL' });
  const lockfilePath: string = recordGroups(BOTH_GROUPS);
  await expect(reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, fake.options)).resolves.toBe(
    'killed'
  );
  expect(fake.signals).toEqual(['SIGTERM', 'SIGTERM', 'SIGKILL', 'SIGKILL']);
  expect(fake.targets).toEqual([...BOTH_GROUPS, ...BOTH_GROUPS]);
  expect(fake.logs).toEqual([
    expect.stringContaining(`${OPERATION_GROUP}, ${OTHER_OPERATION_GROUP} were killed`)
  ]);
  expect(recordsRemain(lockfilePath)).toBe(false);
});

it('reports every group it stopped to onOrphansReaped instead of logging them', async () => {
  const fake: IFakeGroup = createOperations({ exitsOn: 'SIGTERM' });
  const reaps: IDaemonOrphanReap[] = [];
  const options: IDaemonOrphanReaperOptions = {
    ...fake.options,
    onOrphansReaped: (reap: IDaemonOrphanReap) => reaps.push(reap)
  };
  const lockfilePath: string = recordGroups(BOTH_GROUPS);
  await expect(reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, options)).resolves.toBe(
    'terminated'
  );
  expect(reaps).toEqual([{ daemonPid: DEAD_PID, processGroupIds: BOTH_GROUPS, outcome: 'terminated' }]);
  expect(fake.logs).toEqual([]);
});

it('fails the reclaim and keeps the records when a group survives SIGKILL', async () => {
  const fake: IFakeGroup = createOperations({});
  const lockfilePath: string = recordGroups(BOTH_GROUPS);
  await expect(reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, fake.options)).rejects.toThrow(
    /survived SIGKILL/
  );
  expect(recordsRemain(lockfilePath)).toBe(true);
});

it.each<[string, IFakeGroupSpec, IDaemonOrphanReaperOptions]>([
  ['the daemon is alive', { daemonAlive: true }, {}],
  ['the caller leads the group', { ownGroupId: OPERATION_GROUP }, {}],
  ['the caller group is unknown', { unknownOwnGroup: true }, {}],
  ['the caller is the leader', {}, { selfPid: OPERATION_GROUP }],
  ['on Windows', {}, { platform: 'win32' }]
])(
  'never signals a recorded group when %s',
  async (name: string, spec: IFakeGroupSpec, overrides: IDaemonOrphanReaperOptions) => {
    const fake: IFakeGroup = createOperations({ ...spec, exitsOn: 'SIGTERM' });
    const lockfilePath: string = recordGroups([OPERATION_GROUP]);
    const options: IDaemonOrphanReaperOptions = { ...fake.options, ...overrides };
    await expect(reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, options)).resolves.toBe('none');
    expect(fake.signals).toEqual([]);
  }
);

it('never signals the kernel, init or the caller, even as proven leaders', async () => {
  const leaders: IProcessStat[] = UNSAFE_GROUPS.map((groupId: number) => stat(groupId, groupId));
  const fake: IFakeGroup = createFakeGroup({
    ownGroupId: OPERATION_GROUP,
    exitsOn: 'SIGTERM',
    processes: leaders
  });
  const lockfilePath: string = recordGroups(UNSAFE_GROUPS);
  await expect(reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, fake.options)).resolves.toBe(
    'none'
  );
  expect(fake.signals).toEqual([]);
});
