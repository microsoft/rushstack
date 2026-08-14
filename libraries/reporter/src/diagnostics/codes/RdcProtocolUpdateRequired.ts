// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { defineRushDiagnostic, type IRushDiagnosticEntry } from '../defineRushDiagnostic';

/**
 * Emitted during the reporter handshake when a producer advertises a protocol
 * major version (or required feature) that this Rush does not support.
 */
export const rdcProtocolUpdateRequired: IRushDiagnosticEntry<'RDC_PROTOCOL_UPDATE_REQUIRED'> =
  defineRushDiagnostic({
    code: 'RDC_PROTOCOL_UPDATE_REQUIRED',
    category: 'environment',
    defaultSeverity: 'error',
    summary: 'A reporter protocol feature required by {producerVersion} is not supported by this Rush.',
    detail:
      'The producer advertised protocol major {producerProtocolMajor}. Update your global Rush ' +
      'installation to a version that supports it.'
  });
