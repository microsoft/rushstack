// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * English templates for `operation`-category diagnostics.
 *
 * @remarks
 * Placeholders of the form `{name}` are substituted with the diagnostic's
 * classified parameters at render time.
 */
// eslint-disable-next-line @typescript-eslint/typedef -- literal keys are required for the Record<RushDiagnosticTemplateKey, string> aggregate check
export const OPERATION_DIAGNOSTIC_TEMPLATES = {
  'diagnostic.RUSH_OPERATION_FAILED.summary': 'The operation for {projectName} failed.',
  'diagnostic.RUSH_EXTERNAL_TOOL_PROBLEM.summary': '{tool} reported {code}: {message}',
  'diagnostic.RUSH_COMMAND_FAILED.summary': 'The Rush command {commandName} failed.'
} as const;
