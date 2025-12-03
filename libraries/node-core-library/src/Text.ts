// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';

/**
 * The allowed types of encodings, as supported by Node.js
 * @public
 */
export enum Encoding {
  Utf8 = 'utf8'
}

/**
 * Enumeration controlling conversion of newline characters.
 * @public
 */
export enum NewlineKind {
  /**
   * Windows-style newlines
   */
  CrLf = '\r\n',

  /**
   * POSIX-style newlines
   *
   * @remarks
   * POSIX is a registered trademark of the Institute of Electrical and Electronic Engineers, Inc.
   */
  Lf = '\n',

  /**
   * Default newline type for this operating system (`os.EOL`).
   */
  OsDefault = 'os'
}

/**
 * Options used when calling the {@link Text.readLinesFromIterable} or
 * {@link Text.readLinesFromIterableAsync} methods.
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

const NEWLINE_REGEX: RegExp = /\r\n|\n\r|\r|\n/g;
const NEWLINE_AT_END_REGEX: RegExp = /(\r\n|\n\r|\r|\n)$/;

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
  const matches: IterableIterator<RegExpMatchArray> = remaining.matchAll(NEWLINE_REGEX);
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
 * Operations for working with strings that contain text.
 *
 * @remarks
 * The utilities provided by this class are intended to be simple, small, and very
 * broadly applicable.
 *
 * @public
 */
export class Text {
  private static readonly _newLineRegEx: RegExp = NEWLINE_REGEX;
  private static readonly _newLineAtEndRegEx: RegExp = NEWLINE_AT_END_REGEX;

  /**
   * Returns the same thing as targetString.replace(searchValue, replaceValue), except that
   * all matches are replaced, rather than just the first match.
   * @param input         - The string to be modified
   * @param searchValue   - The value to search for
   * @param replaceValue  - The replacement text
   */
  public static replaceAll(input: string, searchValue: string, replaceValue: string): string {
    return input.split(searchValue).join(replaceValue);
  }

  /**
   * Converts all newlines in the provided string to use Windows-style CRLF end of line characters.
   */
  public static convertToCrLf(input: string): string {
    return input.replace(Text._newLineRegEx, '\r\n');
  }

  /**
   * Converts all newlines in the provided string to use POSIX-style LF end of line characters.
   *
   * POSIX is a registered trademark of the Institute of Electrical and Electronic Engineers, Inc.
   */
  public static convertToLf(input: string): string {
    return input.replace(Text._newLineRegEx, '\n');
  }

  /**
   * Converts all newlines in the provided string to use the specified newline type.
   */
  public static convertTo(input: string, newlineKind: NewlineKind): string {
    return input.replace(Text._newLineRegEx, Text.getNewline(newlineKind));
  }

  /**
   * Returns the newline character sequence for the specified `NewlineKind`.
   */
  public static getNewline(newlineKind: NewlineKind): string {
    switch (newlineKind) {
      case NewlineKind.CrLf:
        return '\r\n';
      case NewlineKind.Lf:
        return '\n';
      case NewlineKind.OsDefault:
        return os.EOL;
      default:
        throw new Error('Unsupported newline kind');
    }
  }

  /**
   * Append characters to the end of a string to ensure the result has a minimum length.
   * @remarks
   * If the string length already exceeds the minimum length, then the string is unchanged.
   * The string is not truncated.
   */
  public static padEnd(s: string, minimumLength: number, paddingCharacter: string = ' '): string {
    if (paddingCharacter.length !== 1) {
      throw new Error('The paddingCharacter parameter must be a single character.');
    }

    if (s.length < minimumLength) {
      const paddingArray: string[] = new Array(minimumLength - s.length);
      paddingArray.unshift(s);
      return paddingArray.join(paddingCharacter);
    } else {
      return s;
    }
  }

  /**
   * Append characters to the start of a string to ensure the result has a minimum length.
   * @remarks
   * If the string length already exceeds the minimum length, then the string is unchanged.
   * The string is not truncated.
   */
  public static padStart(s: string, minimumLength: number, paddingCharacter: string = ' '): string {
    if (paddingCharacter.length !== 1) {
      throw new Error('The paddingCharacter parameter must be a single character.');
    }

    if (s.length < minimumLength) {
      const paddingArray: string[] = new Array(minimumLength - s.length);
      paddingArray.push(s);
      return paddingArray.join(paddingCharacter);
    } else {
      return s;
    }
  }

  /**
   * If the string is longer than maximumLength characters, truncate it to that length
   * using "..." to indicate the truncation.
   *
   * @remarks
   * For example truncateWithEllipsis('1234578', 5) would produce '12...'.
   */
  public static truncateWithEllipsis(s: string, maximumLength: number): string {
    if (maximumLength < 0) {
      throw new Error('The maximumLength cannot be a negative number');
    }

    if (s.length <= maximumLength) {
      return s;
    }

    if (s.length <= 3) {
      return s.substring(0, maximumLength);
    }

    return s.substring(0, maximumLength - 3) + '...';
  }

  /**
   * Returns the input string with a trailing `\n` character appended, if not already present.
   */
  public static ensureTrailingNewline(s: string, newlineKind: NewlineKind = NewlineKind.Lf): string {
    // Is there already a newline?
    if (Text._newLineAtEndRegEx.test(s)) {
      return s; // yes, no change
    }
    return s + newlineKind; // no, add it
  }

  /**
   * Escapes a string so that it can be treated as a literal string when used in a regular expression.
   */
  public static escapeRegExp(literal: string): string {
    return literal.replace(/[^A-Za-z0-9_]/g, '\\$&');
  }

  /**
   * Read lines from an iterable object that returns strings or buffers, and return a generator that
   * produces the lines as strings. The lines will not include the newline characters.
   *
   * @param iterable - An iterable object that returns strings or buffers
   * @param options - Options used when reading the lines from the provided iterable
   */
  public static async *readLinesFromIterableAsync(
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
   */
  public static *readLinesFromIterable(
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

  /**
   * Returns a new string that is the input string with the order of characters reversed.
   */
  public static reverse(s: string): string {
    // Benchmarks of several algorithms: https://jsbench.me/4bkfflcm2z
    return s.split('').reduce((newString, char) => char + newString, '');
  }

  /**
   * Splits the provided string by newlines. Note that leading and trailing newlines will produce
   * leading or trailing empty string array entries.
   */
  public static splitByNewLines(s: undefined): undefined;
  public static splitByNewLines(s: string): string[];
  public static splitByNewLines(s: string | undefined): string[] | undefined;
  public static splitByNewLines(s: string | undefined): string[] | undefined {
    return s?.split(/\r?\n/);
  }
}
