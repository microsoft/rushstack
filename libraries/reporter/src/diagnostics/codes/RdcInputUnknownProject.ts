// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { defineRushDiagnostic, type IRushDiagnosticEntry } from '../defineRushDiagnostic';

/**
 * Emitted when a command-line project selector names a project that is not
 * registered in rush.json.
 */
export const rdcInputUnknownProject: IRushDiagnosticEntry<'RDC_INPUT_UNKNOWN_PROJECT'> =
  defineRushDiagnostic({
    code: 'RDC_INPUT_UNKNOWN_PROJECT',
    category: 'input',
    defaultSeverity: 'error',
    summary: 'The project {projectName} was not found in rush.json.'
  });
