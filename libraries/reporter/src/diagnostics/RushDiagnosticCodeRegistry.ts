// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushDiagnosticCategory } from './RushDiagnosticCategory';
import type { RushDiagnosticCode } from './RushDiagnosticCode';
import type { RushDiagnosticSeverity } from './IRushDiagnostic';

/**
 * The resource key of the summary template for a diagnostic code, for example
 * `diagnostic.RUSH_DEPENDENCY_TOOL_FAILED.summary`.
 *
 * @beta
 */
export type RushDiagnosticSummaryKey = `diagnostic.${RushDiagnosticCode}.summary`;

/**
 * The resource key of the detail template for a diagnostic code, for example
 * `diagnostic.RUSH_DEPENDENCY_TOOL_FAILED.detail`.
 *
 * @beta
 */
export type RushDiagnosticDetailKey = `diagnostic.${RushDiagnosticCode}.detail`;

/**
 * A permanent registry entry describing a Rush diagnostic code.
 *
 * @beta
 */
export interface IRushDiagnosticCodeDefinition {
  /**
   * The stable `RUSH_<DOMAIN>_<NAME>` code.
   */
  readonly code: RushDiagnosticCode;

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
  readonly summaryKey: RushDiagnosticSummaryKey;

  /**
   * The resource key of the detailed template, or `undefined` when the code
   * has no detail template.
   */
  readonly detailKey: RushDiagnosticDetailKey | undefined;
}

/**
 * The stable code used for unexpected internal (programmer) failures.
 *
 * @beta
 */
export const RUSH_INTERNAL_ERROR_CODE: 'RUSH_INTERNAL_UNEXPECTED' = 'RUSH_INTERNAL_UNEXPECTED';

/**
 * The permanent, never-reused list of Rush diagnostic code definitions.
 *
 * @remarks
 * Codes are append-only. A code is never removed or repurposed, so consumers can
 * rely on a code always meaning the same thing. The `as const satisfies` typing
 * lets {@link RushDiagnosticCodes} and {@link RushDiagnosticTemplateKey} be
 * derived from this list, so adding a code without its templates is a
 * compile-time error.
 *
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/typedef -- literal inference feeds the derived RushDiagnosticCodes/RushDiagnosticTemplateKey unions
export const RUSH_DIAGNOSTIC_CODE_DEFINITIONS = [
  {
    code: 'RUSH_CONFIG_INVALID_JSON',
    category: 'configuration',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_CONFIG_INVALID_JSON.summary',
    detailKey: undefined
  },
  {
    code: 'RUSH_INPUT_UNKNOWN_PROJECT',
    category: 'input',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_INPUT_UNKNOWN_PROJECT.summary',
    detailKey: undefined
  },
  {
    code: 'RUSH_DEPENDENCY_TOOL_FAILED',
    category: 'dependency-tool',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_DEPENDENCY_TOOL_FAILED.summary',
    detailKey: 'diagnostic.RUSH_DEPENDENCY_TOOL_FAILED.detail'
  },
  {
    code: 'RUSH_ENVIRONMENT_UNSUPPORTED_NODE',
    category: 'environment',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_ENVIRONMENT_UNSUPPORTED_NODE.summary',
    detailKey: undefined
  },
  {
    code: 'RUSH_NETWORK_AUTH_UNAUTHORIZED',
    category: 'network-auth',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_NETWORK_AUTH_UNAUTHORIZED.summary',
    detailKey: undefined
  },
  {
    code: 'RUSH_OPERATION_FAILED',
    category: 'operation',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_OPERATION_FAILED.summary',
    detailKey: undefined
  },
  {
    code: 'RUSH_PROTOCOL_UPDATE_REQUIRED',
    category: 'environment',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_PROTOCOL_UPDATE_REQUIRED.summary',
    detailKey: 'diagnostic.RUSH_PROTOCOL_UPDATE_REQUIRED.detail'
  },
  {
    code: RUSH_INTERNAL_ERROR_CODE,
    category: 'internal',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_INTERNAL_UNEXPECTED.summary',
    detailKey: 'diagnostic.RUSH_INTERNAL_UNEXPECTED.detail'
  },
  {
    code: 'RUSH_PLUGIN_API_INCOMPATIBLE',
    category: 'configuration',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_PLUGIN_API_INCOMPATIBLE.summary',
    detailKey: undefined
  },
  {
    code: 'RUSH_EXTERNAL_TOOL_PROBLEM',
    category: 'operation',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_EXTERNAL_TOOL_PROBLEM.summary',
    detailKey: undefined
  }
] as const satisfies readonly IRushDiagnosticCodeDefinition[];

/**
 * The union of every registered Rush diagnostic code.
 *
 * @beta
 */
export type RushDiagnosticCodes = (typeof RUSH_DIAGNOSTIC_CODE_DEFINITIONS)[number]['code'];

/**
 * The union of every template resource key referenced by the registry.
 *
 * @beta
 */
export type RushDiagnosticTemplateKey = NonNullable<
  (typeof RUSH_DIAGNOSTIC_CODE_DEFINITIONS)[number]['summaryKey' | 'detailKey']
>;

/**
 * The permanent registry of Rush diagnostic codes, keyed by code.
 *
 * @beta
 */
export const RUSH_DIAGNOSTIC_CODES: ReadonlyMap<RushDiagnosticCode, IRushDiagnosticCodeDefinition> =
  new Map(
    RUSH_DIAGNOSTIC_CODE_DEFINITIONS.map(
      (definition: IRushDiagnosticCodeDefinition) => [definition.code, definition] as const
    )
  );

export { isValidRushDiagnosticCode } from './RushDiagnosticCode';
export { RUSH_DIAGNOSTIC_TEMPLATES } from './templates';