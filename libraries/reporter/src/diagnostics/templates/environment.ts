// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * English templates for `environment`-category diagnostics.
 *
 * @remarks
 * Placeholders of the form `{name}` are substituted with the diagnostic's
 * classified parameters at render time.
 */
// eslint-disable-next-line @typescript-eslint/typedef -- literal keys are required for the Record<RushDiagnosticTemplateKey, string> aggregate check
export const ENVIRONMENT_DIAGNOSTIC_TEMPLATES = {
  'diagnostic.RUSH_ENVIRONMENT_UNSUPPORTED_NODE.summary':
    'Node.js {actualVersion} is not supported; expected {expectedRange}.',
  'diagnostic.RUSH_PROTOCOL_UPDATE_REQUIRED.summary':
    'A reporter protocol feature required by {producerVersion} is not supported by this Rush.',
  'diagnostic.RUSH_PROTOCOL_UPDATE_REQUIRED.detail':
    'The producer advertised protocol major {producerProtocolMajor}. Update your global Rush installation to a version that supports it.',
  'diagnostic.RUSH_PROTOCOL_INVALID_CHILD_STREAM.summary':
    'A child process sent an invalid reporter protocol stream.',
  'diagnostic.RUSH_PROTOCOL_INVALID_CHILD_STREAM.detail': 'The child reporter stream was rejected because {reason}.'
} as const;
