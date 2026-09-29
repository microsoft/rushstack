// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonOrphanReap, IDaemonReclaimOptions } from '@rushstack/rush-daemon-transport';

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
 * Returns the reclaim options that write each set of stopped process groups to `onLog` as
 * {@link formatOrphanReapLogLine}'s line. Without `onLog`, the transport reports each set as a
 * `RUSH_DAEMON_ORPHANS_REAPED` process warning.
 */
export function getOrphanReapLogOptions(
  onLog: ((message: string) => void) | undefined
): IDaemonReclaimOptions {
  if (!onLog) return {};
  return { onOrphansReaped: (reap: IDaemonOrphanReap) => onLog(formatOrphanReapLogLine(reap)) };
}
