// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonOrphanReap } from '@rushstack/rush-daemon-transport';

/** The most process groups that a line names before it says how many more were stopped. */
const MAX_NAMED_GROUPS: number = 4;

/** Lists process groups as `process group A`, `process groups A and B`, or `process groups A, B, C, D and 2 more`. */
function formatProcessGroups(groupIds: readonly number[]): string {
  const items: string[] = groupIds.slice(0, MAX_NAMED_GROUPS).map(String);
  if (groupIds.length > items.length) items.push(`${groupIds.length - items.length} more`);
  const last: string | undefined = items.pop();
  return items.length === 0 ? `process group ${last}` : `process groups ${items.join(', ')} and ${last}`;
}

/**
 * Returns the line that tells the user that the operations an exited daemon left running were stopped, so that
 * they cannot overwrite the outputs of this command.
 */
export function formatOrphanReapNotice(reap: IDaemonOrphanReap, rushx: boolean): string {
  const client: string = rushx ? 'rushx-client' : 'rush-client';
  const operations: string =
    `the operations that the exited daemon (PID ${reap.daemonPid}) left running ` +
    `(${formatProcessGroups(reap.processGroupIds)})`;
  return reap.outcome === 'killed'
    ? `${client}: Killed ${operations}; they did not exit after SIGTERM.`
    : `${client}: Stopped ${operations}.`;
}

/**
 * Where a reclaim line goes: the agent renderer when one is active, and otherwise stderr.
 */
export interface IOrphanReapNoticeTarget {
  readonly rushx: boolean;
  readonly agentRenderer: { note(line: string): void } | undefined;
  readonly writeStderr: (text: string) => void;
}

/**
 * Creates the `onOrphansReaped` callback that prints {@link formatOrphanReapNotice}'s line, in place of the
 * `RUSH_DAEMON_ORPHANS_REAPED` process warning.
 */
export function createOrphanReapNoticeHandler(
  target: IOrphanReapNoticeTarget
): (reap: IDaemonOrphanReap) => void {
  return (reap: IDaemonOrphanReap): void => {
    const line: string = formatOrphanReapNotice(reap, target.rushx);
    if (target.agentRenderer) target.agentRenderer.note(line);
    else target.writeStderr(`${line}\n`);
  };
}

/** Writes to this process's stderr. */
export function writeStderr(text: string): void {
  process.stderr.write(text);
}
