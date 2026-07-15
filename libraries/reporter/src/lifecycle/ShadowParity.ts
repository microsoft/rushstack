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
  for (const event of events) {
    if (event.type === 'commandResult') {
      const payload: ICommandResultPayload = event.payload as ICommandResultPayload;
      if (payload.succeeded) {
        return 0;
      }
      return payload.exitCode !== 0 ? payload.exitCode : 1;
    }
  }

  for (const event of events) {
    if (event.type === 'sessionCompleted') {
      return (event.payload as { exitCode: number }).exitCode;
    }
  }

  return 0;
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
  const operationCounts: { [status: string]: number } = {};
  let commandName: string | undefined;
  let succeeded: boolean = true;

  for (const event of events) {
    if (event.type === 'operationStatusChanged') {
      const payload: IOperationStatusChangedPayload = event.payload as IOperationStatusChangedPayload;
      operationCounts[payload.status] = (operationCounts[payload.status] ?? 0) + 1;
    } else if (event.type === 'commandResult') {
      const payload: ICommandResultPayload = event.payload as ICommandResultPayload;
      commandName = payload.commandName;
      succeeded = payload.succeeded;
    }
  }

  return {
    commandName,
    succeeded,
    exitCode: deriveExitCodeFromEvents(events),
    operationCounts
  };
}
