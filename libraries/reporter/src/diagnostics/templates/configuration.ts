// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * English templates for `configuration`-category diagnostics.
 *
 * @remarks
 * Placeholders of the form `{name}` are substituted with the diagnostic's
 * classified parameters at render time.
 */
// eslint-disable-next-line @typescript-eslint/typedef -- literal keys are required for the Record<RushDiagnosticTemplateKey, string> aggregate check
export const CONFIGURATION_DIAGNOSTIC_TEMPLATES = {
  'diagnostic.RUSH_CONFIG_INVALID_JSON.summary': 'The configuration file {file} contains invalid JSON.',
  'diagnostic.RUSH_PLUGIN_API_INCOMPATIBLE.summary':
    'The plugin {pluginName} declares plugin API version {declaredApiVersion}, which is incompatible with this Rush (supported: {supportedApiVersion}).'
} as const;
