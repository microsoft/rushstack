// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  DaemonRestartReason,
  IDaemonWorkspaceInputsChangedRestartReason
} from '@rushstack/rush-daemon-protocol';

/** A list names at most this many items, then says how many more there are. */
const MAX_LISTED_NAMES: number = 4;

/**
 * Which request needs the restart that a cause explains: the request that waits for it, or another request, which a
 * rushx script waits for so that the restart does not wait for the script, or which a request is queued behind.
 *
 * @beta
 */
export type DaemonRestartRequester = 'thisRequest' | 'anotherRequest';

/**
 * Says why the daemon restarts, completing "the daemon restarts <cause>", for example
 * `because common/config/rush/pnpm-lock.yaml changed`. Names environment variables, never their values.
 *
 * @returns `undefined` for a reason kind that this version does not know.
 * @beta
 */
export function formatDaemonRestartCause(
  reason: DaemonRestartReason,
  requester: DaemonRestartRequester
): string | undefined {
  const anotherRequest: boolean = requester === 'anotherRequest';
  switch (reason.kind) {
    case 'installationChanged':
      return (
        `because ${anotherRequest ? "the daemon's" : 'its'} installation at ${reason.folder} was ` +
        `${reason.change}`
      );
    case 'environmentChanged': {
      const names: string = reason.variableNames.length ? ` in ${formatList(reason.variableNames)}` : '';
      return `because ${anotherRequest ? 'its' : "this request's"} environment differs from the daemon's${names}`;
    }
    case 'workspaceInputsChanged':
      return `because ${formatList(getWorkspaceInputClauses(reason, anotherRequest), Infinity)}`;
    case 'nativeMutation':
      return `because ${anotherRequest ? 'it' : 'this request'} runs rush ${reason.commandName}`;
    default:
      return undefined;
  }
}

function getWorkspaceInputClauses(
  reason: IDaemonWorkspaceInputsChangedRestartReason,
  anotherRequest: boolean
): string[] {
  const { installationFiles, implementationFiles, selectedRushVersion } = reason;
  const clauses: string[] = [];
  if (installationFiles) {
    clauses.push(
      installationFiles.length
        ? `${formatList(installationFiles)} changed`
        : "the workspace's installation changed"
    );
  }
  if (implementationFiles) {
    const files: string = implementationFiles.length ? ` (${formatList(implementationFiles)})` : '';
    clauses.push(`the code of Rush or a Rush plugin changed${files}`);
  }
  if (selectedRushVersion !== undefined) {
    clauses.push(`${anotherRequest ? 'it' : 'this request'} selects Rush ${selectedRushVersion}`);
  }
  if (!clauses.length) clauses.push('the inputs that the daemon started with changed');
  return clauses;
}

/** Joins items as "a", "a and b" or "a, b and c", naming at most `maxListed` of them. */
function formatList(items: ReadonlyArray<string>, maxListed: number = MAX_LISTED_NAMES): string {
  const listed: string[] = items.slice(0, maxListed);
  const more: number = items.length - listed.length;
  if (more > 0) listed.push(`${more} more`);
  return listed.length > 1 ? `${listed.slice(0, -1).join(', ')} and ${listed[listed.length - 1]}` : listed[0];
}
