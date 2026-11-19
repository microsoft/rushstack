// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonProtocolError } from './DaemonProtocolError';

const EMPTY_LENGTH: number = 0;

/** Validates the variable names of an `environmentChanged` restart reason. @internal */
export function validateEnvironmentChange(reason: Record<string, unknown>): void {
  const { variableNames } = reason;
  if (!Array.isArray(variableNames) || !variableNames.every(isVariableName)) {
    throw new DaemonProtocolError('malformedControlMessage', 'Invalid restartReason.variableNames.');
  }
}

function isVariableName(value: unknown): boolean {
  return typeof value === 'string' && value.length > EMPTY_LENGTH;
}
