// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringDecoder } from 'node:string_decoder';

import { REPORTER_PROTOCOL_LIMITS } from './ReporterProtocol';

const MAX_ERROR_LINE_PREVIEW_LENGTH: number = 200;

/**
 * Thrown when a value cannot be serialized as an NDJSON record.
 *
 * @beta
 */
export class NdjsonEncodeError extends Error {
  /**
   * The error thrown by `JSON.stringify`, when serialization failed by throwing.
   */
  public readonly cause: unknown;

  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'NdjsonEncodeError';
    this.cause = cause;

    Object.setPrototypeOf(this, NdjsonEncodeError.prototype);
  }
}

/**
 * Thrown when an NDJSON record exceeds the maximum record size.
 *
 * @beta
 */
export class NdjsonRecordTooLargeError extends Error {
  /**
   * The maximum allowed record size in bytes.
   */
  public readonly maxRecordBytes: number;

  /**
   * Records decoded before the offending record in the same call.
   */
  public readonly partialRecords: readonly unknown[];

  public constructor(maxRecordBytes: number, partialRecords: readonly unknown[] = []) {
    super(`The NDJSON record exceeds the maximum size of ${maxRecordBytes} bytes.`);
    this.name = 'NdjsonRecordTooLargeError';
    this.maxRecordBytes = maxRecordBytes;
    this.partialRecords = partialRecords.slice();

    // Restore the prototype chain, which is broken when subclassing a built-in
    // and compiling to CommonJS.
    Object.setPrototypeOf(this, NdjsonRecordTooLargeError.prototype);
  }
}

/**
 * Thrown when a complete NDJSON record is not valid JSON.
 *
 * @beta
 */
export class NdjsonInvalidRecordError extends Error {
  /**
   * The complete offending line, without its newline delimiter.
   */
  public readonly line: string;

  /**
   * Records decoded before the offending record in the same call.
   */
  public readonly partialRecords: readonly unknown[];

  /**
   * The error thrown by `JSON.parse`.
   */
  public readonly cause: unknown;

  public constructor(line: string, cause: unknown, partialRecords: readonly unknown[] = []) {
    const truncatedLine: string =
      line.length > MAX_ERROR_LINE_PREVIEW_LENGTH
        ? `${line.slice(0, MAX_ERROR_LINE_PREVIEW_LENGTH)}\u2026`
        : line;
    const causeMessage: string = cause instanceof Error ? cause.message : String(cause);
    super(`Invalid NDJSON record ${JSON.stringify(truncatedLine)}: ${causeMessage}`);
    this.name = 'NdjsonInvalidRecordError';
    this.line = line;
    this.partialRecords = partialRecords.slice();
    this.cause = cause;

    Object.setPrototypeOf(this, NdjsonInvalidRecordError.prototype);
  }
}

/**
 * Options controlling NDJSON record size enforcement.
 *
 * @beta
 */
export interface INdjsonOptions {
  /**
   * The maximum size of a single record in bytes. Defaults to the protocol
   * limit of 1 MiB.
   */
  readonly maxRecordBytes?: number;
}

/**
 * Encodes a value as a single newline-delimited JSON record.
 *
 * @remarks
 * `JSON.stringify` escapes any embedded newlines, so the returned string
 * contains exactly one `\n`, at the end.
 *
 * @param value - the JSON-serializable value to encode
 * @param options - record size options
 * @throws NdjsonEncodeError if the value cannot be represented as JSON
 * @throws NdjsonRecordTooLargeError if the encoded record exceeds the limit
 *
 * @beta
 */
export function encodeNdjsonRecord(value: unknown, options?: INdjsonOptions): string {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch (error) {
    const causeMessage: string = error instanceof Error ? error.message : String(error);
    throw new NdjsonEncodeError(`The value could not be encoded as NDJSON: ${causeMessage}`, error);
  }

  if (json === undefined) {
    throw new NdjsonEncodeError(
      'The value could not be encoded as NDJSON because JSON.stringify returned undefined.'
    );
  }

  const maxRecordBytes: number = options?.maxRecordBytes ?? REPORTER_PROTOCOL_LIMITS.ndjsonRecordBytes;
  if (Buffer.byteLength(json, 'utf8') > maxRecordBytes) {
    throw new NdjsonRecordTooLargeError(maxRecordBytes);
  }
  return json + '\n';
}

/**
 * Incrementally decodes newline-delimited JSON records from a stream of chunks.
 *
 * @remarks
 * Call {@link NdjsonDecoder.decode} for each received chunk to obtain the
 * records completed by that chunk, then call {@link NdjsonDecoder.flush} once
 * the stream ends to obtain any trailing record that was not newline-terminated.
 * Pass raw `Buffer` chunks from byte streams so UTF-8 code points split across
 * chunks are decoded correctly. String chunks remain supported for callers that
 * already have complete, correctly decoded text.
 *
 * If a complete record is invalid, the decoder discards only that record and
 * throws a typed error whose `partialRecords` contains records decoded earlier
 * in the call. Any bytes after the invalid record remain buffered; after
 * handling the error, call `decode` again (an empty chunk is sufficient) to
 * continue processing them without data loss.
 *
 * @beta
 */
export class NdjsonDecoder {
  private readonly _maxRecordBytes: number;
  private _buffer: Buffer;

  public constructor(options?: INdjsonOptions) {
    this._maxRecordBytes = options?.maxRecordBytes ?? REPORTER_PROTOCOL_LIMITS.ndjsonRecordBytes;
    this._buffer = Buffer.alloc(0);
  }

  /**
   * Appends a chunk and returns any records it completed.
   *
   * @remarks
   * When this method throws, records completed before the offending record are
   * available from the typed error's `partialRecords`. A newline-terminated
   * offending record has already been discarded, while subsequent records from
   * the chunk remain buffered for the next call.
   *
   * @param chunk - raw bytes or a correctly decoded text fragment of the NDJSON stream
   * @throws NdjsonRecordTooLargeError if a record exceeds the limit
   * @throws NdjsonInvalidRecordError if a complete record is not valid JSON
   */
  public decode(chunk: Buffer | string): unknown[] {
    const chunkBuffer: Buffer =
      typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
    if (chunkBuffer.length > 0) {
      this._buffer =
        this._buffer.length === 0 ? chunkBuffer : Buffer.concat([this._buffer, chunkBuffer]);
    }

    const records: unknown[] = [];

    let newlineIndex: number = this._buffer.indexOf(0x0a);
    while (newlineIndex >= 0) {
      const line: Buffer = this._buffer.subarray(0, newlineIndex);
      this._buffer = this._buffer.subarray(newlineIndex + 1);
      this._processLine(line, records);
      newlineIndex = this._buffer.indexOf(0x0a);
    }

    // A partial line that already exceeds the limit can never become a valid record.
    if (this._buffer.length > this._maxRecordBytes) {
      throw new NdjsonRecordTooLargeError(this._maxRecordBytes, records);
    }

    return records;
  }

  /**
   * Returns any trailing record that was not newline-terminated and resets the buffer.
   *
   * @throws NdjsonRecordTooLargeError if the trailing record exceeds the limit
   * @throws NdjsonInvalidRecordError if the trailing record is not valid JSON
   */
  public flush(): unknown[] {
    const records: unknown[] = [];
    if (this._buffer.length > 0) {
      const line: Buffer = this._buffer;
      this._buffer = Buffer.alloc(0);
      this._processLine(line, records);
    }
    return records;
  }

  private _processLine(line: Buffer, records: unknown[]): void {
    if (line.length > this._maxRecordBytes) {
      throw new NdjsonRecordTooLargeError(this._maxRecordBytes, records);
    }

    const decoder: StringDecoder = new StringDecoder('utf8');
    const rawLine: string = decoder.write(line) + decoder.end();
    const trimmed: string = rawLine.trim();
    if (trimmed.length === 0) {
      return;
    }

    try {
      records.push(JSON.parse(trimmed));
    } catch (error) {
      throw new NdjsonInvalidRecordError(rawLine, error, records);
    }
  }
}
