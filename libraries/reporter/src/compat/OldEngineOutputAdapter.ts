// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventSource } from '../events/IReporterEventEnvelope';
import type { IReporterEventSink } from '../producers/IReporterEventSink';
import { REPORTER_PROTOCOL_VERSION, REPORTER_PROTOCOL_LIMITS } from '../protocol/ReporterProtocol';

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
  private readonly _sink: IReporterEventSink;
  private readonly _sessionId: string;
  private readonly _source: IReporterEventSource;
  private readonly _protocolVersion: IReporterProtocolVersion;
  private readonly _maxChunkBytes: number;

  public constructor(options: IOldEngineOutputAdapterOptions) {
    this._sink = options.sink;
    this._sessionId = options.sessionId;
    this._source = options.source;
    this._protocolVersion = options.protocolVersion ?? REPORTER_PROTOCOL_VERSION;
    this._maxChunkBytes = options.maxChunkBytes ?? REPORTER_PROTOCOL_LIMITS.externalOutputChunkBytes;
  }

  /**
   * Bridges a fragment of the engine's raw output, returning the emitted event ids.
   *
   * @param stream - the originating stream
   * @param text - the raw output text
   */
  public capture(stream: 'stdout' | 'stderr', text: string): string[] {
    const eventIds: string[] = [];
    let offset: number = 0;
    while (offset < text.length) {
      let end: number = text.length;
      while (Buffer.byteLength(text.slice(offset, end), 'utf8') > this._maxChunkBytes) {
        end = offset + Math.floor((end - offset) / 2);
      }
      const chunk: string = text.slice(offset, end === offset ? offset + 1 : end);
      eventIds.push(
        this._sink.emit({
          protocolVersion: this._protocolVersion,
          sessionId: this._sessionId,
          source: this._source,
          privacy: 'local-sensitive',
          required: false,
          type: 'externalOutput',
          payload: { stream, text: chunk }
        })
      );
      offset += chunk.length;
    }
    return eventIds;
  }
}
