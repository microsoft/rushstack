// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ConsoleColorCodes } from './Colors';

/**
 * Options for {@link AnsiEscape.formatForTests}.
 * @public
 */
export interface IAnsiEscapeConvertForTestsOptions {
  /**
   * If true then `\n` will be replaced by `[n]`, and `\r` will be replaced by `[r]`.
   */
  encodeNewlines?: boolean;
}

/**
 * Operations for encoding and decoding text strings containing
 * {@link https://en.wikipedia.org/wiki/ANSI_escape_code | ANSI escape codes}.
 * The most commonly used escape codes set the foreground/background color for
 * console output.
 * @public
 */
export class AnsiEscape {
  // For now, we only care about the Control Sequence Introducer (CSI) commands which always start with "[".
  // eslint-disable-next-line no-control-regex
  private static _csiRegExp: RegExp = /\x1b\[([\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e])/gu;

  // Text coloring is performed using Select Graphic Rendition (SGR) codes, which come after the
  // CSI introducer "ESC [".  The SGR sequence is a number followed by "m".
  private static _sgrRegExp: RegExp = /([0-9]+)m/u;

  /**
   * Replaces ANSI escape codes with human-readable tokens.  This is useful for unit tests
   * that compare text strings in test assertions or snapshot files.
   */
  public static formatForTests(text: string, options?: IAnsiEscapeConvertForTestsOptions): string {
    if (!options) {
      options = {};
    }

    let result: string = text.replace(AnsiEscape._csiRegExp, (capture: string, csiCode: string) => {
      const match: RegExpMatchArray | null = csiCode.match(AnsiEscape._sgrRegExp);

      if (match) {
        const sgiCode: number = parseInt(match[1]);
        const colorCode: string | undefined = ConsoleColorCodes[sgiCode];
        if (colorCode) {
          // Example: "[BlackForeground]"
          return `[${colorCode}]`;
        }
      }

      // Example: "[31m]"
      return `[${csiCode}]`;
    });

    if (options.encodeNewlines) {
      result = result.replace('\n', '[n]').replace('\r', `[r]`);
    }
    return result;
  }
}
