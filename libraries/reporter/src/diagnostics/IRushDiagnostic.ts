// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The severity of a diagnostic.
 *
 * @remarks
 * Diagnostic severity is independent of a reporter's log level. A reporter
 * decides, based on its configured log level, whether to render a given
 * severity.
 *
 * @beta
 */
export type RushDiagnosticSeverity = 'warning' | 'error';

/**
 * A structured, presentation-free diagnostic emitted by Rush-owned code.
 *
 * @remarks
 * This is the minimal contract required by the producer API. The structured
 * diagnostics feature expands it with the diagnostic category, remediation
 * actions, source location, classified parameters, cause references, and
 * field-level privacy classification, along with the central code registry and
 * English templates.
 *
 * @beta
 */
export interface IRushDiagnostic {
  /**
   * A stable, never-reused code of the form `RUSH_<DOMAIN>_<NAME>` that
   * identifies the diagnostic and keys its English template.
   */
  readonly code: string;

  /**
   * The severity of the diagnostic.
   */
  readonly severity: RushDiagnosticSeverity;

  /**
   * The resource key of the human-readable summary template for this diagnostic.
   */
  readonly summaryKey: string;
}
