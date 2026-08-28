// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// THIS FILE IS GENERATED. Run "rushx generate-bootstrap-protocol" in libraries/reporter to update it.
// Sources: libraries/reporter/src/bootstrap/BootstrapProtocol.ts
//          libraries/reporter/src/protocol/ReporterProtocol.ts

/**
 * The protocol major version frozen into the bootstrap encoder.
 *
 * @remarks
 * The `install-run-rush` build embeds a generated copy of this constant and
 * the encoder below. The generated module is checked byte-for-byte during the
 * reporter build.
 *
 * @beta
 */
export const BOOTSTRAP_PROTOCOL_MAJOR: number = 1;

/**
 * The privacy classification accepted by the frozen bootstrap encoder.
 *
 * @beta
 */
export type BootstrapEnvelopePrivacyClassification = 'public' | 'local-sensitive' | 'secret';

/**
 * The producer identity stamped onto a bootstrap event.
 *
 * @beta
 */
export interface IBootstrapEnvelopeSource {
  readonly packageName: string;
  readonly packageVersion: string;
}

/**
 * The presentation-free fields encoded into a bootstrap event envelope.
 *
 * @beta
 */
export interface IBootstrapEnvelopeInput {
  readonly eventId: string;
  readonly sessionId: string;
  readonly sequence: number;
  readonly timestamp: string;
  readonly source: IBootstrapEnvelopeSource;
  readonly privacy: BootstrapEnvelopePrivacyClassification;
  readonly required: boolean;
  readonly type: string;
  readonly payload: unknown;
}

/**
 * Encodes one bootstrap event envelope without importing the reporter package.
 *
 * @beta
 */
export function encodeBootstrapEnvelope(input: IBootstrapEnvelopeInput): string {
  return JSON.stringify({
    protocolVersion: { major: BOOTSTRAP_PROTOCOL_MAJOR, minor: 0 },
    eventId: input.eventId,
    sessionId: input.sessionId,
    sequence: input.sequence,
    timestamp: input.timestamp,
    source: input.source,
    privacy: input.privacy,
    required: input.required,
    type: input.type,
    payload: input.payload
  });
}
