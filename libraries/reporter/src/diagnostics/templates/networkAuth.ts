// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * English templates for `network-auth`-category diagnostics.
 *
 * @remarks
 * Placeholders of the form `{name}` are substituted with the diagnostic's
 * classified parameters at render time.
 */
// eslint-disable-next-line @typescript-eslint/typedef -- literal keys are required for the Record<RushDiagnosticTemplateKey, string> aggregate check
export const NETWORK_AUTH_DIAGNOSTIC_TEMPLATES = {
  'diagnostic.RUSH_NETWORK_AUTH_UNAUTHORIZED.summary':
    'Authentication failed for the registry {registryUrl}.'
} as const;
