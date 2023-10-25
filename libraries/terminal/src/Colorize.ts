// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AnsiEscape } from './AnsiEscape';

export enum SgrParameter {
  BlackForeground = 30,
  RedForeground = 31,
  GreenForeground = 32,
  YellowForeground = 33,
  BlueForeground = 34,
  MagentaForeground = 35,
  CyanForeground = 36,
  WhiteForeground = 37,
  GrayForeground = 90,
  DefaultForeground = 39,

  BlackBackground = 40,
  RedBackground = 41,
  GreenBackground = 42,
  YellowBackground = 43,
  BlueBackground = 44,
  MagentaBackground = 45,
  CyanBackground = 46,
  WhiteBackground = 47,
  GrayBackground = 100,
  DefaultBackground = 49,

  Bold = 1,

  // On Linux, the "BoldOff" code instead causes the text to be double-underlined:
  // https://en.wikipedia.org/wiki/Talk:ANSI_escape_code#SGR_21%E2%80%94%60Bold_off%60_not_widely_supported
  // Use "NormalColorOrIntensity" instead
  // BoldOff = 21,

  Dim = 2,
  NormalColorOrIntensity = 22,
  Underline = 4,
  UnderlineOff = 24,
  Blink = 5,
  BlinkOff = 25,
  InvertColor = 7,
  InvertColorOff = 27,
  Hidden = 8,
  HiddenOff = 28
}

/**
 * The static functions on this class are used to produce colored text
 * for use with a terminal that supports ANSI escape codes.
 *
 * Note that this API always generates color codes, regardless of whether
 * the process's stdout is a TTY. The reason is that, in a complex program, the
 * code that is generating strings often does not know were those strings will end
 * up. In some cases, the same log message may get printed both to a shell
 * that supports color AND to a log file that does not.
 *
 * @example
 * ```ts
 * console.log(Colorize.red('Red Text!'))
 * terminal.writeLine(Colorize.green('Green Text!'), ' ', Colorize.blue('Blue Text!'));
 *```
 *
 * @public
 */
export class Colorize {
  public static black(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.BlackForeground,
      SgrParameter.DefaultForeground,
      text
    );
  }

  public static red(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.RedForeground,
      SgrParameter.DefaultForeground,
      text
    );
  }

  public static green(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.GreenForeground,
      SgrParameter.DefaultForeground,
      text
    );
  }

  public static yellow(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.YellowForeground,
      SgrParameter.DefaultForeground,
      text
    );
  }

  public static blue(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.BlueForeground,
      SgrParameter.DefaultForeground,
      text
    );
  }

  public static magenta(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.MagentaForeground,
      SgrParameter.DefaultForeground,
      text
    );
  }

  public static cyan(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.CyanForeground,
      SgrParameter.DefaultForeground,
      text
    );
  }

  public static white(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.WhiteForeground,
      SgrParameter.DefaultForeground,
      text
    );
  }

  public static gray(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.GrayForeground,
      SgrParameter.DefaultForeground,
      text
    );
  }

  public static blackBackground(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.BlackBackground,
      SgrParameter.DefaultBackground,
      text
    );
  }

  public static redBackground(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.RedBackground,
      SgrParameter.DefaultBackground,
      text
    );
  }

  public static greenBackground(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.GreenBackground,
      SgrParameter.DefaultBackground,
      text
    );
  }

  public static yellowBackground(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.YellowBackground,
      SgrParameter.DefaultBackground,
      text
    );
  }

  public static blueBackground(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.BlueBackground,
      SgrParameter.DefaultBackground,
      text
    );
  }

  public static magentaBackground(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.MagentaBackground,
      SgrParameter.DefaultBackground,
      text
    );
  }

  public static cyanBackground(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.CyanBackground,
      SgrParameter.DefaultBackground,
      text
    );
  }

  public static whiteBackground(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.WhiteBackground,
      SgrParameter.DefaultBackground,
      text
    );
  }

  public static grayBackground(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(
      SgrParameter.GrayBackground,
      SgrParameter.DefaultBackground,
      text
    );
  }

  public static bold(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(SgrParameter.Bold, SgrParameter.NormalColorOrIntensity, text);
  }

  public static dim(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(SgrParameter.Dim, SgrParameter.NormalColorOrIntensity, text);
  }

  public static underline(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(SgrParameter.Underline, SgrParameter.UnderlineOff, text);
  }

  public static blink(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(SgrParameter.Blink, SgrParameter.BlinkOff, text);
  }

  public static invertColor(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(SgrParameter.InvertColor, SgrParameter.InvertColorOff, text);
  }

  public static hidden(text: string): string {
    return Colorize._wrapTextInAnsiEscapeCodes(SgrParameter.Hidden, SgrParameter.HiddenOff, text);
  }

  private static _wrapTextInAnsiEscapeCodes(startCode: number, endCode: number, text: string): string {
    return (
      AnsiEscape.getEscapeSequenceForAnsiCode(startCode) +
      text +
      AnsiEscape.getEscapeSequenceForAnsiCode(endCode)
    );
  }
}
