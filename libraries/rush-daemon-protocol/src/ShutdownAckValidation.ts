// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonProtocolError } from './DaemonProtocolError';

const ZERO: number = 0;

/** Validates the optional active request count of a shutdown acknowledgement. @internal */
export function validateShutdownAck(payload: Record<string, unknown>): void {
  const value: unknown = payload.activeRequests;
  if (value === undefined || isNonnegativeInteger(value)) return;
  throw new DaemonProtocolError('malformedControlMessage', 'Invalid shutdownAck field "activeRequests".');
}

function isNonnegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= ZERO;
}
