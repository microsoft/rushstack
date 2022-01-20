// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AnsiEscape } from './AnsiEscape';

export enum ConsoleColorCodes {
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
 * for use with the node-core-library terminal.
 *
 * @example
 * terminal.writeLine(Colors.green('Green Text!'), ' ', Colors.blue('Blue Text!'));
 *
 * @beta
 */
export class Colors {
  public static black(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.BlackForeground,
      ConsoleColorCodes.DefaultForeground,
      text
    );
  }

  public static red(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.RedForeground,
      ConsoleColorCodes.DefaultForeground,
      text
    );
  }

  public static green(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.GreenForeground,
      ConsoleColorCodes.DefaultForeground,
      text
    );
  }

  public static yellow(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.YellowForeground,
      ConsoleColorCodes.DefaultForeground,
      text
    );
  }

  public static blue(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.BlueForeground,
      ConsoleColorCodes.DefaultForeground,
      text
    );
  }

  public static magenta(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.MagentaForeground,
      ConsoleColorCodes.DefaultForeground,
      text
    );
  }

  public static cyan(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.CyanForeground,
      ConsoleColorCodes.DefaultForeground,
      text
    );
  }

  public static white(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.WhiteForeground,
      ConsoleColorCodes.DefaultForeground,
      text
    );
  }

  public static gray(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.GrayForeground,
      ConsoleColorCodes.DefaultForeground,
      text
    );
  }

  public static blackBackground(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.BlackBackground,
      ConsoleColorCodes.DefaultBackground,
      text
    );
  }

  public static redBackground(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.RedBackground,
      ConsoleColorCodes.DefaultBackground,
      text
    );
  }

  public static greenBackground(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.GreenBackground,
      ConsoleColorCodes.DefaultBackground,
      text
    );
  }

  public static yellowBackground(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.YellowBackground,
      ConsoleColorCodes.DefaultBackground,
      text
    );
  }

  public static blueBackground(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.BlueBackground,
      ConsoleColorCodes.DefaultBackground,
      text
    );
  }

  public static magentaBackground(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.MagentaBackground,
      ConsoleColorCodes.DefaultBackground,
      text
    );
  }

  public static cyanBackground(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.CyanBackground,
      ConsoleColorCodes.DefaultBackground,
      text
    );
  }

  public static whiteBackground(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.WhiteBackground,
      ConsoleColorCodes.DefaultBackground,
      text
    );
  }

  public static grayBackground(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.GrayBackground,
      ConsoleColorCodes.DefaultBackground,
      text
    );
  }

  public static bold(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.Bold,
      ConsoleColorCodes.NormalColorOrIntensity,
      text
    );
  }

  public static dim(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.Dim,
      ConsoleColorCodes.NormalColorOrIntensity,
      text
    );
  }

  public static underline(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.Underline,
      ConsoleColorCodes.UnderlineOff,
      text
    );
  }

  public static blink(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(ConsoleColorCodes.Blink, ConsoleColorCodes.BlinkOff, text);
  }

  public static invertColor(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(
      ConsoleColorCodes.InvertColor,
      ConsoleColorCodes.InvertColorOff,
      text
    );
  }

  public static hidden(text: string): string {
    return Colors._wrapTextInAnsiEscapeCodes(ConsoleColorCodes.Hidden, ConsoleColorCodes.HiddenOff, text);
  }

  private static _wrapTextInAnsiEscapeCodes(startCode: number, endCode: number, text: string): string {
    return (
      AnsiEscape.getEscapeSequenceForAnsiCode(startCode) +
      text +
      AnsiEscape.getEscapeSequenceForAnsiCode(endCode)
    );
  }
}
