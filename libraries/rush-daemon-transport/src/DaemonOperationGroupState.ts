// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationGroupRecord } from './DaemonOperationGroups';
import type { IProcessStat } from './DaemonProcessStat';
import type { IReapContext } from './DaemonReapOptions';
import type { DaemonOperationGroupLeftRunningReason } from './DaemonReclaimOptions';

/** A record whose group is read, with the context of its reap and the marker of the daemon that wrote it. */
export interface IOperationGroupProbe {
  readonly record: IOperationGroupRecord;
  readonly context: IReapContext;
  readonly marker: string;
}

/** How a recorded operation process group looks now. */
export interface IOperationGroupState extends IOperationGroupProbe {
  /** The process whose PID is the group's ID, unless it has exited. */
  readonly leader: IProcessStat | undefined;
  /** The processes of the group that have not exited. */
  readonly members: readonly IProcessStat[];
}

interface IReasonCheck {
  readonly reason: DaemonOperationGroupLeftRunningReason;
  readonly applies: (state: IOperationGroupState) => boolean;
}

function isCallerGroup({ record, context }: IOperationGroupState): boolean {
  const ownGroupId: number | undefined = context.ops.ownGroupId();
  return record.groupId === context.selfPid || ownGroupId === undefined || ownGroupId === record.groupId;
}

function isDaemonPidInUse({ record, context }: IOperationGroupState): boolean {
  const { deadPid } = context;
  return context.deadPidReused ? record.groupId === deadPid : context.ops.isProcessAlive(deadPid);
}

function isRecordedLeader(leader: IProcessStat, { groupId, startTime }: IOperationGroupRecord): boolean {
  return leader.startTime === startTime && leader.groupId === groupId && leader.sessionId === groupId;
}

function hasOtherLeader({ record, leader }: IOperationGroupState): boolean {
  return leader !== undefined && !isRecordedLeader(leader, record);
}

function hasMemberInOtherSession({ record, leader, members }: IOperationGroupState): boolean {
  return leader === undefined && members.some((member: IProcessStat) => member.sessionId !== record.groupId);
}

function lacksMarker({ context, marker, leader, members }: IOperationGroupState): boolean {
  const isMarked = (member: IProcessStat): boolean => context.ops.hasEnvironmentEntry(member.pid, marker);
  return leader === undefined && !members.some(isMarked);
}

// The conditions of `isProvenOperationGroup`, in its order, each as the reason why a group fails it.
const REASON_CHECKS: readonly IReasonCheck[] = [
  { reason: 'callerGroup', applies: isCallerGroup },
  { reason: 'daemonPidInUse', applies: isDaemonPidInUse },
  { reason: 'leaderChanged', applies: hasOtherLeader },
  { reason: 'otherSession', applies: hasMemberInOtherSession },
  { reason: 'noMarker', applies: lacksMarker }
];

/** Reads the leader and the live members of the probed record's group. */
export function readOperationGroupState(probe: IOperationGroupProbe): IOperationGroupState {
  const { ops } = probe.context;
  const stat: IProcessStat | undefined = ops.readProcessStat(probe.record.groupId);
  const leader: IProcessStat | undefined = stat?.exited ? undefined : stat;
  return { ...probe, leader, members: ops.listLiveGroupMembers(probe.record.groupId) };
}

/**
 * The first condition that the group fails, in the order in which `isProvenOperationGroup` checks them, or
 * `undefined` when it passes every one.
 */
export function findOperationGroupLeftRunningReason(
  state: IOperationGroupState
): DaemonOperationGroupLeftRunningReason | undefined {
  return REASON_CHECKS.find((check: IReasonCheck) => check.applies(state))?.reason;
}
