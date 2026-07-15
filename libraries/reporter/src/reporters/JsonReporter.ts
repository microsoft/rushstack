// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter } from '../manager/IReporter';
import { encodeNdjsonRecord, NdjsonRecordTooLargeError } from '../protocol/Ndjson';
import { REPORTER_PROTOCOL_LIMITS } from '../protocol/ReporterProtocol';

/**
 * Options for {@link JsonReporter}.
 *
 * @beta
 */
export interface IJsonReporterOptions {
  /**
   * The exclusive stdout sink. It receives NDJSON payload records only.
   */
  readonly write: (text: string) => void;

  /**
   * The maximum NDJSON record size in bytes. Defaults to the protocol limit.
   */
  readonly maxRecordBytes?: number;
}

/**
 * The stable machine reporter that emits the complete versioned NDJSON event stream.
 *
 * @remarks
 * The reporter owns stdout exclusively; every line is a JSON-serialized event
 * envelope and nothing else. An oversized event is replaced with a compact
 * record-too-large marker so the stream stays valid NDJSON.
 *
 * @beta
 */
export class JsonReporter implements IReporter {
  public readonly name: string = 'json';

  private readonly _write: (text: string) => void;
  private readonly _maxRecordBytes: number;

  public constructor(options: IJsonReporterOptions) {
    this._write = options.write;
    this._maxRecordBytes = options.maxRecordBytes ?? REPORTER_PROTOCOL_LIMITS.ndjsonRecordBytes;
  }

  public async initializeAsync(): Promise<void> {
    /* no-op */
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    try {
      this._write(encodeNdjsonRecord(event, { maxRecordBytes: this._maxRecordBytes }));
    } catch (error) {
      if (error instanceof NdjsonRecordTooLargeError) {
        this._write(
          encodeNdjsonRecord({
            protocolVersion: event.protocolVersion,
            eventId: event.eventId,
            sessionId: event.sessionId,
            sequence: event.sequence,
            type: 'extension',
            payload: { name: 'rush.reporter.recordTooLarge', originalType: event.type }
          })
        );
        return;
      }
      throw error;
    }
  }

  public async flushAsync(): Promise<void> {
    /* NDJSON is written eagerly. */
  }

  public async closeAsync(): Promise<void> {
    /* no-op */
  }
}
