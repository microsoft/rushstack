// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  BOOTSTRAP_BUFFER_MAX_BYTES,
  BOOTSTRAP_EXTERNAL_CHUNK_MAX_BYTES,
  BOOTSTRAP_BUFFER_TRUNCATED_EXTENSION_NAME,
  encodeBootstrapEnvelope
} from './BootstrapProtocol';
import type { ReporterEventType } from '../events/ReporterEventType';
import { chunkUtf8Text } from '../utilities/chunkUtf8Text';

const TRUNCATION_NOTICE_RESERVE_BYTES: number = 512;

/**
 * A privacy classification, duplicated locally to keep the encoder self-contained.
 *
 * @beta
 */
export type BootstrapPrivacyClassification = 'public' | 'local-sensitive' | 'secret';

/**
 * The producer identity stamped onto every bootstrap event.
 *
 * @beta
 */
export interface IBootstrapEventSource {
  readonly packageName: string;
  readonly packageVersion: string;
}

/**
 * An event supplied to {@link BootstrapEventBuffer.emit}.
 *
 * @beta
 */
export interface IBootstrapEventInput {
  /**
   * The event type, for example `sessionStarted`, `diagnosticEmitted`, or `externalOutput`.
   */
  readonly type: ReporterEventType;

  /**
   * The privacy classification. Defaults to `public`.
   */
  readonly privacy?: BootstrapPrivacyClassification;

  /**
   * The JSON-serializable payload.
   */
  readonly payload?: unknown;
}

/**
 * A description of the events lost when the bootstrap buffer overflowed.
 *
 * @beta
 */
export interface IBootstrapTruncation {
  /**
   * Whether any events were discarded.
   */
  readonly truncated: boolean;

  /**
   * Whether a required or diagnostic event could not be preserved, which fails the bootstrap.
   */
  readonly failed: boolean;

  /**
   * The number of discarded replaceable status events.
   */
  readonly droppedReplaceable: number;

  /**
   * The number of discarded non-replaceable, non-preserved events.
   */
  readonly droppedOther: number;

  /**
   * The number of required or diagnostic events that could not be preserved.
   */
  readonly droppedRequired: number;
}

interface IBufferEntry {
  readonly line: string;
  readonly bytes: number;
  readonly mustPreserve: boolean;
  readonly replaceable: boolean;
}

/**
 * Options for constructing a {@link BootstrapEventBuffer}.
 *
 * @beta
 */
export interface IBootstrapEventBufferOptions {
  /**
   * The bootstrap session id.
   */
  readonly sessionId: string;

  /**
   * The producer identity stamped onto every event.
   */
  readonly source: IBootstrapEventSource;

  /**
   * The maximum buffered size in bytes. Defaults to 1 MiB.
   */
  readonly maxBytes?: number;

  /**
   * Returns the current timestamp as an ISO 8601 string. Injectable for testing.
   */
  readonly now?: () => string;
}

/**
 * A bounded, self-contained encoder that buffers Rush-owned startup events as
 * NDJSON for later replay by the frontend.
 *
 * @remarks
 * The buffer is capped at 1 MiB. On overflow it preserves required and
 * diagnostic events, evicting replaceable status and other non-preserved events
 * to make room, and records the loss. A required or diagnostic event that still
 * cannot be preserved fails the bootstrap. Serialization appends a namespaced
 * `bufferTruncated` extension event whenever truncation occurred.
 *
 * @beta
 */
export class BootstrapEventBuffer {
  readonly #entries: IBufferEntry[];
  readonly #maxBytes: number;
  readonly #entryByteLimit: number;
  readonly #sessionId: string;
  readonly #source: IBootstrapEventSource;
  readonly #now: () => string;
  #usedBytes: number;
  #nextSequence: number;
  #nextEventId: number;
  #truncated: boolean;
  #failed: boolean;
  #droppedReplaceable: number;
  #droppedOther: number;
  #droppedRequired: number;

  public constructor(options: IBootstrapEventBufferOptions) {
    this.#entries = [];
    this.#maxBytes = options.maxBytes ?? BOOTSTRAP_BUFFER_MAX_BYTES;
    this.#entryByteLimit = this.#maxBytes - TRUNCATION_NOTICE_RESERVE_BYTES;
    if (this.#entryByteLimit <= 0) {
      throw new RangeError(`maxBytes must be greater than ${TRUNCATION_NOTICE_RESERVE_BYTES}.`);
    }
    this.#sessionId = options.sessionId;
    this.#source = options.source;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#usedBytes = 0;
    this.#nextSequence = 1;
    this.#nextEventId = 1;
    this.#truncated = false;
    this.#failed = false;
    this.#droppedReplaceable = 0;
    this.#droppedOther = 0;
    this.#droppedRequired = 0;
  }

  /**
   * Whether a required or diagnostic event could not be preserved.
   */
  public get failed(): boolean {
    return this.#failed;
  }

  /**
   * A description of any events lost to overflow.
   */
  public get truncation(): IBootstrapTruncation {
    return {
      truncated: this.#truncated,
      failed: this.#failed,
      droppedReplaceable: this.#droppedReplaceable,
      droppedOther: this.#droppedOther,
      droppedRequired: this.#droppedRequired
    };
  }

  /**
   * Encodes and buffers an event, returning its assigned event id.
   */
  public emit(input: IBootstrapEventInput): string {
    const eventId: string = `boot_${this.#nextEventId++}`;
    const required: boolean = input.type !== 'activityChanged';
    const line: string = encodeBootstrapEnvelope({
      eventId,
      sessionId: this.#sessionId,
      sequence: this.#nextSequence++,
      timestamp: this.#now(),
      source: this.#source,
      privacy: input.privacy ?? 'public',
      required,
      type: input.type,
      payload: input.payload === undefined ? {} : input.payload
    });
    const bytes: number = Buffer.byteLength(line, 'utf8') + 1;
    const mustPreserve: boolean = required;
    const replaceable: boolean = input.type === 'activityChanged';

    if (this.#usedBytes + bytes <= this.#entryByteLimit) {
      this.#entries.push({ line, bytes, mustPreserve, replaceable });
      this.#usedBytes += bytes;
      return eventId;
    }

    this.#truncated = true;
    if (mustPreserve) {
      this.#evictToFit(bytes);
      if (this.#usedBytes + bytes <= this.#entryByteLimit) {
        this.#entries.push({ line, bytes, mustPreserve, replaceable });
        this.#usedBytes += bytes;
      } else {
        this.#failed = true;
        this.#droppedRequired++;
      }
    } else if (replaceable) {
      this.#droppedReplaceable++;
    } else {
      this.#droppedOther++;
    }
    return eventId;
  }

  /**
   * Buffers raw external output as one or more `externalOutput` events, splitting
   * text that exceeds the 64 KiB chunk limit.
   *
   * @param stream - `stdout` or `stderr`
   * @param text - the raw text to preserve
   */
  public addExternalOutput(stream: 'stdout' | 'stderr', text: string): void {
    for (const chunk of chunkUtf8Text(text, BOOTSTRAP_EXTERNAL_CHUNK_MAX_BYTES)) {
      this.emit({
        type: 'externalOutput',
        privacy: 'local-sensitive',
        payload: { stream, text: chunk }
      });
    }
  }

  /**
   * Serializes the buffered events as NDJSON, appending a `bufferTruncated`
   * extension event when any events were lost.
   */
  public serialize(): string {
    const lines: string[] = this.#entries.map((entry: IBufferEntry) => entry.line);
    if (this.#truncated) {
      const noticeLine: string = encodeBootstrapEnvelope({
        eventId: 'boot_bufferTruncated',
        sessionId: this.#sessionId,
        sequence: this.#nextSequence++,
        timestamp: this.#now(),
        source: this.#source,
        privacy: 'public',
        required: true,
        type: 'extension',
        payload: {
          name: BOOTSTRAP_BUFFER_TRUNCATED_EXTENSION_NAME,
          droppedReplaceable: this.#droppedReplaceable,
          droppedOther: this.#droppedOther,
          droppedRequired: this.#droppedRequired,
          failed: this.#failed
        }
      });
      const noticeBytes: number = Buffer.byteLength(noticeLine, 'utf8') + 1;
      if (noticeBytes > TRUNCATION_NOTICE_RESERVE_BYTES) {
        throw new Error('The bootstrap truncation notice exceeded its reserved capacity.');
      }
      lines.push(noticeLine);
    }
    return lines.length > 0 ? `${lines.join('\n')}\n` : '';
  }

  #evictToFit(requiredBytes: number): void {
    let index: number = 0;
    while (this.#usedBytes + requiredBytes > this.#entryByteLimit && index < this.#entries.length) {
      const entry: IBufferEntry = this.#entries[index];
      if (entry.mustPreserve) {
        index++;
        continue;
      }
      this.#entries.splice(index, 1);
      this.#usedBytes -= entry.bytes;
      if (entry.replaceable) {
        this.#droppedReplaceable++;
      } else {
        this.#droppedOther++;
      }
    }
  }
}
