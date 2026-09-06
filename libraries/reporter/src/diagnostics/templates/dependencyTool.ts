// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * English templates for `dependency-tool`-category diagnostics.
 *
 * @remarks
 * Placeholders of the form `{name}` are substituted with the diagnostic's
 * classified parameters at render time.
 */
// eslint-disable-next-line @typescript-eslint/typedef -- literal keys are required for the Record<RushDiagnosticTemplateKey, string> aggregate check
export const DEPENDENCY_TOOL_DIAGNOSTIC_TEMPLATES = {
  'diagnostic.RUSH_DEPENDENCY_TOOL_FAILED.summary': 'The package manager exited with code {exitCode}.',
  'diagnostic.RUSH_DEPENDENCY_TOOL_FAILED.detail':
    'The command {command} failed. See {logPath} for the full output.'
} as const;
