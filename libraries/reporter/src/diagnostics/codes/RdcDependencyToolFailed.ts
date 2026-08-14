// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { defineRushDiagnostic, type IRushDiagnosticEntry } from '../defineRushDiagnostic';

/**
 * Emitted when the package manager (or another dependency tool) exits
 * unsuccessfully.
 */
export const rdcDependencyToolFailed: IRushDiagnosticEntry<'RDC_DEPENDENCY_TOOL_FAILED'> = defineRushDiagnostic({
  code: 'RDC_DEPENDENCY_TOOL_FAILED',
  category: 'dependency-tool',
  defaultSeverity: 'error',
  summary: 'The package manager exited with code {exitCode}.',
  detail: 'The command {command} failed. See {logPath} for the full output.'
});
