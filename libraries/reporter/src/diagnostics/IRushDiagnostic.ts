// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushDiagnosticCategory } from './RushDiagnosticCategory';
import type { IClassifiedDiagnosticValue } from './IClassifiedDiagnosticValue';
import type { IRushRemediationAction } from './IRushRemediationAction';
import type { IRushDiagnosticSource } from './IRushDiagnosticSource';

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
 * This DTO is the wire contract. An internal `RushError` may wrap it in-process,
 * but only the DTO crosses process and destination boundaries. Its
 * {@link IRushDiagnostic.code | code} keys a permanent entry in the central
 * registry and its English templates.
 *
 * @beta
 */
export interface IRushDiagnostic {
  /**
   * A unique identifier for this diagnostic instance. Propagated failures
   * reference this id rather than re-rendering the diagnostic.
   */
  readonly diagnosticId: string;

  /**
   * A stable, never-reused code of the form `RUSH_<DOMAIN>_<NAME>` that
   * identifies the diagnostic and keys its English template.
   */
  readonly code: string;

  /**
   * The root-cause category of the diagnostic.
   */
  readonly category: RushDiagnosticCategory;

  /**
   * The severity of the diagnostic.
   */
  readonly severity: RushDiagnosticSeverity;

  /**
   * The resource key of the human-readable summary template for this diagnostic.
   */
  readonly summaryKey: string;

  /**
   * The resource key of an optional detailed template for this diagnostic.
   */
  readonly detailKey?: string;

  /**
   * Named parameters referenced by the templates, each with its own privacy classification.
   */
  readonly parameters?: { readonly [name: string]: IClassifiedDiagnosticValue };

  /**
   * Suggested remediation actions.
   */
  readonly remediation?: readonly IRushRemediationAction[];

  /**
   * The source location the diagnostic refers to.
   */
  readonly source?: IRushDiagnosticSource;

  /**
   * The ids of diagnostics that caused this one, for root-cause chaining.
   */
  readonly causeDiagnosticIds?: readonly string[];

  /**
   * Whether the failing operation may succeed if retried.
   */
  readonly retryable?: boolean;

  /**
   * The ids of artifacts related to this diagnostic, such as log files.
   */
  readonly relatedArtifactIds?: readonly string[];
}
