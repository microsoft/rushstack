// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';

/**
 * The exit code returned for success, including warning-only success.
 *
 * @beta
 */
export const EXIT_CODE_SUCCESS: 0 = 0;

/**
 * The exit code returned for a Rush or operation failure and for logical cancellation.
 *
 * @beta
 */
export const EXIT_CODE_FAILURE: 1 = 1;

/**
 * The logical outcome of a command, independent of presentation.
 *
 * @beta
 */
export type RushCommandOutcome = 'succeeded' | 'failed' | 'cancelled' | 'signal';

/**
 * The resolved exit status of a command.
 *
 * @beta
 */
export interface IRushExitStatus {
  /**
   * The process exit code.
   */
  readonly exitCode: number;

  /**
   * The logical outcome.
   */
  readonly outcome: RushCommandOutcome;

  /**
   * The terminating OS signal, when the outcome is `signal`.
   */
  readonly signal?: NodeJS.Signals;
}

/**
 * Returns the conventional exit code for an OS signal, `128 + signalNumber`.
 *
 * @param signal - the terminating signal
 *
 * @beta
 */
export function getSignalExitCode(signal: NodeJS.Signals): number {
  const signalNumber: number | undefined = (os.constants.signals as Record<string, number>)[signal];
  return 128 + (signalNumber ?? 0);
}

/**
 * Options for {@link resolveExitStatus}.
 *
 * @beta
 */
export interface IResolveExitStatusOptions {
  /**
   * Whether the command had a Rush or operation failure. Warnings alone are not failures.
   */
  readonly hasFailures?: boolean;

  /**
   * Whether the command was logically cancelled or aborted.
   */
  readonly cancelled?: boolean;

  /**
   * The terminating OS signal, if any.
   */
  readonly signal?: NodeJS.Signals;
}

/**
 * Resolves a command's exit status from its outcome.
 *
 * @remarks
 * A signal termination yields the conventional signal-derived status.
 * Cancellation and failure yield `1`. Everything else, including warning-only
 * success, yields `0`. The reporter mode and diagnostic categories are never
 * inputs, so they can never select the exit code.
 *
 * @param options - the command outcome
 *
 * @beta
 */
export function resolveExitStatus(options: IResolveExitStatusOptions): IRushExitStatus {
  if (options.signal) {
    return { exitCode: getSignalExitCode(options.signal), outcome: 'signal', signal: options.signal };
  }
  if (options.cancelled) {
    return { exitCode: EXIT_CODE_FAILURE, outcome: 'cancelled' };
  }
  if (options.hasFailures) {
    return { exitCode: EXIT_CODE_FAILURE, outcome: 'failed' };
  }
  return { exitCode: EXIT_CODE_SUCCESS, outcome: 'succeeded' };
}

/**
 * Options for {@link resolveExitStatusFromEvents}.
 *
 * @beta
 */
export interface IResolveExitStatusFromEventsOptions {
  /**
   * Whether the command was logically cancelled or aborted.
   */
  readonly cancelled?: boolean;

  /**
   * The terminating OS signal, if any.
   */
  readonly signal?: NodeJS.Signals;
}

/**
 * Resolves a command's exit status from its structured event stream.
 *
 * @remarks
 * A failure is any failed command result, any error-severity diagnostic, or any
 * failed operation. Diagnostic categories and the selected reporter are never
 * consulted, so they cannot influence the exit code. Warning-severity
 * diagnostics never cause failure.
 *
 * @param events - the structured events emitted during the command
 * @param options - cancellation and signal state
 *
 * @beta
 */
export function resolveExitStatusFromEvents(
  events: readonly IReporterEventEnvelope<unknown>[],
  options: IResolveExitStatusFromEventsOptions = {}
): IRushExitStatus {
  let hasFailures: boolean = false;
  for (const event of events) {
    if (event.type === 'commandResult') {
      if ((event.payload as { succeeded: boolean }).succeeded === false) {
        hasFailures = true;
      }
    } else if (event.type === 'diagnosticEmitted') {
      if ((event.payload as { severity?: string }).severity === 'error') {
        hasFailures = true;
      }
    } else if (event.type === 'operationStatusChanged') {
      if ((event.payload as { status?: string }).status === 'failure') {
        hasFailures = true;
      }
    }
  }

  return resolveExitStatus({ hasFailures, cancelled: options.cancelled, signal: options.signal });
}
