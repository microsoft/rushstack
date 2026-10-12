// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import type { IProcessStat } from '../DaemonProcessStat';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';
import type { IDaemonOrphanReap } from '../DaemonReclaimOptions';

import {
  OPERATION_CHILD,
  OPERATION_GROUP,
  operationTree,
  recordGroups,
  recordsRemain,
  stat
} from './OperationGroupFixture';
import { DEAD_PID, createFakeGroup } from './OrphanReaperFixture';
import type { IFakeGroup } from './OrphanReaperFixture';

const REUSED_START: string = '999';
const SHELL_SESSION: number = 3000;

async function reapAsync(processes: readonly IProcessStat[]): Promise<IFakeGroup & { outcome: string }> {
  const fake: IFakeGroup = createFakeGroup({ exitsOn: 'SIGTERM', processes });
  const lockfilePath: string = recordGroups([OPERATION_GROUP]);
  const outcome: string = await reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, fake.options);
  expect(recordsRemain(lockfilePath)).toBe(false);
  return { ...fake, outcome };
}

it('signals a recorded group whose leader is alive with the recorded start time', async () => {
  const result: IFakeGroup & { outcome: string } = await reapAsync(operationTree(OPERATION_GROUP));
  expect(result.outcome).toBe('terminated');
  expect(result.targets).toEqual([OPERATION_GROUP]);
  expect(result.logs).toEqual([expect.stringContaining(`groups ${OPERATION_GROUP} were terminated`)]);
});

it('reports a group that needed SIGKILL to onOrphansReaped as killed instead of logging it', async () => {
  const fake: IFakeGroup = createFakeGroup({ exitsOn: 'SIGKILL', processes: operationTree(OPERATION_GROUP) });
  const reaps: IDaemonOrphanReap[] = [];
  const options: IDaemonOrphanReaperOptions = {
    ...fake.options,
    onOrphansReaped: (reap: IDaemonOrphanReap) => reaps.push(reap)
  };
  const lockfilePath: string = recordGroups([OPERATION_GROUP]);
  await expect(reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, options)).resolves.toBe('killed');
  expect(reaps).toEqual([{ daemonPid: DEAD_PID, processGroupIds: [OPERATION_GROUP], outcome: 'killed' }]);
  expect(fake.logs).toEqual([]);
});

it('signals a group whose leader has exited when every live member is in its session', async () => {
  const result: IFakeGroup & { outcome: string } = await reapAsync(operationTree(OPERATION_GROUP, false));
  expect(result.outcome).toBe('terminated');
  expect(result.targets).toEqual([OPERATION_GROUP]);
});

it('signals a group whose leader is a zombie when every live member is in its session', async () => {
  const zombieLeader: IProcessStat = { ...stat(OPERATION_GROUP, OPERATION_GROUP), exited: true };
  const processes: IProcessStat[] = [zombieLeader, ...operationTree(OPERATION_GROUP, false)];
  const result: IFakeGroup & { outcome: string } = await reapAsync(processes);
  expect(result.outcome).toBe('terminated');
  expect(result.targets).toEqual([OPERATION_GROUP]);
});

it('never signals a reused pid: the leader has another start time', async () => {
  const reused: IProcessStat = { ...stat(OPERATION_GROUP, OPERATION_GROUP), startTime: REUSED_START };
  const result: IFakeGroup & { outcome: string } = await reapAsync([reused]);
  expect(result.outcome).toBe('none');
  expect(result.signals).toEqual([]);
});

it('never signals a leader that no longer leads its own session', async () => {
  const result: IFakeGroup & { outcome: string } = await reapAsync([
    stat(OPERATION_GROUP, OPERATION_GROUP, SHELL_SESSION)
  ]);
  expect(result.signals).toEqual([]);
});

it('never signals a leaderless group of another session, such as a shell job with a reused pid', async () => {
  const result: IFakeGroup & { outcome: string } = await reapAsync([
    stat(OPERATION_CHILD, OPERATION_GROUP, SHELL_SESSION)
  ]);
  expect(result.signals).toEqual([]);
});

it('never signals a group whose only members have exited', async () => {
  const zombie: IProcessStat = { ...stat(OPERATION_CHILD, OPERATION_GROUP), exited: true };
  const result: IFakeGroup & { outcome: string } = await reapAsync([zombie]);
  expect(result.outcome).toBe('none');
  expect(result.signals).toEqual([]);
});

it('does nothing when the dead daemon recorded no groups', async () => {
  const fake: IFakeGroup = createFakeGroup({ processes: operationTree(OPERATION_GROUP) });
  const lockfilePath: string = recordGroups([]);
  await expect(
    reapDeadDaemonOperationGroupsAsync(`${lockfilePath}.missing`, DEAD_PID, fake.options)
  ).resolves.toBe('none');
  expect(fake.signals).toEqual([]);
});
