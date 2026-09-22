// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isDaemonControlRecord } from './ControlRecord';
import { DaemonProtocolError } from './DaemonProtocolError';
import { MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS } from './DaemonRequestAdmission';

const FIRST_TERMINAL_COLUMN: number = 1;
const MINIMUM_WAIT_TIMEOUT_MS: number = 0;

/** Validates request terminal fields. @internal */
export function validateRequestTerminal(value: unknown): void {
  const terminal: Record<string, unknown> = requireRecord(value, 'requestStart payload.terminal');
  requireBoolean(terminal.isTTY, 'Request terminal isTTY');
  requireBoolean(terminal.supportsColor, 'Request terminal supportsColor');
  validateOptionalBoolean(terminal.acceptsStdin, 'Request terminal acceptsStdin');
  validateColumns(terminal.columns);
  validateTerminalRequirement(terminal.terminalRequirement);
}

/** Validates request admission fields. @internal */
export function validateRequestAdmission(value: unknown): void {
  if (value === undefined) return;
  const admission: Record<string, unknown> = requireRecord(value, 'requestStart payload.admission');
  validateOptionalBoolean(admission.noWait, 'Request admission noWait');
  validateWaitTimeout(admission.waitTimeoutMs);
}

function validateColumns(value: unknown): void {
  if (value === undefined) return;
  if (!isPositiveSafeInteger(value)) {
    fail('Request terminal columns must be a positive safe integer.');
  }
}

function isPositiveSafeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= FIRST_TERMINAL_COLUMN;
}

function validateTerminalRequirement(value: unknown): void {
  if (value === undefined) return;
  const requirements: ReadonlySet<unknown> = new Set([
    'none',
    'interactiveInput',
    'controllingTerminal'
  ]);
  if (!requirements.has(value)) fail('Request terminal requirement is not recognized.');
}

function validateWaitTimeout(value: unknown): void {
  if (value === undefined) return;
  if (!isNonnegativeSafeInteger(value)) {
    fail('Request admission waitTimeoutMs must be a safe integer.');
  }
}

function isNonnegativeSafeInteger(value: unknown): boolean {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= MINIMUM_WAIT_TIMEOUT_MS &&
    (value as number) <= MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS
  );
}
function validateOptionalBoolean(value: unknown, name: string): void {
  if (value !== undefined) requireBoolean(value, name);
}

function requireBoolean(value: unknown, name: string): void {
  if (typeof value !== 'boolean') fail(`${name} must be a boolean.`);
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isDaemonControlRecord(value) || Array.isArray(value)) fail(`${name} must be an object.`);
  return value;
}

function fail(reason: string): never {
  throw new DaemonProtocolError('malformedControlMessage', reason);
}
