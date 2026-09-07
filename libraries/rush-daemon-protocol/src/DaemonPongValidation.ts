// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isDaemonControlRecord } from './ControlRecord';
import { DaemonProtocolError } from './DaemonProtocolError';
import { validateWorkspaceStatus } from './WorkspaceStatusValidation';

const ZERO: number = 0;

function fail(field: string): never {
  throw new DaemonProtocolError('malformedControlMessage', `Invalid pong field "${field}".`);
}

export function validateDaemonPong(payload: Record<string, unknown>): void {
  validateDaemonVersion(payload.daemonVersion);
  validateProtocolVersion(payload.protocolVersion);
  if (typeof payload.uptimeMs !== 'number') fail('uptimeMs');
  validatePid(payload.pid);
  validateResidentMemory(payload.residentMemoryBytes);
  validateWorkspaceStatus(payload.workspace);
}

function validateDaemonVersion(value: unknown): void {
  if (value !== undefined && typeof value !== 'string') fail('daemonVersion');
}

function validateProtocolVersion(value: unknown): void {
  if (value === undefined) return;
  if (!isDaemonControlRecord(value)) fail('protocolVersion');
  validateVersionNumbers(value);
}

function validateVersionNumbers(value: Record<string, unknown>): void {
  if (typeof value.major !== 'number' || typeof value.minor !== 'number') fail('protocolVersion');
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= ZERO;
}

function validatePid(value: unknown): void {
  if (value === undefined) return;
  requirePositivePid(value);
}

function requirePositivePid(value: unknown): void {
  if (!isNonnegativeInteger(value) || value === ZERO) fail('pid');
}

function validateResidentMemory(value: unknown): void {
  if (value !== undefined && !isNonnegativeInteger(value)) fail('residentMemoryBytes');
}
