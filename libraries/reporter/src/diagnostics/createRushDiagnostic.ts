// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { randomUUID } from 'node:crypto';

import type { IRushDiagnostic, RushDiagnosticSeverity } from './IRushDiagnostic';
import type { IClassifiedDiagnosticValue } from './IClassifiedDiagnosticValue';
import type { IRushRemediationAction } from './IRushRemediationAction';
import type { IRushDiagnosticSource } from './IRushDiagnosticSource';
import {
  RUSH_DIAGNOSTIC_CODES,
  type IRushDiagnosticCodeDefinition,
  type RushDiagnosticCode
} from './RushDiagnosticCodeRegistry';

/**
 * Options for {@link createRushDiagnostic}.
 *
 * @beta
 */
export interface ICreateRushDiagnosticOptions {
  /**
   * A pre-assigned diagnostic id. When omitted, a new id is generated.
   */
  readonly diagnosticId?: string;

  /**
   * Overrides the registry default severity.
   */
  readonly severity?: RushDiagnosticSeverity;

  /**
   * Named parameters referenced by the templates.
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
   * The ids of diagnostics that caused this one.
   */
  readonly causeDiagnosticIds?: readonly string[];

  /**
   * Whether the failing operation may succeed if retried.
   */
  readonly retryable?: boolean;

  /**
   * The ids of artifacts related to this diagnostic.
   */
  readonly relatedArtifactIds?: readonly string[];
}

/**
 * Creates a structured diagnostic from a registered code.
 *
 * @remarks
 * The registry is the single source of truth for the category, default
 * severity, template keys, and default remediation, so producers supply only
 * the code and instance-specific data. A fresh
 * {@link IRushDiagnostic.diagnosticId} is generated unless one is provided.
 *
 * @param code - a code present in the central registry. The parameter is
 * typed as the union of registered codes, so an unregistered code is a
 * compile error for TypeScript producers.
 * @param options - instance-specific diagnostic data
 * @throws Error if `code` is not registered
 *
 * @beta
 */
export function createRushDiagnostic(
  code: RushDiagnosticCode,
  options: ICreateRushDiagnosticOptions = {}
): IRushDiagnostic {
  const definition: IRushDiagnosticCodeDefinition | undefined = RUSH_DIAGNOSTIC_CODES.get(code);
  if (!definition) {
    throw new Error(`Unknown Rush diagnostic code: ${code}`);
  }

  return {
    diagnosticId: options.diagnosticId ?? randomUUID(),
    code: definition.code,
    category: definition.category,
    severity: options.severity ?? definition.defaultSeverity,
    summaryKey: definition.summaryKey,
    detailKey: definition.detailKey,
    parameters: options.parameters,
    remediation: options.remediation ?? definition.remediation,
    source: options.source,
    causeDiagnosticIds: options.causeDiagnosticIds,
    retryable: options.retryable,
    relatedArtifactIds: options.relatedArtifactIds
  };
}
