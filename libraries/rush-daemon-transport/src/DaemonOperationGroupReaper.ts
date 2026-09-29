// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { terminateProcessGroupsAsync } from './DaemonGroupTermination';
import type { DaemonOrphanReapOutcome } from './DaemonGroupTermination';
import { reportOperationGroupsLeftRunning } from './DaemonOperationGroupLeftRunning';
import { getOperationGroupsMarker } from './DaemonOperationGroupMarker';
import { isProvenOperationGroup } from './DaemonOperationGroupProof';
import {
  getOperationGroupsFolder,
  readOperationGroupRecords,
  removeOperationGroupRecords
} from './DaemonOperationGroups';
import type { IOperationGroupRecord } from './DaemonOperationGroups';
import { isOwnedEntry } from './DaemonOwnedEntry';
import { withProcessReadsOnce } from './DaemonProcessReadsOnce';
import { createReapContext, reportOrphansReaped } from './DaemonReapOptions';
import type { IDaemonOrphanReaperOptions, IReapContext } from './DaemonReapOptions';
import type { IDaemonOrphanReap } from './DaemonReclaimOptions';

const NO_MEMBERS: number = 0;
const LIST_SEPARATOR: string = ', ';
const NOTHING_REAPED: DaemonOrphanReapOutcome = 'none';

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
  const marker: string = getOperationGroupsMarker(folder);
  const records: IOperationGroupRecord[] = readOperationGroupRecords(folder);
  // The termination polls the groups itself, and never through these reads.
  const probe: IReapContext = withProcessReadsOnce(context);
  const proven: IOperationGroupRecord[] = records.filter((record: IOperationGroupRecord) =>
    isProvenOperationGroup(record, probe, marker)
  );
  const groupIds: number[] = proven.map((record: IOperationGroupRecord) => record.groupId);
  const outcome: DaemonOrphanReapOutcome =
    groupIds.length > NO_MEMBERS ? await terminateAndLogAsync(context, groupIds) : NOTHING_REAPED;
  removeOperationGroupRecords(folder);
  const unproven: IOperationGroupRecord[] = records.filter(
    (record: IOperationGroupRecord) => !proven.includes(record)
  );
  reportOperationGroupsLeftRunning(probe, { records: unproven, marker });
  return outcome;
}

/**
 * Terminates the detached operation process groups that dead daemon `deadPid` recorded while it ran
 * (see `startOperationGroupRecording`), then deletes the records.
 *
 * @remarks
 * A record is signaled only when it provably still names the daemon's operation: its leader is alive with
 * the recorded start time and still leads group and session `groupId` (a reused pid has another start
 * time), or its leader has exited (a zombie leader has too), every live member of the group is in
 * session `groupId`, and at least one of them carries the daemon's marker (`RUSHD_OPERATION_GROUPS` set to
 * the record folder; see `startOperationGroupRecording`). Unproven records are dropped without a signal, and
 * each whose group still has a live process goes to `options.onOperationGroupLeftRunning` with the first
 * condition that the group fails, judged on what the proof read of it. A daemon from a release before that
 * marker sets none, so the first reclaim after an upgrade drops its recorded groups whose leader has exited
 * and leaves them running.
 * Records survive a failed reap, so the next reclaim retries.
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
