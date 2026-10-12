// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// AgentProgressRenderer loads this module before @microsoft/rush-lib, so it stays free of heavy imports.

import type { IDaemonContinuingOperations } from '@rushstack/rush-daemon-protocol';

/** The most names of operations that an earlier failed command left running that a line lists. */
const MAX_CONTINUING_OPERATION_NAMES: number = 3;

/**
 * Says what a request waits for while it waits only for operations that an earlier failed command left running,
 * for example "2 operations left running by an earlier failed command".
 */
export function formatContinuingOperations({ count }: IDaemonContinuingOperations): string {
  return `${count} ${count === 1 ? 'operation' : 'operations'} left running by an earlier failed command`;
}

/**
 * Names those operations after a colon, for example ": a (build), b (build), c (build) +4 more", where the count
 * says how many are not named. Returns an empty string if the daemon named none.
 */
export function formatContinuingOperationNames({ count, names }: IDaemonContinuingOperations): string {
  const shown: ReadonlyArray<string> = names.slice(0, MAX_CONTINUING_OPERATION_NAMES);
  if (shown.length === 0) {
    return '';
  }
  const more: number = count - shown.length;
  return `: ${shown.join(', ')}${more > 0 ? ` +${more} more` : ''}`;
}
