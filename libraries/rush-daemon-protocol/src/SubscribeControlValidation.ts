// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonProtocolError } from './DaemonProtocolError';
import { isDaemonVerbosity } from './DaemonVerbosity';
import { validateInteractiveCapability } from './InteractiveControlValidation';
import { validateRequestAdmissionCapability } from './RequestAdmissionControlValidation';
import {
  validateInputLifecycleCapability,
  validateRequestLifecycleCapability
} from './RequestLifecycleCapabilityValidation';

export function validateSubscribeControl(payload: Record<string, unknown>): void {
  if (typeof payload.isTTY !== 'boolean') {
    throw new DaemonProtocolError(
      'malformedControlMessage',
      'Subscribe message payload.isTTY must be a boolean.'
    );
  }
  validateInteractiveCapability(payload);
  validateInputLifecycleCapability(payload);
  validateRequestAdmissionCapability(payload);
  validateRequestLifecycleCapability(payload);
  requireSubscribeVerbosity(payload);
}

function requireSubscribeVerbosity(payload: Record<string, unknown>): void {
  if (payload.verbosity !== undefined && !isDaemonVerbosity(payload.verbosity)) {
    throw new DaemonProtocolError(
      'malformedControlMessage',
      'Subscribe message payload.verbosity is not a known verbosity level.'
    );
  }
}
