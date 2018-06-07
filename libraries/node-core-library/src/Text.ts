// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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
   * Converts all newlines in the provided string to use Unix-style LF end of line characters.
   */
  public static convertToLf(input: string): string {
    return input.replace(Text._newLineRegEx, '\n');
  }

  /**
   * Append spaces to the end of a string to ensure the result has a minimum length.
   * @remarks
   * If the string length already exceeds the minimum length, then the string is unchanged.
   * The string is not truncated.
   */
  public static padEnd(s: string, minimumLength: number): string {
    let result: string = s;
    while (result.length < minimumLength) {
      result += ' ';
    }
    return result;
  }

  /**
   * If the string is longer than maximumLength characters, truncate it to that length
   * using "..." to indicate the truncation.
   *
   * @remarks
   * For example truncateWithEllipsis('1234578', 5) would produce '12...'.
   */
  public static truncateWithEllipsis(s: string, maximumLength: number): string {
    if (s.length <= maximumLength) {
      return s;
    }

    if (s.length < 4) {
      return s.substring(0, maximumLength);
    }

    return s.substring(0, maximumLength - 3) + '...';
  }
}
