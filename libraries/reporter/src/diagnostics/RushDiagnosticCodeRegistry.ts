// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushDiagnosticCategory } from './RushDiagnosticCategory';
import type { RushDiagnosticSeverity } from './IRushDiagnostic';
import type { IRushRemediationAction } from './IRushRemediationAction';
import { ALL_RUSH_DIAGNOSTICS } from './codes';

/**
 * A permanent registry entry describing a Rush diagnostic code.
 *
 * @remarks
 * Entries are authored one-per-module under `diagnostics/codes/` using
 * `defineRushDiagnostic`, which derives the resource keys from the code.
 *
 * @beta
 */
export interface IRushDiagnosticCodeDefinition {
  /**
   * The stable `RDC_<DOMAIN>_<NAME>` code.
   */
  readonly code: string;

  /**
   * The root-cause category of the diagnostic.
   */
  readonly category: RushDiagnosticCategory;

  /**
   * The severity applied when a producer does not override it.
   */
  readonly defaultSeverity: RushDiagnosticSeverity;

  /**
   * The resource key of the summary template.
   */
  readonly summaryKey: string;

  /**
   * The resource key of an optional detailed template.
   */
  readonly detailKey?: string;

  /**
   * Default remediation actions, attached by `createRushDiagnostic` when the
   * producer does not supply per-instance remediation.
   */
  readonly remediation?: readonly IRushRemediationAction[];
}

/**
 * The union of every registered Rush diagnostic code.
 *
 * @remarks
 * `createRushDiagnostic` accepts this union, so an unregistered code is a
 * compile error rather than a runtime failure. The wire DTO
 * ({@link IRushDiagnostic.code}) remains `string` so that consumers tolerate
 * codes added by newer producers than their local registry knows about.
 *
 * @beta
 */
export type RushDiagnosticCode = (typeof ALL_RUSH_DIAGNOSTICS)[number]['definition']['code'];

/**
 * The permanent, never-reused list of Rush diagnostic code definitions.
 *
 * @remarks
 * Codes are append-only. A code is never removed or repurposed, so consumers can
 * rely on a code always meaning the same thing. To add a diagnostic, create a
 * module under `diagnostics/codes/` and register it in `codes/index.ts`.
 *
 * @beta
 */
export const RUSH_DIAGNOSTIC_CODE_DEFINITIONS: readonly IRushDiagnosticCodeDefinition[] =
  ALL_RUSH_DIAGNOSTICS.map((entry) => entry.definition);

/**
 * The permanent registry of Rush diagnostic codes, keyed by code.
 *
 * @remarks
 * A duplicate code does NOT throw at module load -- that would make the
 * entire package unimportable, wedging every diagnostic pathway at once.
 * Instead the first definition wins, and the registry unit tests assert
 * uniqueness. Codes are append-only, so duplicates are a test failure, never
 * a runtime event.
 *
 * @beta
 */
export const RUSH_DIAGNOSTIC_CODES: ReadonlyMap<string, IRushDiagnosticCodeDefinition> = (() => {
  const map: Map<string, IRushDiagnosticCodeDefinition> = new Map();
  for (const definition of RUSH_DIAGNOSTIC_CODE_DEFINITIONS) {
    // First definition wins; see the remarks above.
    if (!map.has(definition.code)) {
      map.set(definition.code, definition);
    }
  }
  return map;
})();

/**
 * The English templates for Rush diagnostics, keyed by resource key.
 *
 * @remarks
 * Placeholders of the form `{name}` are substituted with the diagnostic's
 * classified parameters at render time. Only English is provided in v1.
 * Templates are authored in the per-diagnostic modules under
 * `diagnostics/codes/`; this table is composed from them.
 *
 * @beta
 */
export const RUSH_DIAGNOSTIC_TEMPLATES: { readonly [resourceKey: string]: string } = (() => {
  const templates: { [resourceKey: string]: string } = {};
  for (const entry of ALL_RUSH_DIAGNOSTICS) {
    Object.assign(templates, entry.templates);
  }
  return templates;
})();
