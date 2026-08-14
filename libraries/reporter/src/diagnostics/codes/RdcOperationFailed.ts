// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { defineRushDiagnostic, type IRushDiagnosticEntry } from '../defineRushDiagnostic';

/**
 * Emitted when a scheduled operation (for example, a project build) fails.
 */
export const rdcOperationFailed: IRushDiagnosticEntry<'RDC_OPERATION_FAILED'> = defineRushDiagnostic({
  code: 'RDC_OPERATION_FAILED',
  category: 'operation',
  defaultSeverity: 'error',
  summary: 'The operation for {projectName} failed.'
});
