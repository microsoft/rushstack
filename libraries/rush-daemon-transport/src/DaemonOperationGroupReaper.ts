// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { terminateProcessGroupsAsync } from './DaemonGroupTermination';
import type { DaemonOrphanReapOutcome } from './DaemonGroupTermination';
import {
  getOperationGroupsFolder,
  readOperationGroupRecords,
  removeOperationGroupRecords
} from './DaemonOperationGroups';
import type { IOperationGroupRecord } from './DaemonOperationGroups';
import { isOwnedEntry } from './DaemonOwnedEntry';
import type { IProcessStat } from './DaemonProcessStat';
import { createReapContext, isSignalableGroup, reportOrphansReaped } from './DaemonReapOptions';
import type { IDaemonOrphanReaperOptions, IReapContext } from './DaemonReapOptions';
import type { IDaemonOrphanReap } from './DaemonReclaimOptions';

const NO_MEMBERS: number = 0;
const LIST_SEPARATOR: string = ', ';
const NOTHING_REAPED: DaemonOrphanReapOutcome = 'none';

function isSameLeader(leader: IProcessStat, record: IOperationGroupRecord): boolean {
  const { groupId } = record;
  return leader.startTime === record.startTime && leader.groupId === groupId && leader.sessionId === groupId;
}

// Every group lives inside one session. A group whose session is its own id was created by setsid() of
// the recorded leader (or of a reused pid that also called setsid(), which needs the pid space to wrap);
// a shell job's group lives in its shell's session and is rejected. A stale record's group usually has no
// process at all, which kill() proves without reading every process's record.
function isLeaderlessOperationGroup(groupId: number, context: IReapContext): boolean {
  if (!context.ops.mayHaveMembers(groupId)) return false;
  const members: IProcessStat[] = context.ops.listLiveGroupMembers(groupId);
  return members.length > NO_MEMBERS && members.every((member: IProcessStat) => member.sessionId === groupId);
}

// A zombie leader has exited, and only its parent can remove it, so it proves nothing about its group.
function readLiveLeader(groupId: number, context: IReapContext): IProcessStat | undefined {
  const leader: IProcessStat | undefined = context.ops.readProcessStat(groupId);
  return leader?.exited ? undefined : leader;
}

function isProvenOperationGroup(record: IOperationGroupRecord, context: IReapContext): boolean {
  if (!isSignalableGroup(record.groupId, context)) return false;
  const leader: IProcessStat | undefined = readLiveLeader(record.groupId, context);
  return leader ? isSameLeader(leader, record) : isLeaderlessOperationGroup(record.groupId, context);
}

async function terminateAndLogAsync(
  context: IReapContext,
  groupIds: number[]
): Promise<DaemonOrphanReapOutcome> {
  const outcome: IDaemonOrphanReap['outcome'] = await terminateProcessGroupsAsync(context, groupIds);
  reportOrphansReaped(
    context,
    { daemonPid: context.deadPid, processGroupIds: groupIds, outcome },
    `Reclaimed dead daemon ${context.deadPid}: its orphaned operation process groups ` +
      `${groupIds.join(LIST_SEPARATOR)} were ${outcome}.`
  );
  return outcome;
}

async function reapRecordedGroupsAsync(
  folder: string,
  context: IReapContext
): Promise<DaemonOrphanReapOutcome> {
  const groupIds: number[] = readOperationGroupRecords(folder)
    .filter((record: IOperationGroupRecord) => isProvenOperationGroup(record, context))
    .map((record: IOperationGroupRecord) => record.groupId);
  const outcome: DaemonOrphanReapOutcome =
    groupIds.length > NO_MEMBERS ? await terminateAndLogAsync(context, groupIds) : NOTHING_REAPED;
  removeOperationGroupRecords(folder);
  return outcome;
}

/**
 * Terminates the detached operation process groups that dead daemon `deadPid` recorded while it ran
 * (see `startOperationGroupRecording`), then deletes the records.
 *
 * @remarks
 * A record is signaled only when it provably still names the daemon's operation: its leader is alive with
 * the recorded start time and still leads group and session `groupId` (a reused pid has another start
 * time), or its leader has exited (a zombie leader has too) and every live member of the group is in
 * session `groupId`. Unproven records are dropped without a signal. Records survive a failed reap, so the
 * next reclaim retries.
 * A record folder that is a symbolic link, or that another user owns, is left alone without a signal.
 * Call only under the reclaim mutex, after the daemon has been proven dead, or its pid proven reused
 * (`deadPidReused`).
 */
export async function reapDeadDaemonOperationGroupsAsync(
  lockfilePath: string,
  deadPid: number,
  options: IDaemonOrphanReaperOptions = {}
): Promise<DaemonOrphanReapOutcome> {
  const context: IReapContext = createReapContext(deadPid, options);
  const folder: string = getOperationGroupsFolder(lockfilePath, deadPid);
  return isOwnedEntry(folder, 'directory', context.uid)
    ? reapRecordedGroupsAsync(folder, context)
    : NOTHING_REAPED;
}
