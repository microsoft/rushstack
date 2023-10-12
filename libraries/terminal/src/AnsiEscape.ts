// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SgrParameter } from './Colorize';

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
 * Operations for working with text strings that contain
 * {@link https://en.wikipedia.org/wiki/ANSI_escape_code | ANSI escape codes}.
 * The most commonly used escape codes set the foreground/background color for console output.
 * @public
 */
export class AnsiEscape {
  // For now, we only care about the Control Sequence Introducer (CSI) commands which always start with "[".
  // eslint-disable-next-line no-control-regex
  private static readonly _csiRegExp: RegExp = /\x1b\[([\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e])/gu;

  // Text coloring is performed using Select Graphic Rendition (SGR) codes, which come after the
  // CSI introducer "ESC [".  The SGR sequence is a number followed by "m".
  private static readonly _sgrRegExp: RegExp = /([0-9]+)m/u;

  private static readonly _backslashNRegExp: RegExp = /\n/g;
  private static readonly _backslashRRegExp: RegExp = /\r/g;

  public static getEscapeSequenceForAnsiCode(code: number): string {
    return `\u001b[${code}m`;
  }

  /**
   * Returns the input text with all ANSI escape codes removed.  For example, this is useful when saving
   * colorized console output to a log file.
   */
  public static removeCodes(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(AnsiEscape._csiRegExp, '');
  }

  /**
   * Replaces ANSI escape codes with human-readable tokens.  This is useful for unit tests
   * that compare text strings in test assertions or snapshot files.
   */
  public static formatForTests(text: string, options?: IAnsiEscapeConvertForTestsOptions): string {
    if (!options) {
      options = {};
    }

    let result: string = text.replace(AnsiEscape._csiRegExp, (capture: string, csiCode: string) => {
      // If it is an SGR code, then try to show a friendly token
      const match: RegExpMatchArray | null = csiCode.match(AnsiEscape._sgrRegExp);
      if (match) {
        const sgrParameter: number = parseInt(match[1], 10);
        const sgrParameterName: string | undefined = AnsiEscape._tryGetSgrFriendlyName(sgrParameter);
        if (sgrParameterName) {
          // Example: "[black-bg]"
          return `[${sgrParameterName}]`;
        }
      }

      // Otherwise show the raw code, but without the "[" from the CSI prefix
      // Example: "[31m]"
      return `[${csiCode}]`;
    });

    if (options.encodeNewlines) {
      result = result
        .replace(AnsiEscape._backslashNRegExp, '[n]')
        .replace(AnsiEscape._backslashRRegExp, `[r]`);
    }
    return result;
  }

  // Returns a human-readable token representing an SGR parameter, or undefined for parameter that is not well-known.
  // The SGR parameter numbers are documented in this table:
  // https://en.wikipedia.org/wiki/ANSI_escape_code#SGR_parameters
  private static _tryGetSgrFriendlyName(sgiParameter: number): string | undefined {
    switch (sgiParameter) {
      case SgrParameter.BlackForeground:
        return 'black';
      case SgrParameter.RedForeground:
        return 'red';
      case SgrParameter.GreenForeground:
        return 'green';
      case SgrParameter.YellowForeground:
        return 'yellow';
      case SgrParameter.BlueForeground:
        return 'blue';
      case SgrParameter.MagentaForeground:
        return 'magenta';
      case SgrParameter.CyanForeground:
        return 'cyan';
      case SgrParameter.WhiteForeground:
        return 'white';
      case SgrParameter.GrayForeground:
        return 'gray';
      case SgrParameter.DefaultForeground:
        return 'default';

      case SgrParameter.BlackBackground:
        return 'black-bg';
      case SgrParameter.RedBackground:
        return 'red-bg';
      case SgrParameter.GreenBackground:
        return 'green-bg';
      case SgrParameter.YellowBackground:
        return 'yellow-bg';
      case SgrParameter.BlueBackground:
        return 'blue-bg';
      case SgrParameter.MagentaBackground:
        return 'magenta-bg';
      case SgrParameter.CyanBackground:
        return 'cyan-bg';
      case SgrParameter.WhiteBackground:
        return 'white-bg';
      case SgrParameter.GrayBackground:
        return 'gray-bg';
      case SgrParameter.DefaultBackground:
        return 'default-bg';

      case SgrParameter.Bold:
        return 'bold';
      case SgrParameter.Dim:
        return 'dim';
      case SgrParameter.NormalColorOrIntensity:
        return 'normal';
      case SgrParameter.Underline:
        return 'underline';
      case SgrParameter.UnderlineOff:
        return 'underline-off';
      case SgrParameter.Blink:
        return 'blink';
      case SgrParameter.BlinkOff:
        return 'blink-off';
      case SgrParameter.InvertColor:
        return 'invert';
      case SgrParameter.InvertColorOff:
        return 'invert-off';
      case SgrParameter.Hidden:
        return 'hidden';
      case SgrParameter.HiddenOff:
        return 'hidden-off';
      default:
        return undefined;
    }
  }
}
