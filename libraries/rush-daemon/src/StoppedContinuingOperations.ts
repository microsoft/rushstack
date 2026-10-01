// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonContinuingOperations } from '@rushstack/rush-daemon-protocol';

import { DaemonRequestDispatchError } from './DaemonRequestDispatcher';

/**
 * Adds to the rejection of a request whose client then runs the command in-process a line that says that the daemon
 * first stopped the operations that an earlier failed command left running (see `describeContinuingOperations`).
 * The line follows the rejection's first line, which the client prints as its fallback line, and precedes the others.
 */
export function addStoppedContinuingOperations(
  rejection: DaemonRequestDispatchError,
  stopped: IDaemonContinuingOperations
): DaemonRequestDispatchError {
  const lines: string[] = rejection.message.split('\n');
  const firstLineIndex: number = lines.findIndex((line: string) => line.trim() !== '');
  lines.splice(firstLineIndex + 1, 0, formatStoppedContinuingOperations(stopped));
  return new DaemonRequestDispatchError(rejection.code, lines.join('\n'), { cause: rejection });
}

/**
 * Formats that line, for example "rushd stopped 5 operations left running by an earlier failed command (a, b, c
 * +2 more), so that this command can run in-process.", where the count says how many are not named.
 */
export function formatStoppedContinuingOperations({ count, names }: IDaemonContinuingOperations): string {
  const more: number = count - names.length;
  const named: string = names.length > 0 ? ` (${names.join(', ')}${more > 0 ? ` +${more} more` : ''})` : '';
  return (
    `rushd stopped ${count} ${count === 1 ? 'operation' : 'operations'} left running by an earlier failed ` +
    `command${named}, so that this command can run in-process.`
  );
}
