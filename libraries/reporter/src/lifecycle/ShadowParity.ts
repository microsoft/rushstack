// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { ICommandResultPayload, IOperationStatusChangedPayload } from './LifecycleEvents';

/**
 * A shadow-phase summary derived from the structured event stream, used to
 * validate parity with legacy behavior.
 *
 * @beta
 */
export interface IShadowResultSummary {
  /**
   * The command name, when a command result was present.
   */
  readonly commandName?: string;

  /**
   * Whether the command succeeded.
   */
  readonly succeeded: boolean;

  /**
   * The derived process exit code.
   */
  readonly exitCode: number;

  /**
   * The number of operations that reached each status.
   */
  readonly operationCounts: { readonly [status: string]: number };
}

/**
 * Derives the process exit code from a structured event stream.
 *
 * @remarks
 * This shadow-phase helper validates exit-code parity: a `commandResult` maps a
 * successful command, including warning-only success, to `0` and a failure to
 * its non-zero code. A `sessionCompleted` code is used as a fallback. The
 * authoritative exit-code semantics are defined separately.
 *
 * @param events - the structured events emitted during the command
 *
 * @beta
 */
export function deriveExitCodeFromEvents(events: readonly IReporterEventEnvelope<unknown>[]): number {
  let commandResult: ICommandResultPayload | undefined;
  for (const event of events) {
    if (event.parentSessionId === undefined && event.type === 'commandResult') {
      commandResult = event.payload as ICommandResultPayload;
    }
  }
  if (commandResult !== undefined) {
    if (commandResult.succeeded) {
      return 0;
    }
    return commandResult.exitCode !== 0 ? commandResult.exitCode : 1;
  }

  let sessionExitCode: number | undefined;
  for (const event of events) {
    if (event.parentSessionId === undefined && event.type === 'sessionCompleted') {
      sessionExitCode = (event.payload as { exitCode: number }).exitCode;
    }
  }

  return sessionExitCode ?? 0;
}

/**
 * Summarizes a command's structured event stream for parity validation.
 *
 * @remarks
 * The returned counts and result are shadow-phase parity data, not the
 * allowlisted telemetry projection.
 *
 * @param events - the structured events emitted during the command
 *
 * @beta
 */
export function summarizeShadowResult(
  events: readonly IReporterEventEnvelope<unknown>[]
): IShadowResultSummary {
  const operationStatuses: Map<string, IOperationStatusChangedPayload['status']> = new Map();
  let commandName: string | undefined;
  let commandSucceeded: boolean | undefined;

  for (const event of events) {
    if (event.parentSessionId !== undefined) {
      continue;
    }
    if (event.type === 'operationStatusChanged') {
      const payload: IOperationStatusChangedPayload = event.payload as IOperationStatusChangedPayload;
      operationStatuses.set(payload.operationId, payload.status);
    } else if (event.type === 'commandResult') {
      const payload: ICommandResultPayload = event.payload as ICommandResultPayload;
      commandName = payload.commandName;
      commandSucceeded = payload.succeeded;
    }
  }

  const operationCounts: { [status: string]: number } = {};
  for (const status of operationStatuses.values()) {
    operationCounts[status] = (operationCounts[status] ?? 0) + 1;
  }

  const exitCode: number = deriveExitCodeFromEvents(events);
  return {
    commandName,
    succeeded: commandSucceeded ?? exitCode === 0,
    exitCode,
    operationCounts
  };
}
