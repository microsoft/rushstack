// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IReporter } from '../manager/IReporter';
import { encodeNdjsonRecord, NdjsonRecordTooLargeError } from '../protocol/Ndjson';
import { REPORTER_PROTOCOL_LIMITS } from '../protocol/ReporterProtocol';
import { redactReporterEvent } from './ReporterRedaction';

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
    const machineEvent: IReporterEventEnvelope<unknown> =
      event.type === 'messageEmitted' && event.privacy === 'local-sensitive'
        ? {
            ...event,
            payload: {
              ...(event.payload as Record<string, unknown>),
              text: '[local-sensitive]'
            }
          }
        : event;
    const redactedEvent: IReporterEventEnvelope<unknown> = redactReporterEvent(machineEvent);
    try {
      this._write(encodeNdjsonRecord(redactedEvent, { maxRecordBytes: this._maxRecordBytes }));
    } catch (error) {
      if (error instanceof NdjsonRecordTooLargeError) {
        const source: IReporterEventEnvelope<unknown>['source'] =
          redactedEvent.privacy === 'public'
            ? redactedEvent.source
            : {
                packageName: '[private-producer]',
                packageVersion: '[private-version]'
              };
        this._write(
          encodeNdjsonRecord(
            {
              protocolVersion: redactedEvent.protocolVersion,
              eventId: redactedEvent.eventId,
              sessionId: redactedEvent.sessionId,
              parentSessionId: redactedEvent.parentSessionId,
              parentOperationId: redactedEvent.parentOperationId,
              sequence: redactedEvent.sequence,
              sourceSequence: redactedEvent.sourceSequence,
              timestamp: redactedEvent.timestamp,
              source,
              scope: redactedEvent.privacy === 'public' ? redactedEvent.scope : undefined,
              privacy: redactedEvent.privacy,
              required: redactedEvent.required,
              type: 'extension',
              payload: {
                name: 'rush.reporter.record-too-large',
                payload: { originalType: event.type }
              }
            },
            { maxRecordBytes: this._maxRecordBytes }
          )
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
