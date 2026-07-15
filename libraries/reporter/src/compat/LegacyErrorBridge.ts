// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import { RushError } from '../diagnostics/RushError';

/**
 * The `name` of the legacy `AlreadyReportedError` sentinel.
 *
 * @beta
 */
export const ALREADY_REPORTED_ERROR_NAME: 'AlreadyReportedError' = 'AlreadyReportedError';

const CORRELATION_KEY: unique symbol = Symbol('rush-reporter-correlated-diagnostic-id');

/**
 * The criteria that must be met before the legacy error bridge is removed.
 *
 * @remarks
 * The bridge is removed only in a later major once all criteria are satisfied.
 *
 * @beta
 */
export const LEGACY_ERROR_BRIDGE_REMOVAL_CRITERIA: readonly string[] = [
  'zero first-party AlreadyReportedError usages remain',
  'plugin API migration guidance is published',
  'ecosystem notice and migration time are provided'
];

/**
 * The legacy print-then-throw sentinel error.
 *
 * @deprecated New usage is prohibited now that structured diagnostic APIs are
 * available. Emit a structured diagnostic and throw a `RushError` that
 * references its diagnostic id instead. This sentinel is recognized only so the
 * bridge can suppress duplicate rendering during migration.
 *
 * @beta
 */
export class AlreadyReportedError extends Error {
  public constructor(message?: string) {
    super(message ?? 'This error has already been reported.');
    this.name = ALREADY_REPORTED_ERROR_NAME;

    // Restore the prototype chain, which is broken when subclassing a built-in
    // and compiling to CommonJS.
    Object.setPrototypeOf(this, AlreadyReportedError.prototype);
  }
}

/**
 * Returns `true` if the value is a legacy `AlreadyReportedError` sentinel.
 *
 * @beta
 */
export function isAlreadyReportedSentinel(error: unknown): boolean {
  return error instanceof Error && error.name === ALREADY_REPORTED_ERROR_NAME;
}

/**
 * Correlates legacy sentinel errors with previously emitted diagnostics and
 * decides whether a failure should be rendered again.
 *
 * @remarks
 * Catch boundaries render only failures that are not already represented. This
 * bridge observes emitted diagnostics, so a legacy sentinel or a `RushError`
 * whose diagnostic was already emitted is suppressed rather than rendered twice.
 *
 * @beta
 */
export class LegacyErrorBridge {
  private readonly _emittedDiagnosticIds: Set<string> = new Set();

  /**
   * Records that a diagnostic id has been emitted.
   */
  public recordEmittedDiagnostic(diagnosticId: string): void {
    this._emittedDiagnosticIds.add(diagnosticId);
  }

  /**
   * Observes an event, recording emitted diagnostic ids.
   */
  public ingest(event: IReporterEventEnvelope<unknown>): void {
    if (event.type === 'diagnosticEmitted') {
      const diagnosticId: string | undefined = (event.payload as { diagnosticId?: string }).diagnosticId;
      if (diagnosticId !== undefined) {
        this._emittedDiagnosticIds.add(diagnosticId);
      }
    }
  }

  /**
   * Correlates a legacy sentinel error with the diagnostic id it corresponds to.
   */
  public correlate(error: unknown, diagnosticId: string): void {
    if (typeof error === 'object' && error !== null) {
      (error as { [CORRELATION_KEY]?: string })[CORRELATION_KEY] = diagnosticId;
    }
  }

  /**
   * Returns the diagnostic id correlated with an error, if any.
   */
  public getCorrelatedDiagnosticId(error: unknown): string | undefined {
    if (typeof error === 'object' && error !== null) {
      return (error as { [CORRELATION_KEY]?: string })[CORRELATION_KEY];
    }
    return undefined;
  }

  /**
   * Returns `true` if the failure has already been represented and should not be
   * rendered again.
   */
  public shouldSuppressRendering(error: unknown): boolean {
    if (isAlreadyReportedSentinel(error)) {
      return true;
    }
    if (error instanceof RushError) {
      return this._emittedDiagnosticIds.has(error.diagnosticId);
    }
    const correlated: string | undefined = this.getCorrelatedDiagnosticId(error);
    if (correlated !== undefined) {
      return this._emittedDiagnosticIds.has(correlated);
    }
    return false;
  }
}
