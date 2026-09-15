// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonProtocolError } from './DaemonProtocolError';

const PRE_EXECUTION_FAILURE_EXIT_CODE: number = 1;

/** Rejects contradictory claims of guaranteed pre-execution restart. @internal */
export function validateRestartResult(payload: Record<string, unknown>): void {
  if (payload.retryAfterRestart === undefined) return;
  const expected: Readonly<Record<string, unknown>> = {
    retryAfterRestart: true,
    outcome: 'failure',
    exitCode: PRE_EXECUTION_FAILURE_EXIT_CODE,
    aborted: false,
    admissionErrorCode: undefined,
    scheduled: undefined,
    operationResults: undefined
  };
  if (Object.entries(expected).some(([key, value]) => payload[key] !== value)) {
    throw new DaemonProtocolError(
      'malformedControlMessage', 'Restart retry requires a guaranteed pre-execution failure without operation results.'
    );
  }
}
