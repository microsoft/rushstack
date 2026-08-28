// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isDaemonControlRecord } from './ControlRecord';
import type { IDaemonEventEnvelope } from './DaemonEventEnvelope';
import type { DaemonEventType } from './DaemonEventType';
import type { DaemonVerbosity } from './DaemonVerbosity';

/** The severity of a diagnostic event payload, used by verbosity filtering. @beta */
export type DaemonDiagnosticSeverity = 'debug' | 'info' | 'warning' | 'error';

/** The minimal structural contract the verbosity filter needs for `diagnosticEmitted` payloads. @beta */
export interface IDaemonDiagnosticPayload {
  readonly severity: DaemonDiagnosticSeverity;
}

const DIAGNOSTIC_SEVERITIES: readonly DaemonDiagnosticSeverity[] = ['debug', 'info', 'warning', 'error'];
const DIAGNOSTIC_SEVERITY_SET: ReadonlySet<string> = new Set(DIAGNOSTIC_SEVERITIES);

// The engine only emits activityChanged events for lines it actually printed,
// so quiet mode still receives the few lines legacy quiet mode shows (for
// example the parallelism line and hook errors).
const QUIET_TYPES: ReadonlySet<DaemonEventType> = new Set([
  'commandResult',
  'diagnosticEmitted',
  'activityChanged'
]);

const NORMAL_TYPES: ReadonlySet<DaemonEventType> = new Set([
  'sessionStarted',
  'sessionCompleted',
  'commandStarted',
  'commandCompleted',
  'operationRegistered',
  'operationStatusChanged',
  'activityChanged',
  'watchCycleCompleted',
  'diagnosticEmitted',
  'externalProcessStarted',
  'externalProcessCompleted',
  'artifactAvailable',
  'commandResult'
]);

function isDiagnosticSeverity(value: unknown): value is DaemonDiagnosticSeverity {
  return typeof value === 'string' && DIAGNOSTIC_SEVERITY_SET.has(value);
}

function readDiagnosticSeverity(payload: unknown): DaemonDiagnosticSeverity | undefined {
  const severity: unknown = isDaemonControlRecord(payload) ? payload.severity : undefined;
  return isDiagnosticSeverity(severity) ? severity : undefined;
}

function isQuietDiagnostic(severity: DaemonDiagnosticSeverity | undefined): boolean {
  return severity === 'error' || severity === 'warning';
}

function allowsDiagnostic(verbosity: DaemonVerbosity, envelope: IDaemonEventEnvelope): boolean {
  if (verbosity === 'quiet') {
    return isQuietDiagnostic(readDiagnosticSeverity(envelope.payload));
  }
  return verbosity === 'normal' ? readDiagnosticSeverity(envelope.payload) !== 'debug' : true;
}

function isTypeAllowed(verbosity: DaemonVerbosity, type: DaemonEventType): boolean {
  if (verbosity === 'verbose') {
    return true;
  }
  return verbosity === 'quiet' ? QUIET_TYPES.has(type) : NORMAL_TYPES.has(type);
}

function isAllowedAtVerbosity(verbosity: DaemonVerbosity, envelope: IDaemonEventEnvelope): boolean {
  if (envelope.type === 'extension') {
    return false;
  }
  return envelope.type === 'diagnosticEmitted'
    ? allowsDiagnostic(verbosity, envelope)
    : isTypeAllowed(verbosity, envelope.type);
}

/**
 * Returns `true` when `envelope` should be serialized for a subscription at `verbosity`.
 *
 * @remarks
 * This is the per-client filter applied at event serialization time. It is a pure
 * function of the envelope — shared engine state is never consulted or mutated — so
 * two clients at different verbosities each receive the correct subset of the same
 * event stream. `debug` passes everything, including `rushd.*` extension events.
 * `required` events are never filtered out.
 * @beta
 */
export function shouldSerializeDaemonEvent(
  verbosity: DaemonVerbosity,
  envelope: IDaemonEventEnvelope
): boolean {
  if (verbosity === 'debug' || envelope.required) {
    return true;
  }
  return isAllowedAtVerbosity(verbosity, envelope);
}
