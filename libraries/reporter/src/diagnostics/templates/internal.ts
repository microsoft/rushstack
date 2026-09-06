// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * English templates for `internal`-category diagnostics.
 *
 * @remarks
 * Placeholders of the form `{name}` are substituted with the diagnostic's
 * classified parameters at render time.
 */
// eslint-disable-next-line @typescript-eslint/typedef -- literal keys are required for the Record<RushDiagnosticTemplateKey, string> aggregate check
export const INTERNAL_DIAGNOSTIC_TEMPLATES = {
  'diagnostic.RUSH_INTERNAL_UNEXPECTED.summary': 'An unexpected internal error occurred in Rush.',
  'diagnostic.RUSH_INTERNAL_UNEXPECTED.detail':
    'This is a bug in Rush. See {logPath} for details, then report it upstream.'
} as const;
