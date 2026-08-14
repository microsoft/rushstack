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
import { RUSH_INTERNAL_ERROR_CODE } from './RushDiagnosticCode';

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
 * compile error for TypeScript producers. An unknown code that reaches this
 * function anyway -- for example, one forced past the type checker or decoded
 * from a newer producer -- degrades to the stable
 * {@link RUSH_INTERNAL_ERROR_CODE | internal error} diagnostic instead of
 * throwing: the requested code is preserved as the
 * public-classified `requestedCode` parameter, merged with any caller
 * parameters, and a caller severity override still applies.
 * @param options - instance-specific diagnostic data
 *
 * @beta
 */
export function createRushDiagnostic(
  code: RushDiagnosticCode,
  options: ICreateRushDiagnosticOptions = {}
): IRushDiagnostic {
  let definition: IRushDiagnosticCodeDefinition | undefined = RUSH_DIAGNOSTIC_CODES.get(code);
  let parameters: { readonly [name: string]: IClassifiedDiagnosticValue } | undefined =
    options.parameters;
  if (definition === undefined) {
    // Degrade rather than throw: a single unknown code must never wedge the
    // reporting path. The internal-error entry is a permanent part of the
    // registry (asserted by the registry unit tests), so this lookup always
    // succeeds.
    definition = RUSH_DIAGNOSTIC_CODES.get(RUSH_INTERNAL_ERROR_CODE)!;
    parameters = {
      ...options.parameters,
      requestedCode: { value: code, privacy: 'public' }
    };
  }

  return {
    diagnosticId: options.diagnosticId ?? randomUUID(),
    code: definition.code,
    category: definition.category,
    severity: options.severity ?? definition.defaultSeverity,
    summaryKey: definition.summaryKey,
    detailKey: definition.detailKey,
    parameters,
    remediation: options.remediation ?? definition.remediation,
    source: options.source,
    causeDiagnosticIds: options.causeDiagnosticIds,
    retryable: options.retryable,
    relatedArtifactIds: options.relatedArtifactIds
  };
}
