// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ITerminalProvider, TerminalProviderSeverity } from './ITerminalProvider';
import { Colorize, ConsoleColorCodes } from './Colorize';
import type { ITerminal } from './ITerminal';
import { AnsiEscape } from './AnsiEscape';

/**
 * Colors used with {@link ILegacyColorableSequence}.
 */
enum ColorValue {
  Black,
  Red,
  Green,
  Yellow,
  Blue,
  Magenta,
  Cyan,
  White,
  Gray
}

/**
 * Text styles used with {@link ILegacyColorableSequence}.
 */
enum TextAttribute {
  Bold,
  Dim,
  Underline,
  Blink,
  InvertColor,
  Hidden
}

interface ILegacyColorableSequence {
  text: string;
  isEol?: boolean;
  foregroundColor?: ColorValue;
  backgroundColor?: ColorValue;
  textAttributes?: TextAttribute[];
}

/**
 * This class facilitates writing to a console.
 *
 * @beta
 */
export class Terminal implements ITerminal {
  private _providers: Set<ITerminalProvider>;

  public constructor(provider: ITerminalProvider) {
    this._providers = new Set<ITerminalProvider>();
    this._providers.add(provider);
  }

  /**
   * {@inheritdoc ITerminal.registerProvider}
   */
  public registerProvider(provider: ITerminalProvider): void {
    this._providers.add(provider);
  }

  /**
   * {@inheritdoc ITerminal.unregisterProvider}
   */
  public unregisterProvider(provider: ITerminalProvider): void {
    if (this._providers.has(provider)) {
      this._providers.delete(provider);
    }
  }

  /**
   * {@inheritdoc ITerminal.write}
   */
  public write(...messageParts: string[]): void {
    this._writeSegmentsToProviders(messageParts, TerminalProviderSeverity.log, false);
  }

  /**
   * {@inheritdoc ITerminal.writeLine}
   */
  public writeLine(...messageParts: string[]): void {
    this._writeSegmentsToProviders(messageParts, TerminalProviderSeverity.log, true);
  }

  /**
   * {@inheritdoc ITerminal.writeWarning}
   */
  public writeWarning(...messageParts: string[]): void {
    this._writeSegmentsToProviders(
      messageParts.map((part): string => Colorize.yellow(AnsiEscape.removeCodes(part))),
      TerminalProviderSeverity.warning,
      false
    );
  }

  /**
   * {@inheritdoc ITerminal.writeWarningLine}
   */
  public writeWarningLine(...messageParts: string[]): void {
    this._writeSegmentsToProviders(
      messageParts.map((part): string => Colorize.yellow(AnsiEscape.removeCodes(part))),
      TerminalProviderSeverity.warning,
      true
    );
  }

  /**
   * {@inheritdoc ITerminal.writeError}
   */
  public writeError(...messageParts: string[]): void {
    this._writeSegmentsToProviders(
      messageParts.map((part): string => Colorize.red(AnsiEscape.removeCodes(part))),
      TerminalProviderSeverity.error,
      false
    );
  }

  /**
   * {@inheritdoc ITerminal.writeErrorLine}
   */
  public writeErrorLine(...messageParts: string[]): void {
    this._writeSegmentsToProviders(
      messageParts.map((part): string => Colorize.red(AnsiEscape.removeCodes(part))),
      TerminalProviderSeverity.error,
      true
    );
  }

  /**
   * {@inheritdoc ITerminal.writeVerbose}
   */
  public writeVerbose(...messageParts: string[]): void {
    this._writeSegmentsToProviders(messageParts, TerminalProviderSeverity.verbose, false);
  }

  /**
   * {@inheritdoc ITerminal.writeVerboseLine}
   */
  public writeVerboseLine(...messageParts: string[]): void {
    this._writeSegmentsToProviders(messageParts, TerminalProviderSeverity.verbose, true);
  }

  /**
   * {@inheritdoc ITerminal.writeDebug}
   */
  public writeDebug(...messageParts: string[]): void {
    this._writeSegmentsToProviders(messageParts, TerminalProviderSeverity.debug, false);
  }

  /**
   * {@inheritdoc ITerminal.writeDebugLine}
   */
  public writeDebugLine(...messageParts: string[]): void {
    this._writeSegmentsToProviders(messageParts, TerminalProviderSeverity.debug, true);
  }

  private _writeSegmentsToProviders(
    segments: (string | ILegacyColorableSequence)[],
    severity: TerminalProviderSeverity,
    followedByEol: boolean
  ): void {
    const linesSegments: string[][] = [[]];
    let currentLineSegments: string[] = linesSegments[0];
    for (const segment of segments) {
      if (typeof segment === 'string') {
        currentLineSegments.push(segment);
      } else {
        if (segment.isEol) {
          linesSegments.push([]);
          currentLineSegments = linesSegments[linesSegments.length - 1];
        } else {
          currentLineSegments.push(this._serializeLegacyColorableSequence(segment));
        }
      }
    }

    const lines: string[] = [];
    for (const lineSegments of linesSegments) {
      lines.push(lineSegments.join(''));
    }

    if (followedByEol) {
      lines.push('');
    }

    let linesWithoutColor: string[] | undefined;

    const concatenatedLinesWithColorByNewlineChar: Map<string, string> = new Map();
    const concatenatedLinesWithoutColorByNewlineChar: Map<string, string> = new Map();
    for (const provider of this._providers) {
      let textToWrite: string | undefined;
      const eol: string = provider.eolCharacter;
      if (provider.supportsColor) {
        textToWrite = concatenatedLinesWithColorByNewlineChar.get(eol);
        if (!textToWrite) {
          textToWrite = lines.join(eol);
          concatenatedLinesWithColorByNewlineChar.set(eol, textToWrite);
        }
      } else {
        textToWrite = concatenatedLinesWithoutColorByNewlineChar.get(eol);
        if (!textToWrite) {
          if (!linesWithoutColor) {
            linesWithoutColor = [];
            for (const line of lines) {
              linesWithoutColor.push(AnsiEscape.removeCodes(line));
            }
          }

          textToWrite = linesWithoutColor.join(eol);
          concatenatedLinesWithoutColorByNewlineChar.set(eol, textToWrite);
        }
      }

      provider.write(textToWrite, severity);
    }
  }

  private _serializeLegacyColorableSequence(segment: ILegacyColorableSequence): string {
    const startColorCodes: number[] = [];
    const endColorCodes: number[] = [];
    switch (segment.foregroundColor) {
      case ColorValue.Black: {
        startColorCodes.push(ConsoleColorCodes.BlackForeground);
        endColorCodes.push(ConsoleColorCodes.DefaultForeground);
        break;
      }

      case ColorValue.Red: {
        startColorCodes.push(ConsoleColorCodes.RedForeground);
        endColorCodes.push(ConsoleColorCodes.DefaultForeground);
        break;
      }

      case ColorValue.Green: {
        startColorCodes.push(ConsoleColorCodes.GreenForeground);
        endColorCodes.push(ConsoleColorCodes.DefaultForeground);
        break;
      }

      case ColorValue.Yellow: {
        startColorCodes.push(ConsoleColorCodes.YellowForeground);
        endColorCodes.push(ConsoleColorCodes.DefaultForeground);
        break;
      }

      case ColorValue.Blue: {
        startColorCodes.push(ConsoleColorCodes.BlueForeground);
        endColorCodes.push(ConsoleColorCodes.DefaultForeground);
        break;
      }

      case ColorValue.Magenta: {
        startColorCodes.push(ConsoleColorCodes.MagentaForeground);
        endColorCodes.push(ConsoleColorCodes.DefaultForeground);
        break;
      }

      case ColorValue.Cyan: {
        startColorCodes.push(ConsoleColorCodes.CyanForeground);
        endColorCodes.push(ConsoleColorCodes.DefaultForeground);
        break;
      }

      case ColorValue.White: {
        startColorCodes.push(ConsoleColorCodes.WhiteForeground);
        endColorCodes.push(ConsoleColorCodes.DefaultForeground);
        break;
      }

      case ColorValue.Gray: {
        startColorCodes.push(ConsoleColorCodes.GrayForeground);
        endColorCodes.push(ConsoleColorCodes.DefaultForeground);
        break;
      }
    }

    switch (segment.backgroundColor) {
      case ColorValue.Black: {
        startColorCodes.push(ConsoleColorCodes.BlackBackground);
        endColorCodes.push(ConsoleColorCodes.DefaultBackground);
        break;
      }

      case ColorValue.Red: {
        startColorCodes.push(ConsoleColorCodes.RedBackground);
        endColorCodes.push(ConsoleColorCodes.DefaultBackground);
        break;
      }

      case ColorValue.Green: {
        startColorCodes.push(ConsoleColorCodes.GreenBackground);
        endColorCodes.push(ConsoleColorCodes.DefaultBackground);
        break;
      }

      case ColorValue.Yellow: {
        startColorCodes.push(ConsoleColorCodes.YellowBackground);
        endColorCodes.push(ConsoleColorCodes.DefaultBackground);
        break;
      }

      case ColorValue.Blue: {
        startColorCodes.push(ConsoleColorCodes.BlueBackground);
        endColorCodes.push(ConsoleColorCodes.DefaultBackground);
        break;
      }

      case ColorValue.Magenta: {
        startColorCodes.push(ConsoleColorCodes.MagentaBackground);
        endColorCodes.push(ConsoleColorCodes.DefaultBackground);
        break;
      }

      case ColorValue.Cyan: {
        startColorCodes.push(ConsoleColorCodes.CyanBackground);
        endColorCodes.push(ConsoleColorCodes.DefaultBackground);
        break;
      }

      case ColorValue.White: {
        startColorCodes.push(ConsoleColorCodes.WhiteBackground);
        endColorCodes.push(ConsoleColorCodes.DefaultBackground);
        break;
      }

      case ColorValue.Gray: {
        startColorCodes.push(ConsoleColorCodes.GrayBackground);
        endColorCodes.push(49);
        break;
      }
    }

    if (segment.textAttributes) {
      for (const textAttribute of segment.textAttributes) {
        switch (textAttribute) {
          case TextAttribute.Bold: {
            startColorCodes.push(ConsoleColorCodes.Bold);
            endColorCodes.push(ConsoleColorCodes.NormalColorOrIntensity);
            break;
          }

          case TextAttribute.Dim: {
            startColorCodes.push(ConsoleColorCodes.Dim);
            endColorCodes.push(ConsoleColorCodes.NormalColorOrIntensity);
            break;
          }

          case TextAttribute.Underline: {
            startColorCodes.push(ConsoleColorCodes.Underline);
            endColorCodes.push(ConsoleColorCodes.UnderlineOff);
            break;
          }

          case TextAttribute.Blink: {
            startColorCodes.push(ConsoleColorCodes.Blink);
            endColorCodes.push(ConsoleColorCodes.BlinkOff);
            break;
          }

          case TextAttribute.InvertColor: {
            startColorCodes.push(ConsoleColorCodes.InvertColor);
            endColorCodes.push(ConsoleColorCodes.InvertColorOff);
            break;
          }

          case TextAttribute.Hidden: {
            startColorCodes.push(ConsoleColorCodes.Hidden);
            endColorCodes.push(ConsoleColorCodes.HiddenOff);
            break;
          }
        }
      }
    }

    const resultSegments: string[] = [];
    for (let j: number = 0; j < startColorCodes.length; j++) {
      const code: number = startColorCodes[j];
      resultSegments.push(AnsiEscape.getEscapeSequenceForAnsiCode(code));
    }

    resultSegments.push(segment.text);

    for (let j: number = endColorCodes.length - 1; j >= 0; j--) {
      const code: number = endColorCodes[j];
      resultSegments.push(AnsiEscape.getEscapeSequenceForAnsiCode(code));
    }

    return resultSegments.join('');
  }
}
