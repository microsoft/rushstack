// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventSource } from '../events/IReporterEventEnvelope';
import type { IReporterEventSink } from '../producers/IReporterEventSink';
import { REPORTER_PROTOCOL_VERSION, REPORTER_PROTOCOL_LIMITS } from '../protocol/ReporterProtocol';
import { chunkUtf8Text } from '../utilities/chunkUtf8Text';

/**
 * Options for constructing an {@link OldEngineOutputAdapter}.
 *
 * @beta
 */
export interface IOldEngineOutputAdapterOptions {
  /**
   * The sink that receives the bridged external-output events.
   */
  readonly sink: IReporterEventSink;

  /**
   * The session id stamped onto the bridged events.
   */
  readonly sessionId: string;

  /**
   * The producer identity stamped onto the bridged events.
   */
  readonly source: IReporterEventSource;

  /**
   * The protocol version stamped onto the bridged events. Defaults to
   * {@link REPORTER_PROTOCOL_VERSION}.
   */
  readonly protocolVersion?: IReporterProtocolVersion;

  /**
   * The maximum size of a single external-output chunk, in bytes. Defaults to the
   * protocol limit of 64 KiB.
   */
  readonly maxChunkBytes?: number;
}

/**
 * Bridges an old engine's raw stdout and stderr into structured `externalOutput`
 * events without altering the visible legacy output.
 *
 * @remarks
 * A new frontend paired with an old engine still wants the engine's output in the
 * structured stream. This adapter observes the raw text and re-emits it as
 * `externalOutput` events, chunked to the protocol limit, while the engine's own
 * legacy rendering remains the sole visible output.
 *
 * @beta
 */
export class OldEngineOutputAdapter {
  readonly #sink: IReporterEventSink;
  readonly #sessionId: string;
  readonly #source: IReporterEventSource;
  readonly #protocolVersion: IReporterProtocolVersion;
  readonly #maxChunkBytes: number;

  public constructor(options: IOldEngineOutputAdapterOptions) {
    this.#sink = options.sink;
    this.#sessionId = options.sessionId;
    this.#source = options.source;
    this.#protocolVersion = options.protocolVersion ?? REPORTER_PROTOCOL_VERSION;
    this.#maxChunkBytes = options.maxChunkBytes ?? REPORTER_PROTOCOL_LIMITS.externalOutputChunkBytes;
  }

  /**
   * Bridges a fragment of the engine's raw output, returning the emitted event ids.
   *
   * @param stream - the originating stream
   * @param text - the raw output text
   */
  public capture(stream: 'stdout' | 'stderr', text: string): string[] {
    const eventIds: string[] = [];
    for (const chunk of chunkUtf8Text(text, this.#maxChunkBytes)) {
      eventIds.push(
        this.#sink.emit({
          protocolVersion: this.#protocolVersion,
          sessionId: this.#sessionId,
          source: this.#source,
          privacy: 'local-sensitive',
          type: 'externalOutput',
          payload: { stream, text: chunk }
        })
      );
    }
    return eventIds;
  }
}
