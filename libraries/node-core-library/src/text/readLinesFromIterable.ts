// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { NEWLINE_REGEX } from './_newlineHelpers';

/**
 * The allowed types of encodings, as supported by Node.js
 * @public
 */
export enum Encoding {
  Utf8 = 'utf8'
}

/**
 * Options used when calling the readLinesFromIterable or
 * readLinesFromIterableAsync methods.
 *
 * @public
 */
export interface IReadLinesFromIterableOptions {
  /**
   * The encoding of the input iterable. The default is utf8.
   */
  encoding?: Encoding;

  /**
   * If true, empty lines will not be returned. The default is false.
   */
  ignoreEmptyLines?: boolean;
}

interface IReadLinesFromIterableState {
  remaining: string;
}

function* readLinesFromChunk(
  // eslint-disable-next-line @rushstack/no-new-null
  chunk: string | Buffer | null,
  encoding: Encoding,
  ignoreEmptyLines: boolean,
  state: IReadLinesFromIterableState
): Generator<string> {
  if (!chunk) {
    return;
  }
  const remaining: string = state.remaining + (typeof chunk === 'string' ? chunk : chunk.toString(encoding));
  let startIndex: number = 0;
  const matches: IterableIterator<RegExpMatchArray> = NEWLINE_REGEX[Symbol.matchAll](remaining);
  for (const match of matches) {
    const endIndex: number = match.index!;
    if (startIndex !== endIndex || !ignoreEmptyLines) {
      yield remaining.substring(startIndex, endIndex);
    }
    startIndex = endIndex + match[0].length;
  }
  state.remaining = remaining.substring(startIndex);
}

/**
 * Read lines from an iterable object that returns strings or buffers, and return a generator that
 * produces the lines as strings. The lines will not include the newline characters.
 *
 * @param iterable - An iterable object that returns strings or buffers
 * @param options - Options used when reading the lines from the provided iterable
 * @public
 */
export async function* readLinesFromIterableAsync(
  iterable: AsyncIterable<string | Buffer>,
  options: IReadLinesFromIterableOptions = {}
): AsyncGenerator<string> {
  const { encoding = Encoding.Utf8, ignoreEmptyLines = false } = options;
  const state: IReadLinesFromIterableState = { remaining: '' };
  for await (const chunk of iterable) {
    yield* readLinesFromChunk(chunk, encoding, ignoreEmptyLines, state);
  }
  const remaining: string = state.remaining;
  if (remaining.length) {
    yield remaining;
  }
}

/**
 * Read lines from an iterable object that returns strings or buffers, and return a generator that
 * produces the lines as strings. The lines will not include the newline characters.
 *
 * @param iterable - An iterable object that returns strings or buffers
 * @param options - Options used when reading the lines from the provided iterable
 * @public
 */
export function* readLinesFromIterable(
  // eslint-disable-next-line @rushstack/no-new-null
  iterable: Iterable<string | Buffer | null>,
  options: IReadLinesFromIterableOptions = {}
): Generator<string> {
  const { encoding = Encoding.Utf8, ignoreEmptyLines = false } = options;
  const state: IReadLinesFromIterableState = { remaining: '' };
  for (const chunk of iterable) {
    yield* readLinesFromChunk(chunk, encoding, ignoreEmptyLines, state);
  }
  const remaining: string = state.remaining;
  if (remaining.length) {
    yield remaining;
  }
}
