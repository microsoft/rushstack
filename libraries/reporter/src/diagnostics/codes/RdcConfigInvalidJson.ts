// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { defineRushDiagnostic, type IRushDiagnosticEntry } from '../defineRushDiagnostic';

/**
 * Emitted when a Rush configuration file cannot be parsed as JSON.
 */
export const rdcConfigInvalidJson: IRushDiagnosticEntry<'RDC_CONFIG_INVALID_JSON'> = defineRushDiagnostic({
  code: 'RDC_CONFIG_INVALID_JSON',
  category: 'configuration',
  defaultSeverity: 'error',
  summary: 'The configuration file {file} contains invalid JSON.'
});
