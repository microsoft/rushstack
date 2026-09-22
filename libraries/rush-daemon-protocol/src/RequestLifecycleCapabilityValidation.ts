// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonProtocolError } from './DaemonProtocolError';

/** Validates optional request-lifecycle capability negotiation. @internal */
export function validateRequestLifecycleCapability(payload: Record<string, unknown>): void {
  if (
    payload.supportsRequestLifecycle !== undefined &&
    typeof payload.supportsRequestLifecycle !== 'boolean'
  ) {
    throw new DaemonProtocolError(
      'malformedControlMessage',
      'Subscribe message payload.supportsRequestLifecycle must be a boolean.'
    );
  }
}
