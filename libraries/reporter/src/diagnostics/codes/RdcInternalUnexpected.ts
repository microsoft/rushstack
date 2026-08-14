// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { defineRushDiagnostic, type IRushDiagnosticEntry } from '../defineRushDiagnostic';
import { RUSH_INTERNAL_ERROR_CODE } from '../RushDiagnosticCode';

/**
 * The stable diagnostic for unexpected internal (programmer) failures. Its
 * code is never reused and is exported as `RUSH_INTERNAL_ERROR_CODE`.
 */
export const rdcInternalUnexpected: IRushDiagnosticEntry<typeof RUSH_INTERNAL_ERROR_CODE> =
  defineRushDiagnostic({
    code: RUSH_INTERNAL_ERROR_CODE,
    category: 'internal',
    defaultSeverity: 'error',
    summary: 'An unexpected internal error occurred in Rush.',
    detail: 'This is a bug in Rush. See {logPath} for details, then report it upstream.'
  });
