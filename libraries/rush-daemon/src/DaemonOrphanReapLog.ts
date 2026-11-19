// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { formatOperationGroupLeftRunning } from '@rushstack/rush-daemon-transport';
import type {
  IDaemonOperationGroupLeftRunning,
  IDaemonOrphanReap,
  IDaemonReclaimOptions
} from '@rushstack/rush-daemon-transport';

/** Lists process groups as `process group A` or `process groups A, B and C`; the log names every group. */
function formatProcessGroups(groupIds: readonly number[]): string {
  const items: string[] = groupIds.map(String);
  const last: string | undefined = items.pop();
  return items.length === 0 ? `process group ${last}` : `process groups ${items.join(', ')} and ${last}`;
}

/**
 * Returns the daemon log line for the operations that an exited daemon left running and that this daemon
 * stopped when it reclaimed the workspace's endpoint, so that they cannot overwrite the outputs of its requests.
 */
export function formatOrphanReapLogLine(reap: IDaemonOrphanReap): string {
  const operations: string =
    `the operations that the exited daemon (PID ${reap.daemonPid}) left running ` +
    `(${formatProcessGroups(reap.processGroupIds)})`;
  return reap.outcome === 'killed'
    ? `rushd: killed ${operations}; they did not exit after SIGTERM`
    : `rushd: stopped ${operations}`;
}

/**
 * Returns the daemon log line for a process group that an exited daemon recorded for an operation, and that
 * this daemon left running when it reclaimed the workspace's endpoint, because it could not prove that the
 * group still ran that operation. Whoever later finds the group's processes can find out why here.
 */
export function formatOperationGroupLeftRunningLogLine(group: IDaemonOperationGroupLeftRunning): string {
  return `rushd: ${formatOperationGroupLeftRunning(group)}`;
}

/**
 * Returns the reclaim options that write each set of stopped process groups to `onLog` as
 * {@link formatOrphanReapLogLine}'s line, and each recorded operation group that the reclaim left running as
 * {@link formatOperationGroupLeftRunningLogLine}'s. Without `onLog`, the transport reports each set of
 * stopped groups as a `RUSH_DAEMON_ORPHANS_REAPED` process warning, and no group that it left running.
 */
export function getOrphanReapLogOptions(
  onLog: ((message: string) => void) | undefined
): IDaemonReclaimOptions {
  if (!onLog) return {};
  return {
    onOrphansReaped: (reap: IDaemonOrphanReap) => onLog(formatOrphanReapLogLine(reap)),
    onOperationGroupLeftRunning: (group: IDaemonOperationGroupLeftRunning) =>
      onLog(formatOperationGroupLeftRunningLogLine(group))
  };
}
