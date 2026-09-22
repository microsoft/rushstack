// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonProtocolError } from './DaemonProtocolError';

const EMPTY_LENGTH: number = 0;

function fail(reason: string): never {
  throw new DaemonProtocolError('malformedControlMessage', reason);
}

function requireRequestId(payload: Record<string, unknown>): void {
  if (typeof payload.requestId !== 'string' || payload.requestId.length === EMPTY_LENGTH) {
    fail('Interactive control message payload.requestId must be a nonempty string.');
  }
}

/** Validates optional interactive capability negotiation. @internal */
export function validateInteractiveCapability(payload: Record<string, unknown>): void {
  if (payload.supportsInteractiveIO !== undefined && typeof payload.supportsInteractiveIO !== 'boolean') {
    fail('Subscribe message payload.supportsInteractiveIO must be a boolean.');
  }
}

/** Validates a request-scoped raw-mode command or acknowledgement. @internal */
export function validateRawModeControl(payload: Record<string, unknown>): void {
  requireRequestId(payload);
  if (typeof payload.enabled !== 'boolean') {
    fail('Interactive control message payload.enabled must be a boolean.');
  }
}

/** Validates a request-scoped terminal execution policy result. @internal */
export function validateTerminalPolicyControl(payload: Record<string, unknown>): void {
  requireRequestId(payload);
  validateTerminalPolicyDecision(payload.decision);
  validateTerminalPolicyReason(payload.reason);
}

function validateTerminalPolicyDecision(decision: unknown): void {
  if (decision !== 'runInDaemon' && decision !== 'requiresInProcess') {
    fail('Terminal policy payload.decision is not recognized.');
  }
}

function validateTerminalPolicyReason(reason: unknown): void {
  if (reason !== undefined && reason !== 'controllingTerminalRequired') {
    fail('Terminal policy payload.reason is not recognized.');
  }
}
