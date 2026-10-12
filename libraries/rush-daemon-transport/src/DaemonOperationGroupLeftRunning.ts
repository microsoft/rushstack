// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationGroupRecord } from './DaemonOperationGroups';
import { findOperationGroupLeftRunningReason, readOperationGroupState } from './DaemonOperationGroupState';
import type { IOperationGroupState } from './DaemonOperationGroupState';
import type { IReapContext } from './DaemonReapOptions';
import type {
  DaemonOperationGroupLeftRunningReason,
  IDaemonOperationGroupLeftRunning
} from './DaemonReclaimOptions';

const NO_MEMBERS: number = 0;
const WINDOWS_PLATFORM: NodeJS.Platform = 'win32';
// 0 and 1 are never operation groups, and kill(-0)/kill(-1) would probe our own group or every process.
const FIRST_USER_PID: number = 2;

type GroupCheck = (groupId: number, context: IReapContext) => boolean;

// The proof rejects the first two before it reads anything. kill() finds no process of a stale group, which
// spares a scan of every process's record, or of a group whose processes have all been reaped since the proof.
const WORTH_READING_CHECKS: readonly GroupCheck[] = [
  (groupId: number, context: IReapContext) => context.platform !== WINDOWS_PLATFORM,
  (groupId: number) => Number.isSafeInteger(groupId) && groupId >= FIRST_USER_PID,
  (groupId: number, context: IReapContext) => context.ops.mayHaveMembers(groupId)
];

/** The records that a reap removed without a signal, and the marker of the daemon that wrote them. */
export interface IUnprovenOperationGroups {
  readonly records: readonly IOperationGroupRecord[];
  readonly marker: string;
}

function isGroupWorthReading(groupId: number, context: IReapContext): boolean {
  return WORTH_READING_CHECKS.every((check: GroupCheck) => check(groupId, context));
}

function explainLeftRunning(
  record: IOperationGroupRecord,
  context: IReapContext,
  marker: string
): DaemonOperationGroupLeftRunningReason | undefined {
  if (!isGroupWorthReading(record.groupId, context)) return undefined;
  const state: IOperationGroupState = readOperationGroupState({ record, context, marker });
  return state.members.length > NO_MEMBERS ? findOperationGroupLeftRunningReason(state) : undefined;
}

// A probe that fails proves nothing about the group, and only its report is lost.
function tryExplainLeftRunning(
  record: IOperationGroupRecord,
  context: IReapContext,
  marker: string
): DaemonOperationGroupLeftRunningReason | undefined {
  try {
    return explainLeftRunning(record, context, marker);
  } catch {
    return undefined;
  }
}

function listGroupsLeftRunning(
  context: IReapContext,
  { records, marker }: IUnprovenOperationGroups
): IDaemonOperationGroupLeftRunning[] {
  return records.flatMap((record: IOperationGroupRecord) => {
    const reason: DaemonOperationGroupLeftRunningReason | undefined = tryExplainLeftRunning(
      record,
      context,
      marker
    );
    return reason ? [{ daemonPid: context.deadPid, processGroupId: record.groupId, reason }] : [];
  });
}

/**
 * Reports each of the records that a reap removed without a signal to `onOperationGroupLeftRunning`, with the
 * first condition of the proof that its group fails now, when the group still has a live process.
 *
 * @remarks
 * The reap passes the context that its proof read through (see `withProcessReadsOnce`), so a group is judged
 * on what the proof read of it, and is read here only when the proof did not read it. A group of which kill()
 * finds no process now is not reported, and neither is one with no live member, one that passes every
 * condition, or one whose read fails. Without the callback, nothing is read.
 */
export function reportOperationGroupsLeftRunning(
  context: IReapContext,
  unproven: IUnprovenOperationGroups
): void {
  const report: IReapContext['onOperationGroupLeftRunning'] = context.onOperationGroupLeftRunning;
  if (!report) return;
  for (const group of listGroupsLeftRunning(context, unproven)) report(group);
}
