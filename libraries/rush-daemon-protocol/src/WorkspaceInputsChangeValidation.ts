// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonProtocolError } from './DaemonProtocolError';

const FILE_LIST_FIELDS: ReadonlyArray<string> = ['installationFiles', 'implementationFiles'];
const EMPTY_LENGTH: number = 0;

/** Validates the optional fields of a `workspaceInputsChanged` restart reason. @internal */
export function validateWorkspaceInputsChange(reason: Record<string, unknown>): void {
  for (const field of FILE_LIST_FIELDS) validateOptionalNames(reason[field], field);
  validateOptionalVersion(reason.selectedRushVersion);
}

function validateOptionalVersion(value: unknown): void {
  if (value !== undefined && !isNonEmptyString(value)) fail('selectedRushVersion');
}

function validateOptionalNames(value: unknown, field: string): void {
  if (value !== undefined && !isNameList(value)) fail(field);
}

function isNameList(value: unknown): boolean {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > EMPTY_LENGTH;
}

function fail(field: string): never {
  throw new DaemonProtocolError('malformedControlMessage', `Invalid restartReason.${field}.`);
}
