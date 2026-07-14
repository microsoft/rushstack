// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  BOOTSTRAP_PROTOCOL_MAJOR,
  BOOTSTRAP_BUFFER_MAX_BYTES,
  BOOTSTRAP_EXTERNAL_CHUNK_MAX_BYTES,
  BOOTSTRAP_BUFFER_TRUNCATED_EXTENSION_NAME
} from './BootstrapProtocol';

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
  readonly type: string;

  /**
   * Whether the event is correctness-critical. Required and diagnostic events are
   * preserved on overflow.
   */
  readonly required: boolean;

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
  private readonly _entries: IBufferEntry[];
  private readonly _maxBytes: number;
  private readonly _sessionId: string;
  private readonly _source: IBootstrapEventSource;
  private readonly _now: () => string;
  private _usedBytes: number;
  private _nextSequence: number;
  private _nextEventId: number;
  private _truncated: boolean;
  private _failed: boolean;
  private _droppedReplaceable: number;
  private _droppedOther: number;
  private _droppedRequired: number;

  public constructor(options: IBootstrapEventBufferOptions) {
    this._entries = [];
    this._maxBytes = options.maxBytes ?? BOOTSTRAP_BUFFER_MAX_BYTES;
    this._sessionId = options.sessionId;
    this._source = options.source;
    this._now = options.now ?? (() => new Date().toISOString());
    this._usedBytes = 0;
    this._nextSequence = 1;
    this._nextEventId = 1;
    this._truncated = false;
    this._failed = false;
    this._droppedReplaceable = 0;
    this._droppedOther = 0;
    this._droppedRequired = 0;
  }

  /**
   * Whether a required or diagnostic event could not be preserved.
   */
  public get failed(): boolean {
    return this._failed;
  }

  /**
   * A description of any events lost to overflow.
   */
  public get truncation(): IBootstrapTruncation {
    return {
      truncated: this._truncated,
      failed: this._failed,
      droppedReplaceable: this._droppedReplaceable,
      droppedOther: this._droppedOther,
      droppedRequired: this._droppedRequired
    };
  }

  /**
   * Encodes and buffers an event, returning its assigned event id.
   */
  public emit(input: IBootstrapEventInput): string {
    const eventId: string = `boot_${this._nextEventId++}`;
    const envelope: Record<string, unknown> = {
      protocolVersion: { major: BOOTSTRAP_PROTOCOL_MAJOR, minor: 0 },
      eventId,
      sessionId: this._sessionId,
      sequence: this._nextSequence++,
      timestamp: this._now(),
      source: this._source,
      privacy: input.privacy ?? 'public',
      required: input.required,
      type: input.type,
      payload: input.payload ?? {}
    };
    const line: string = JSON.stringify(envelope);
    const bytes: number = Buffer.byteLength(line, 'utf8') + 1;
    const mustPreserve: boolean = input.required || input.type === 'diagnosticEmitted';
    const replaceable: boolean = input.type === 'activityChanged' && !input.required;

    if (this._usedBytes + bytes <= this._maxBytes) {
      this._entries.push({ line, bytes, mustPreserve });
      this._usedBytes += bytes;
      return eventId;
    }

    this._truncated = true;
    if (mustPreserve) {
      this._evictToFit(bytes);
      if (this._usedBytes + bytes <= this._maxBytes) {
        this._entries.push({ line, bytes, mustPreserve });
        this._usedBytes += bytes;
      } else {
        this._failed = true;
        this._droppedRequired++;
      }
    } else if (replaceable) {
      this._droppedReplaceable++;
    } else {
      this._droppedOther++;
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
    let offset: number = 0;
    // Split on byte-safe character boundaries below the chunk limit.
    while (offset < text.length) {
      let end: number = text.length;
      while (Buffer.byteLength(text.slice(offset, end), 'utf8') > BOOTSTRAP_EXTERNAL_CHUNK_MAX_BYTES) {
        end = offset + Math.floor((end - offset) / 2);
      }
      const chunk: string = text.slice(offset, end === offset ? offset + 1 : end);
      this.emit({ type: 'externalOutput', required: false, payload: { stream, text: chunk } });
      offset += chunk.length;
    }
  }

  /**
   * Serializes the buffered events as NDJSON, appending a `bufferTruncated`
   * extension event when any events were lost.
   */
  public serialize(): string {
    const lines: string[] = this._entries.map((entry: IBufferEntry) => entry.line);
    if (this._truncated) {
      const notice: Record<string, unknown> = {
        protocolVersion: { major: BOOTSTRAP_PROTOCOL_MAJOR, minor: 0 },
        eventId: 'boot_bufferTruncated',
        sessionId: this._sessionId,
        sequence: this._nextSequence++,
        timestamp: this._now(),
        source: this._source,
        privacy: 'public',
        required: true,
        type: 'extension',
        payload: {
          name: BOOTSTRAP_BUFFER_TRUNCATED_EXTENSION_NAME,
          droppedReplaceable: this._droppedReplaceable,
          droppedOther: this._droppedOther,
          droppedRequired: this._droppedRequired,
          failed: this._failed
        }
      };
      lines.push(JSON.stringify(notice));
    }
    return lines.length > 0 ? `${lines.join('\n')}\n` : '';
  }

  private _evictToFit(requiredBytes: number): void {
    let index: number = 0;
    while (this._usedBytes + requiredBytes > this._maxBytes && index < this._entries.length) {
      const entry: IBufferEntry = this._entries[index];
      if (entry.mustPreserve) {
        index++;
        continue;
      }
      this._entries.splice(index, 1);
      this._usedBytes -= entry.bytes;
      this._droppedOther++;
    }
  }
}
