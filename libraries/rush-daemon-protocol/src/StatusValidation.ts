// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isDaemonControlRecord } from './ControlRecord';
import { DaemonProtocolError } from './DaemonProtocolError';

const ZERO: number = 0;

export function failStatus(field: string): never {
  throw new DaemonProtocolError('malformedControlMessage', `Invalid workspace status field "${field}".`);
}

export function requireStatusRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isDaemonControlRecord(value) || Array.isArray(value)) failStatus(field);
  return value;
}

export function requireStatusBoolean(value: unknown, field: string): void {
  if (typeof value !== 'boolean') failStatus(field);
}

export function requireStatusText(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === ZERO) failStatus(field);
}

export function requireStatusStrings(value: unknown, field: string): void {
  if (!Array.isArray(value)) failStatus(field);
  for (const entry of value) requireStatusText(entry, field);
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) failStatus(field);
  return value;
}

export function requireStatusPositive(value: unknown, field: string): void {
  if (requireFiniteNumber(value, field) <= ZERO) failStatus(field);
}

export function requireStatusCount(value: unknown, field: string): asserts value is number {
  const number: number = requireFiniteNumber(value, field);
  if (!Number.isSafeInteger(number) || number < ZERO) failStatus(field);
}
