// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationGroupRecord } from './DaemonOperationGroups';
import type { IProcessStat } from './DaemonProcessStat';
import { isSignalableGroup } from './DaemonReapOptions';
import type { IReapContext } from './DaemonReapOptions';

function isSameLeader(leader: IProcessStat, record: IOperationGroupRecord): boolean {
  const { groupId } = record;
  return leader.startTime === record.startTime && leader.groupId === groupId && leader.sessionId === groupId;
}

// Every group lives inside one session. A group whose session is its own id was created by setsid() of
// the recorded leader, or of a reused pid that also called setsid(), which needs the pid space to wrap.
// So one live member must also carry the marker that the daemon gives every process it starts: a reused
// pid's session has no reason to. A shell job's group lives in its shell's session and is rejected. A stale
// record's group usually has no process at all, which kill() proves without reading every process's record.
function isLeaderlessOperationGroup(groupId: number, context: IReapContext, marker: string): boolean {
  if (!context.ops.mayHaveMembers(groupId)) return false;
  const members: IProcessStat[] = context.ops.listLiveGroupMembers(groupId);
  return (
    members.every((member: IProcessStat) => member.sessionId === groupId) &&
    members.some((member: IProcessStat) => context.ops.hasEnvironmentEntry(member.pid, marker))
  );
}

// A zombie leader has exited, and only its parent can remove it, so it proves nothing about its group.
function readLiveLeader(groupId: number, context: IReapContext): IProcessStat | undefined {
  const leader: IProcessStat | undefined = context.ops.readProcessStat(groupId);
  return leader?.exited ? undefined : leader;
}

/**
 * `true` when `record` provably still names an operation of the dead daemon whose records carry `marker`
 * (see `getOperationGroupsMarker`), so that its group may be signaled.
 */
export function isProvenOperationGroup(
  record: IOperationGroupRecord,
  context: IReapContext,
  marker: string
): boolean {
  if (!isSignalableGroup(record.groupId, context)) return false;
  const leader: IProcessStat | undefined = readLiveLeader(record.groupId, context);
  return leader ? isSameLeader(leader, record) : isLeaderlessOperationGroup(record.groupId, context, marker);
}
