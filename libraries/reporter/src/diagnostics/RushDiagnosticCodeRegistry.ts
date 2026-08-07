// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushDiagnosticCategory } from './RushDiagnosticCategory';
import type { RushDiagnosticSeverity } from './IRushDiagnostic';

/**
 * A permanent registry entry describing a Rush diagnostic code.
 *
 * @beta
 */
export interface IRushDiagnosticCodeDefinition {
  /**
   * The stable `RUSH_<DOMAIN>_<NAME>` code.
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
}

/**
 * The stable code used for unexpected internal (programmer) failures.
 *
 * @beta
 */
export const RUSH_INTERNAL_ERROR_CODE: 'RUSH_INTERNAL_UNEXPECTED' = 'RUSH_INTERNAL_UNEXPECTED';

const RUSH_DIAGNOSTIC_CODE_REGEXP: RegExp = /^RUSH_[A-Z0-9]+(?:_[A-Z0-9]+)+$/;

/**
 * Returns `true` if `code` is shaped like a valid `RUSH_<DOMAIN>_<NAME>` code.
 *
 * @param code - the candidate diagnostic code
 *
 * @beta
 */
export function isValidRushDiagnosticCode(code: string): boolean {
  return RUSH_DIAGNOSTIC_CODE_REGEXP.test(code);
}

/**
 * The permanent, never-reused list of Rush diagnostic code definitions.
 *
 * @remarks
 * Codes are append-only. A code is never removed or repurposed, so consumers can
 * rely on a code always meaning the same thing.
 *
 * @beta
 */
export const RUSH_DIAGNOSTIC_CODE_DEFINITIONS: readonly IRushDiagnosticCodeDefinition[] = [
  {
    code: 'RUSH_CONFIG_INVALID_JSON',
    category: 'configuration',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_CONFIG_INVALID_JSON.summary'
  },
  {
    code: 'RUSH_INPUT_UNKNOWN_PROJECT',
    category: 'input',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_INPUT_UNKNOWN_PROJECT.summary'
  },
  {
    code: 'RUSH_PLUGIN_API_INCOMPATIBLE',
    category: 'configuration',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_PLUGIN_API_INCOMPATIBLE.summary',
    detailKey: 'diagnostic.RUSH_PLUGIN_API_INCOMPATIBLE.detail'
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
    summaryKey: 'diagnostic.RUSH_ENVIRONMENT_UNSUPPORTED_NODE.summary'
  },
  {
    code: 'RUSH_NETWORK_AUTH_UNAUTHORIZED',
    category: 'network-auth',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_NETWORK_AUTH_UNAUTHORIZED.summary'
  },
  {
    code: 'RUSH_OPERATION_FAILED',
    category: 'operation',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_OPERATION_FAILED.summary'
  },
  {
    code: 'RUSH_EXTERNAL_TOOL_PROBLEM',
    category: 'operation',
    defaultSeverity: 'error',
    summaryKey: 'diagnostic.RUSH_EXTERNAL_TOOL_PROBLEM.summary'
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
  }
];

/**
 * The permanent registry of Rush diagnostic codes, keyed by code.
 *
 * @beta
 */
export const RUSH_DIAGNOSTIC_CODES: ReadonlyMap<string, IRushDiagnosticCodeDefinition> = new Map(
  RUSH_DIAGNOSTIC_CODE_DEFINITIONS.map((definition: IRushDiagnosticCodeDefinition) => [
    definition.code,
    definition
  ])
);

/**
 * The English templates for Rush diagnostics, keyed by resource key.
 *
 * @remarks
 * Placeholders of the form `{name}` are substituted with the diagnostic's
 * classified parameters at render time. Only English is provided in v1.
 *
 * @beta
 */
export const RUSH_DIAGNOSTIC_TEMPLATES: { readonly [resourceKey: string]: string } = {
  'diagnostic.RUSH_CONFIG_INVALID_JSON.summary': 'The configuration file {file} contains invalid JSON.',
  'diagnostic.RUSH_INPUT_UNKNOWN_PROJECT.summary': 'The project {projectName} was not found in rush.json.',
  'diagnostic.RUSH_PLUGIN_API_INCOMPATIBLE.summary':
    'The plugin {pluginName} declares an unsupported Rush plugin API version {declaredApiVersion}.',
  'diagnostic.RUSH_PLUGIN_API_INCOMPATIBLE.detail':
    'This Rush supports plugin API version {supportedApiVersion}. Update the plugin or Rush so the major versions match.',
  'diagnostic.RUSH_DEPENDENCY_TOOL_FAILED.summary': 'The package manager exited with code {exitCode}.',
  'diagnostic.RUSH_DEPENDENCY_TOOL_FAILED.detail':
    'The command {command} failed. See {logPath} for the full output.',
  'diagnostic.RUSH_ENVIRONMENT_UNSUPPORTED_NODE.summary':
    'Node.js {actualVersion} is not supported; expected {expectedRange}.',
  'diagnostic.RUSH_NETWORK_AUTH_UNAUTHORIZED.summary':
    'Authentication failed for the registry {registryUrl}.',
  'diagnostic.RUSH_OPERATION_FAILED.summary': 'The operation for {projectName} failed.',
  'diagnostic.RUSH_EXTERNAL_TOOL_PROBLEM.summary': 'The tool {tool} reported {code}: {message}',
  'diagnostic.RUSH_PROTOCOL_UPDATE_REQUIRED.summary':
    'A reporter protocol feature required by {producerVersion} is not supported by this Rush.',
  'diagnostic.RUSH_PROTOCOL_UPDATE_REQUIRED.detail':
    'The producer advertised protocol major {producerProtocolMajor}. Update your global Rush installation to a version that supports it.',
  'diagnostic.RUSH_INTERNAL_UNEXPECTED.summary': 'An unexpected internal error occurred in Rush.',
  'diagnostic.RUSH_INTERNAL_UNEXPECTED.detail':
    'This is a bug in Rush. See {logPath} for details, then report it upstream.'
};
