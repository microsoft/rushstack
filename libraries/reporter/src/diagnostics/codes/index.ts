// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { rdcConfigInvalidJson } from './RdcConfigInvalidJson';
import { rdcInputUnknownProject } from './RdcInputUnknownProject';
import { rdcDependencyToolFailed } from './RdcDependencyToolFailed';
import { rdcEnvironmentUnsupportedNode } from './RdcEnvironmentUnsupportedNode';
import { rdcNetworkAuthUnauthorized } from './RdcNetworkAuthUnauthorized';
import { rdcOperationFailed } from './RdcOperationFailed';
import { rdcProtocolUpdateRequired } from './RdcProtocolUpdateRequired';
import { rdcInternalUnexpected } from './RdcInternalUnexpected';
import type { IRushDiagnosticEntry } from '../defineRushDiagnostic';
import type { RUSH_INTERNAL_ERROR_CODE } from '../RushDiagnosticCode';

/**
 * Every registered Rush diagnostic.
 *
 * @remarks
 * ADDING A DIAGNOSTIC
 *
 * 1. Create a module in this folder named after the code (for example,
 *    `RdcConfigInvalidJson.ts`) that calls `defineRushDiagnostic` with the
 *    code, category, default severity, English templates, and any default
 *    remediation. Codes follow `RDC_<DOMAIN>_<NAME>` and are checked at
 *    compile time, so a malformed code fails the build at the definition
 *    site. Codes are permanent and never reused: append only, never remove
 *    or repurpose one. A complete minimal module to copy:
 *
 * ```ts
 * // Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * // See LICENSE in the project root for license information.
 *
 * import { defineRushDiagnostic, type IRushDiagnosticEntry } from '../defineRushDiagnostic';
 *
 * // Emitted when a Rush configuration file cannot be parsed as JSON.
 * export const rdcConfigInvalidJson: IRushDiagnosticEntry<'RDC_CONFIG_INVALID_JSON'> = defineRushDiagnostic({
 *   code: 'RDC_CONFIG_INVALID_JSON',
 *   category: 'configuration',
 *   defaultSeverity: 'error',
 *   summary: 'The configuration file {file} contains invalid JSON.'
 * });
 * ```
 *
 * 2. Add the module's export to the tuple below (annotation and initializer);
 *    the compiler enforces that the two stay in sync.
 *
 * That is the whole contract: resource keys are derived from the code, and
 * the registry, code map, and template table are composed from this list.
 *
 * The explicit tuple annotation buys more than compile-time sync. It preserves
 * each entry's literal code type, which is what lets the registry derive the
 * `RushDiagnosticCode` union from this list; and because the tuple is part of
 * the exported API, adding a diagnostic produces a diff in the API report
 * (`common/reviews/api/reporter.api.md`) -- a reviewable anchor that keeps a
 * new permanent code visible to reviewers.
 *
 * @beta
 */
export const ALL_RUSH_DIAGNOSTICS: readonly [
  IRushDiagnosticEntry<'RDC_CONFIG_INVALID_JSON'>,
  IRushDiagnosticEntry<'RDC_INPUT_UNKNOWN_PROJECT'>,
  IRushDiagnosticEntry<'RDC_DEPENDENCY_TOOL_FAILED'>,
  IRushDiagnosticEntry<'RDC_ENVIRONMENT_UNSUPPORTED_NODE'>,
  IRushDiagnosticEntry<'RDC_NETWORK_AUTH_UNAUTHORIZED'>,
  IRushDiagnosticEntry<'RDC_OPERATION_FAILED'>,
  IRushDiagnosticEntry<'RDC_PROTOCOL_UPDATE_REQUIRED'>,
  IRushDiagnosticEntry<typeof RUSH_INTERNAL_ERROR_CODE>
] = [
  rdcConfigInvalidJson,
  rdcInputUnknownProject,
  rdcDependencyToolFailed,
  rdcEnvironmentUnsupportedNode,
  rdcNetworkAuthUnauthorized,
  rdcOperationFailed,
  rdcProtocolUpdateRequired,
  rdcInternalUnexpected
];
