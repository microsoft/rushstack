// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReapContext } from './DaemonReapOptions';

const POLL_INTERVAL_MS: number = 20;

/** Outcome of reaping a dead daemon's orphaned process groups. */
export type DaemonOrphanReapOutcome = 'none' | 'terminated' | 'killed';

function listExistingGroups(context: IReapContext, groupIds: readonly number[]): number[] {
  return groupIds.filter((groupId: number) => context.ops.groupExists(groupId));
}

function haveAllExited(context: IReapContext, groupIds: readonly number[]): boolean {
  return !groupIds.some((groupId: number) => context.ops.groupExists(groupId));
}

async function waitForGroupsExitAsync(context: IReapContext, groupIds: readonly number[]): Promise<boolean> {
  const deadline: number = context.ops.now() + context.graceMs;
  while (context.ops.now() < deadline) {
    if (haveAllExited(context, groupIds)) return true;
    await context.ops.delayAsync(POLL_INTERVAL_MS);
  }
  return haveAllExited(context, groupIds);
}

function signalExistingGroups(
  context: IReapContext,
  groupIds: readonly number[],
  signal: NodeJS.Signals
): void {
  for (const groupId of listExistingGroups(context, groupIds)) {
    context.ops.signalGroup(groupId, signal);
  }
}

/**
 * Sends SIGTERM to every group, then SIGKILL to those still present after `graceMs`, and throws if any is
 * still present after a further `graceMs`. The groups share each grace period. Call only for groups proven
 * to belong to the dead daemon, under the reclaim mutex.
 */
export async function terminateProcessGroupsAsync(
  context: IReapContext,
  groupIds: readonly number[]
): Promise<DaemonOrphanReapOutcome> {
  signalExistingGroups(context, groupIds, 'SIGTERM');
  if (await waitForGroupsExitAsync(context, groupIds)) return 'terminated';
  signalExistingGroups(context, groupIds, 'SIGKILL');
  if (await waitForGroupsExitAsync(context, groupIds)) return 'killed';
  throw new Error(`Processes of dead daemon ${context.deadPid} survived SIGKILL; not reclaiming its socket.`);
}
