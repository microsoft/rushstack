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

}
