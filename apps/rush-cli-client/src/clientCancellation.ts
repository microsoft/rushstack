// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';

import type { DaemonClientOutcome } from '@rushstack/rush-client-core';

/** Signals that cancel a daemon-routed command. */
export const CANCELLATION_SIGNALS: ReadonlyArray<NodeJS.Signals> = ['SIGINT', 'SIGTERM', 'SIGHUP'];

const SIGNAL_EXIT_CODE_BASE: number = 128;

/**
 * Returns the conventional shell exit code for a process terminated by `signal` (128 + signal number),
 * e.g. 130 for SIGINT and 143 for SIGTERM.
 */
export function getSignalExitCode(signal: NodeJS.Signals): number {
  return SIGNAL_EXIT_CODE_BASE + (os.constants.signals[signal] ?? os.constants.signals.SIGINT);
}

/** Formats the notice printed when a daemon-routed command is cancelled. */
export function formatCancellationMessage(commandName: string): string {
  return `rush-client: ${commandName} cancelled.\n`;
}

/**
 * Returns whether a daemon outcome represents a cancelled command. A completed (non-aborted) result wins over a
 * late signal, and a rejection is never reported as a cancellation.
 */
export function isCancelledOutcome(outcome: DaemonClientOutcome, signalled: boolean): boolean {
  switch (outcome.kind) {
    case 'result':
      return outcome.result.outcome === 'aborted';
    case 'rejected':
      return false;
    default:
      return signalled;
  }
}
