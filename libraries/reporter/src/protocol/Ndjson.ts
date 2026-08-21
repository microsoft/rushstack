// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { REPORTER_PROTOCOL_LIMITS } from './ReporterProtocol';

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
   * Valid records completed by the decoder before it rejected the oversized record.
   */
  public readonly decodedRecords: readonly unknown[];

  public constructor(maxRecordBytes: number, decodedRecords: readonly unknown[] = []) {
    super(`The NDJSON record exceeds the maximum size of ${maxRecordBytes} bytes.`);
    this.name = 'NdjsonRecordTooLargeError';
    this.maxRecordBytes = maxRecordBytes;
    this.decodedRecords = [...decodedRecords];

    // Restore the prototype chain, which is broken when subclassing a built-in
    // and compiling to CommonJS.
    Object.setPrototypeOf(this, NdjsonRecordTooLargeError.prototype);
  }
}

/**
 * Thrown when a completed NDJSON record is not valid JSON.
 *
 * @beta
 */
export class NdjsonInvalidRecordError extends Error {
  /**
   * Valid records completed before the malformed record.
   */
  public readonly decodedRecords: readonly unknown[];

  /**
   * The JSON parser error that caused this failure.
   */
  public readonly parseError: Error;

  public constructor(decodedRecords: readonly unknown[], parseError: Error) {
    super('The NDJSON record is not valid JSON.');
    this.name = 'NdjsonInvalidRecordError';
    this.decodedRecords = [...decodedRecords];
    this.parseError = parseError;

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
 * @throws NdjsonRecordTooLargeError if the encoded record exceeds the limit
 *
 * @beta
 */
export function encodeNdjsonRecord(value: unknown, options?: INdjsonOptions): string {
  const json: string = JSON.stringify(value);
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
 * If a later record fails, its error exposes earlier valid records through
 * `decodedRecords`; the rejected completed line is consumed and any subsequent
 * buffered lines remain available to a later call.
 *
 * @beta
 */
export class NdjsonDecoder {
  private readonly _maxRecordBytes: number;
  private _buffer: string;

  public constructor(options?: INdjsonOptions) {
    this._maxRecordBytes = options?.maxRecordBytes ?? REPORTER_PROTOCOL_LIMITS.ndjsonRecordBytes;
    this._buffer = '';
  }

  /**
   * Appends a chunk and returns any records it completed.
   *
   * @param chunk - a fragment of the NDJSON stream
   * @throws {@link NdjsonRecordTooLargeError} if a record exceeds the limit
   * @throws {@link NdjsonInvalidRecordError} if a completed record is malformed
   */
  public decode(chunk: string): unknown[] {
    this._buffer += chunk;
    const records: unknown[] = [];

    let newlineIndex: number = this._buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line: string = this._buffer.slice(0, newlineIndex);
      this._buffer = this._buffer.slice(newlineIndex + 1);
      this._processLine(line, records);
      newlineIndex = this._buffer.indexOf('\n');
    }

    // A partial line that already exceeds the limit can never become a valid record.
    if (Buffer.byteLength(this._buffer, 'utf8') > this._maxRecordBytes) {
      throw new NdjsonRecordTooLargeError(this._maxRecordBytes, records);
    }

    return records;
  }

  /**
   * Returns any trailing record that was not newline-terminated and resets the buffer.
   *
   * @throws {@link NdjsonRecordTooLargeError} if the trailing record exceeds the limit
   * @throws {@link NdjsonInvalidRecordError} if the trailing record is malformed
   */
  public flush(): unknown[] {
    const records: unknown[] = [];
    if (this._buffer.length > 0) {
      const line: string = this._buffer;
      this._buffer = '';
      this._processLine(line, records);
    }
    return records;
  }

  private _processLine(line: string, records: unknown[]): void {
    if (Buffer.byteLength(line, 'utf8') > this._maxRecordBytes) {
      throw new NdjsonRecordTooLargeError(this._maxRecordBytes, records);
    }
    const trimmed: string = line.trim();
    if (trimmed.length === 0) {
      return;
    }
    try {
      records.push(JSON.parse(trimmed));
    } catch (error) {
      const parseError: Error =
        error instanceof Error ? error : new Error('An unknown JSON parsing failure occurred.');
      throw new NdjsonInvalidRecordError(records, parseError);
    }
  }
}
