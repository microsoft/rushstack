// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The allowed types of encodings, as supported by Node.js
 * @public
 */
export const enum Encoding {
  Utf8 = 'utf8'
}

/**
 * Enumeration controlling conversion of newline characters.
 * @public
 */
export const enum NewlineKind {
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
  Lf = '\n'
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
  private static readonly _newLineRegEx: RegExp = /\r\n|\n\r|\r|\n/g;
  private static readonly _newLineAtEndRegEx: RegExp = /(\r\n|\n\r|\r|\n)$/;

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
}
