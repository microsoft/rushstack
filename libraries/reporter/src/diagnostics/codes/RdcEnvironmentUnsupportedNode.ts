// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { defineRushDiagnostic, type IRushDiagnosticEntry } from '../defineRushDiagnostic';

/**
 * Emitted when the running Node.js version falls outside the supported range.
 */
export const rdcEnvironmentUnsupportedNode: IRushDiagnosticEntry<'RDC_ENVIRONMENT_UNSUPPORTED_NODE'> =
  defineRushDiagnostic({
    code: 'RDC_ENVIRONMENT_UNSUPPORTED_NODE',
    category: 'environment',
    defaultSeverity: 'error',
    summary: 'Node.js {actualVersion} is not supported; expected {expectedRange}.'
  });
