// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { defineRushDiagnostic, type IRushDiagnosticEntry } from '../defineRushDiagnostic';

/**
 * Emitted during the reporter handshake when a producer advertises a protocol
 * major version (or required feature) that this Rush does not support.
 *
 * @remarks
 * The handshake reports both dimensions: the protocol majors on each side and
 * the specific required features this Rush rejected (an empty list when the
 * rejection is purely a major-version mismatch). The detail text therefore
 * guides both cases -- a major mismatch is fixed by updating Rush, while a
 * same-major feature rejection may require producer-side changes.
 */
export const rdcProtocolUpdateRequired: IRushDiagnosticEntry<'RDC_PROTOCOL_UPDATE_REQUIRED'> =
  defineRushDiagnostic({
    code: 'RDC_PROTOCOL_UPDATE_REQUIRED',
    category: 'environment',
    defaultSeverity: 'error',
    summary: 'A reporter protocol feature required by {producerVersion} is not supported by this Rush.',
    detail:
      'The producer {producerVersion} advertised reporter protocol major {producerProtocolMajor}; this ' +
      'Rush supports protocol major {consumerProtocolMajor} and rejected these required features: ' +
      '"{rejectedFeatures}". Update your global Rush installation to a version that supports the ' +
      'producer. If the protocol majors already match, an upgrade alone may not help -- the producer ' +
      'requires reporter features this Rush build does not implement; consult the producer ' +
      'documentation for how to satisfy or disable them.'
  });
