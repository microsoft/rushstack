// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';

import type { DaemonClientOutcome } from '@rushstack/rush-client-core';

import type { ClientName } from './ClientAdmissionControls';

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

/**
 * Formats the notice printed as soon as the client asks the daemon to cancel a daemon-routed command, which can take
 * the daemon seconds, for example while it prepares the workspace graph. `clientName` begins the line, as it does
 * the client's other lines.
 */
export function formatCancellingMessage(
  commandName: string,
  timeoutMs: number,
  clientName: ClientName = 'rush-client'
): string {
  const seconds: number = Math.round(timeoutMs / 1000);
  return `${clientName}: cancelling ${commandName}; waiting up to ${seconds} s for rushd to stop the request.\n`;
}

/**
 * Formats the notice printed when a daemon-routed command is cancelled. `stopUnconfirmed` says that the client
 * stopped waiting before the daemon confirmed that the request stopped. `clientName` begins the line.
 */
export function formatCancellationMessage(
  commandName: string,
  stopUnconfirmed: boolean = false,
  clientName: ClientName = 'rush-client'
): string {
  return stopUnconfirmed
    ? `${clientName}: ${commandName} cancelled, but rushd did not confirm that the request stopped; ` +
        'it may still be stopping.\n'
    : `${clientName}: ${commandName} cancelled.\n`;
}

/**
 * Formats the notice printed when a daemon-routed command is cancelled because the process reading its output
 * exited, for example `head` in `rush-client build | head -5`. It is the only notice of that cancellation.
 * `clientName` begins the line.
 */
export function formatClosedOutputMessage(
  commandName: string,
  streamName: string,
  code: string | undefined,
  stopUnconfirmed: boolean,
  clientName: ClientName = 'rush-client'
): string {
  const reason: string = `the process reading its ${streamName} exited${code ? ` (${code})` : ''}`;
  return stopUnconfirmed
    ? `${clientName}: ${commandName} cancelled, because ${reason}, but rushd did not confirm that the request ` +
        'stopped; it may still be stopping.\n'
    : `${clientName}: ${commandName} cancelled, because ${reason}.\n`;
}

/**
 * Returns whether a daemon outcome represents a cancelled command. A result is cancelled when the daemon reports it
 * as aborted, even if an operation failure determines its semantic outcome, unless the daemon aborted it for its own
 * reason (such as a daemon shutdown), which the result's error message carries and a signal did not cause. A
 * completed (non-aborted) result wins over a late signal. A rejection is only a cancellation when the client was
 * signalled and the daemon could not route the request: that is how the daemon answers a request cancelled before
 * engine initialization. A rejection of the request itself (for example an invalid or unsupported request) is
 * always reported.
 */
export function isCancelledOutcome(outcome: DaemonClientOutcome, signalled: boolean): boolean {
  switch (outcome.kind) {
    case 'result':
      return outcome.result.aborted && (signalled || !outcome.result.errorMessage);
    case 'rejected':
      return signalled && outcome.rejection.code === 'routingFailed';
    default:
      return signalled;
  }
}
