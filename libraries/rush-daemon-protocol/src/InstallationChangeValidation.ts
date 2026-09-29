// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isDaemonControlRecord } from './ControlRecord';
import { DaemonProtocolError } from './DaemonProtocolError';
import { validateEnvironmentChange } from './EnvironmentChangeValidation';

const INSTALLATION_CHANGE_KINDS: ReadonlySet<unknown> = new Set(['removed', 'replaced']);
const INSTALLATION_CHANGED: string = 'installationChanged';
const ENVIRONMENT_CHANGED: string = 'environmentChanged';
const EMPTY_LENGTH: number = 0;

/** Validates an optional installation change, as reported by pong or by a restart reason. @internal */
export function validateInstallationChange(value: unknown, field: string): void {
  if (value === undefined) return;
  requireRecord(value, field);
  if (!INSTALLATION_CHANGE_KINDS.has(value.change)) fail(`${field}.change`);
  requireFolder(value.folder, `${field}.folder`);
}

/** Validates an optional restart reason. Unknown kinds from newer daemons are accepted and ignored. @internal */
export function validateRestartReason(payload: Record<string, unknown>): void {
  if (payload.restartReason === undefined) return;
  if (payload.retryAfterRestart !== true) fail('restartReason without retryAfterRestart');
  validateReason(payload.restartReason);
}

/** Validates the optional restart reason of a queue position, which needs no retry flag. @internal */
export function validateQueuedRestartReason(payload: Record<string, unknown>): void {
  if (payload.restartReason !== undefined) validateReason(payload.restartReason);
}

function validateReason(reason: unknown): void {
  requireRecord(reason, 'restartReason');
  requireKind(reason.kind);
  if (reason.kind === INSTALLATION_CHANGED) validateInstallationChange(reason, 'restartReason');
  if (reason.kind === ENVIRONMENT_CHANGED) validateEnvironmentChange(reason);
}

function requireRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!isDaemonControlRecord(value) || Array.isArray(value)) fail(field);
}

function requireKind(value: unknown): void {
  if (typeof value !== 'string' || value.length === EMPTY_LENGTH) fail('restartReason.kind');
}

function requireFolder(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.length === EMPTY_LENGTH) fail(field);
}

function fail(field: string): never {
  throw new DaemonProtocolError('malformedControlMessage', `Invalid ${field}.`);
}
