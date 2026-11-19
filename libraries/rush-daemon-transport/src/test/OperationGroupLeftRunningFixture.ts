// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import type { IDaemonProcessGroupOps } from '../DaemonProcessGroup';
import type { IProcessStat } from '../DaemonProcessStat';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';
import type { IDaemonOperationGroupLeftRunning } from '../DaemonReclaimOptions';

import { OPERATION_GROUP, recordGroups, stat } from './OperationGroupFixture';
import { DEAD_PID, createFakeGroup } from './OrphanReaperFixture';
import type { IFakeGroup, IFakeGroupSpec } from './OrphanReaperFixture';

/** A live process with the PID {@link OPERATION_GROUP} that started later than the recorded leader. */
export const REUSED_LEADER: IProcessStat = { ...stat(OPERATION_GROUP, OPERATION_GROUP), startTime: '999' };

/** What a reap of one recorded group returned, signaled and reported as left running. */
export interface ILeftRunningReap {
  readonly fake: IFakeGroup;
  readonly outcome: string;
  readonly groups: readonly IDaemonOperationGroupLeftRunning[];
}

/**
 * Reaps the dead daemon's record of {@link OPERATION_GROUP}, or with `deadPidReused` its record of the group
 * whose ID is its own PID, in a fake process table whose groups exit on SIGTERM. `options` override the
 * table's, and the reap's `onOperationGroupLeftRunning` collects its reports.
 */
export async function reapLeftRunningAsync(
  spec: IFakeGroupSpec,
  options: IDaemonOrphanReaperOptions = {}
): Promise<ILeftRunningReap> {
  const fake: IFakeGroup = createFakeGroup({ exitsOn: 'SIGTERM', ...spec });
  const groups: IDaemonOperationGroupLeftRunning[] = [];
  const onOperationGroupLeftRunning = (group: IDaemonOperationGroupLeftRunning): number => groups.push(group);
  const lockfilePath: string = recordGroups([options.deadPidReused ? DEAD_PID : OPERATION_GROUP]);
  const reapOptions: IDaemonOrphanReaperOptions = {
    ...fake.options,
    onOperationGroupLeftRunning,
    ...options
  };
  const outcome: string = await reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, reapOptions);
  return { fake, outcome, groups };
}

/** The options of `fake`, with its `listLiveGroupMembers` replaced. */
export function withGroupMembers(
  fake: IFakeGroup,
  listLiveGroupMembers: IDaemonProcessGroupOps['listLiveGroupMembers']
): IDaemonOrphanReaperOptions {
  return { ...fake.options, ops: { ...(fake.options.ops as IDaemonProcessGroupOps), listLiveGroupMembers } };
}
