// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';

/**
 * The reporter protocol version implemented by this package.
 *
 * @remarks
 * The `major` gates compatibility; a consumer supports one major. `minor`
 * versions are additive, so a newer minor only introduces optional events and
 * capabilities.
 *
 * @beta
 */
export const REPORTER_PROTOCOL_VERSION: IReporterProtocolVersion = {
  major: 1,
  minor: 0
};

/**
 * The byte-size limits enforced by the reporter wire protocol.
 *
 * @beta
 */
export interface IReporterProtocolLimits {
  /**
   * The maximum size of the buffered bootstrap event stream, in bytes.
   */
  readonly bootstrapBufferBytes: number;

  /**
   * The maximum size of a single NDJSON record, in bytes.
   */
  readonly ndjsonRecordBytes: number;

  /**
   * The maximum size of a single raw external-output chunk, in bytes.
   */
  readonly externalOutputChunkBytes: number;
}

/**
 * The byte-size limits enforced by the reporter wire protocol.
 *
 * @remarks
 * The bootstrap buffer and NDJSON record are each 1 MiB, and a raw
 * external-output chunk is 64 KiB.
 *
 * @beta
 */
export const REPORTER_PROTOCOL_LIMITS: IReporterProtocolLimits = {
  bootstrapBufferBytes: 1024 * 1024,
  ndjsonRecordBytes: 1024 * 1024,
  externalOutputChunkBytes: 64 * 1024
};

/**
 * Returns `true` if a consumer of the given protocol version supports a
 * producer's protocol version.
 *
 * @remarks
 * Compatibility requires an equal `major`. A differing `minor` is always
 * compatible because minor versions are additive.
 *
 * @param consumer - the protocol version supported by the consumer
 * @param producer - the protocol version advertised by the producer
 *
 * @beta
 */
export function isReporterProtocolCompatible(
  consumer: IReporterProtocolVersion,
  producer: IReporterProtocolVersion
): boolean {
  return consumer.major === producer.major;
}
