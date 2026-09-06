// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This module is intentionally self-contained. It imports no runtime values
// from the rest of the package so that a frozen copy can be embedded into the
// zero-dependency `install-run-rush` bundle, which must not import
// `@rushstack/rush-reporter` at runtime.

// BEGIN GENERATED BOOTSTRAP PROTOCOL

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
    payload: input.payload === undefined ? {} : input.payload
  });
}

// END GENERATED BOOTSTRAP PROTOCOL

/**
 * The maximum size of the buffered bootstrap event stream, in bytes (1 MiB).
 *
 * @beta
 */
export const BOOTSTRAP_BUFFER_MAX_BYTES: number = 1024 * 1024;

/**
 * The maximum size of a single raw external-output chunk, in bytes (64 KiB).
 *
 * @beta
 */
export const BOOTSTRAP_EXTERNAL_CHUNK_MAX_BYTES: number = 64 * 1024;

/**
 * The private environment variable used to hand the bootstrap NDJSON file path
 * to the installed frontend.
 *
 * @beta
 */
export const RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR: '_RUSH_REPORTER_BOOTSTRAP_HANDOFF' =
  '_RUSH_REPORTER_BOOTSTRAP_HANDOFF';

/**
 * The private environment variable carrying the one-time nonce that must match
 * the handoff file's header line.
 *
 * @remarks
 * The nonce proves the handoff file was written by the same bootstrap process
 * that set the environment variable: a stale or foreign handoff file (same
 * temp directory, different invocation) is rejected rather than replayed.
 *
 * @beta
 */
export const RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR: '_RUSH_REPORTER_BOOTSTRAP_NONCE' =
  '_RUSH_REPORTER_BOOTSTRAP_NONCE';

/**
 * The namespaced extension event name that describes bootstrap buffer truncation.
 *
 * @beta
 */
export const BOOTSTRAP_BUFFER_TRUNCATED_EXTENSION_NAME: 'rush.reporter.buffer-truncated' =
  'rush.reporter.buffer-truncated';
