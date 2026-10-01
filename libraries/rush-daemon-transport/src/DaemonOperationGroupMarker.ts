// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const ENTRY_SEPARATOR: string = '=';

/**
 * The environment variable that marks every process a daemon starts while it records operation process groups.
 *
 * @remarks
 * On Linux, a daemon sets it in its own `process.env` to the folder in which it records its operations' process
 * groups, so every process that it starts, and every descendant that keeps its environment, carries it. After
 * the daemon dies, a recorded group whose leader has exited is signaled only if one of its live members still
 * carries the marker of that folder: without it, a later process that got the recorded pid and called `setsid()`
 * would pass for the operation. A host that builds a child's environment from a request instead of from its own
 * `process.env` passes on its own value, never the request's. The variable is not part of a daemon's identity.
 *
 * @beta
 */
export const DAEMON_OPERATION_GROUPS_ENV_VAR: 'RUSHD_OPERATION_GROUPS' = 'RUSHD_OPERATION_GROUPS';

/** Removes the marker that {@link markOperationGroups} set, unless something else has replaced it. */
export type UnmarkOperationGroups = () => void;

/** The environment entry (`NAME=value`) that marks the operations whose groups are recorded in `folder`. */
export function getOperationGroupsMarker(folder: string): string {
  return `${DAEMON_OPERATION_GROUPS_ENV_VAR}${ENTRY_SEPARATOR}${folder}`;
}

/** Marks the processes that this process starts from now on as operations recorded in `folder`. */
export function markOperationGroups(folder: string): UnmarkOperationGroups {
  process.env[DAEMON_OPERATION_GROUPS_ENV_VAR] = folder;
  return () => {
    if (process.env[DAEMON_OPERATION_GROUPS_ENV_VAR] === folder) {
      delete process.env[DAEMON_OPERATION_GROUPS_ENV_VAR];
    }
  };
}
