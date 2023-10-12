// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ITerminalProvider, TerminalProviderSeverity } from './ITerminalProvider';
import { Colorize, SgrParameter } from './Colorize';
import type { ITerminal, IWriteOptions, WriteParameters } from './ITerminal';
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
  public write(...messageParts: WriteParameters): void {
    const { parts } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(parts, TerminalProviderSeverity.log, false);
  }

  /**
   * {@inheritdoc ITerminal.writeLine}
   */
  public writeLine(...messageParts: WriteParameters): void {
    const { parts } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(parts, TerminalProviderSeverity.log, true);
  }

  /**
   * {@inheritdoc ITerminal.writeWarning}
   */
  public writeWarning(...messageParts: WriteParameters): void {
    const {
      parts,
      options: { doNotOverrideSgrCodes }
    } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(
      doNotOverrideSgrCodes
        ? parts
        : parts.map((part): string => Colorize.yellow(AnsiEscape.removeCodes(part))),
      TerminalProviderSeverity.warning,
      false
    );
  }

  /**
   * {@inheritdoc ITerminal.writeWarningLine}
   */
  public writeWarningLine(...messageParts: WriteParameters): void {
    const {
      parts,
      options: { doNotOverrideSgrCodes }
    } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(
      doNotOverrideSgrCodes
        ? parts
        : parts.map((part): string => Colorize.yellow(AnsiEscape.removeCodes(part))),
      TerminalProviderSeverity.warning,
      true
    );
  }

  /**
   * {@inheritdoc ITerminal.writeError}
   */
  public writeError(...messageParts: WriteParameters): void {
    const {
      parts,
      options: { doNotOverrideSgrCodes }
    } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(
      doNotOverrideSgrCodes ? parts : parts.map((part): string => Colorize.red(AnsiEscape.removeCodes(part))),
      TerminalProviderSeverity.error,
      false
    );
  }

  /**
   * {@inheritdoc ITerminal.writeErrorLine}
   */
  public writeErrorLine(...messageParts: WriteParameters): void {
    const {
      parts,
      options: { doNotOverrideSgrCodes }
    } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(
      doNotOverrideSgrCodes ? parts : parts.map((part): string => Colorize.red(AnsiEscape.removeCodes(part))),
      TerminalProviderSeverity.error,
      true
    );
  }

  /**
   * {@inheritdoc ITerminal.writeVerbose}
   */
  public writeVerbose(...messageParts: WriteParameters): void {
    const { parts } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(parts, TerminalProviderSeverity.verbose, false);
  }

  /**
   * {@inheritdoc ITerminal.writeVerboseLine}
   */
  public writeVerboseLine(...messageParts: WriteParameters): void {
    const { parts } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(parts, TerminalProviderSeverity.verbose, true);
  }

  /**
   * {@inheritdoc ITerminal.writeDebug}
   */
  public writeDebug(...messageParts: WriteParameters): void {
    const { parts } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(parts, TerminalProviderSeverity.debug, false);
  }

  /**
   * {@inheritdoc ITerminal.writeDebugLine}
   */
  public writeDebugLine(...messageParts: WriteParameters): void {
    const { parts } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(parts, TerminalProviderSeverity.debug, true);
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
        startColorCodes.push(SgrParameter.BlackForeground);
        endColorCodes.push(SgrParameter.DefaultForeground);
        break;
      }

      case ColorValue.Red: {
        startColorCodes.push(SgrParameter.RedForeground);
        endColorCodes.push(SgrParameter.DefaultForeground);
        break;
      }

      case ColorValue.Green: {
        startColorCodes.push(SgrParameter.GreenForeground);
        endColorCodes.push(SgrParameter.DefaultForeground);
        break;
      }

      case ColorValue.Yellow: {
        startColorCodes.push(SgrParameter.YellowForeground);
        endColorCodes.push(SgrParameter.DefaultForeground);
        break;
      }

      case ColorValue.Blue: {
        startColorCodes.push(SgrParameter.BlueForeground);
        endColorCodes.push(SgrParameter.DefaultForeground);
        break;
      }

      case ColorValue.Magenta: {
        startColorCodes.push(SgrParameter.MagentaForeground);
        endColorCodes.push(SgrParameter.DefaultForeground);
        break;
      }

      case ColorValue.Cyan: {
        startColorCodes.push(SgrParameter.CyanForeground);
        endColorCodes.push(SgrParameter.DefaultForeground);
        break;
      }

      case ColorValue.White: {
        startColorCodes.push(SgrParameter.WhiteForeground);
        endColorCodes.push(SgrParameter.DefaultForeground);
        break;
      }

      case ColorValue.Gray: {
        startColorCodes.push(SgrParameter.GrayForeground);
        endColorCodes.push(SgrParameter.DefaultForeground);
        break;
      }
    }

    switch (segment.backgroundColor) {
      case ColorValue.Black: {
        startColorCodes.push(SgrParameter.BlackBackground);
        endColorCodes.push(SgrParameter.DefaultBackground);
        break;
      }

      case ColorValue.Red: {
        startColorCodes.push(SgrParameter.RedBackground);
        endColorCodes.push(SgrParameter.DefaultBackground);
        break;
      }

      case ColorValue.Green: {
        startColorCodes.push(SgrParameter.GreenBackground);
        endColorCodes.push(SgrParameter.DefaultBackground);
        break;
      }

      case ColorValue.Yellow: {
        startColorCodes.push(SgrParameter.YellowBackground);
        endColorCodes.push(SgrParameter.DefaultBackground);
        break;
      }

      case ColorValue.Blue: {
        startColorCodes.push(SgrParameter.BlueBackground);
        endColorCodes.push(SgrParameter.DefaultBackground);
        break;
      }

      case ColorValue.Magenta: {
        startColorCodes.push(SgrParameter.MagentaBackground);
        endColorCodes.push(SgrParameter.DefaultBackground);
        break;
      }

      case ColorValue.Cyan: {
        startColorCodes.push(SgrParameter.CyanBackground);
        endColorCodes.push(SgrParameter.DefaultBackground);
        break;
      }

      case ColorValue.White: {
        startColorCodes.push(SgrParameter.WhiteBackground);
        endColorCodes.push(SgrParameter.DefaultBackground);
        break;
      }

      case ColorValue.Gray: {
        startColorCodes.push(SgrParameter.GrayBackground);
        endColorCodes.push(49);
        break;
      }
    }

    if (segment.textAttributes) {
      for (const textAttribute of segment.textAttributes) {
        switch (textAttribute) {
          case TextAttribute.Bold: {
            startColorCodes.push(SgrParameter.Bold);
            endColorCodes.push(SgrParameter.NormalColorOrIntensity);
            break;
          }

          case TextAttribute.Dim: {
            startColorCodes.push(SgrParameter.Dim);
            endColorCodes.push(SgrParameter.NormalColorOrIntensity);
            break;
          }

          case TextAttribute.Underline: {
            startColorCodes.push(SgrParameter.Underline);
            endColorCodes.push(SgrParameter.UnderlineOff);
            break;
          }

          case TextAttribute.Blink: {
            startColorCodes.push(SgrParameter.Blink);
            endColorCodes.push(SgrParameter.BlinkOff);
            break;
          }

          case TextAttribute.InvertColor: {
            startColorCodes.push(SgrParameter.InvertColor);
            endColorCodes.push(SgrParameter.InvertColorOff);
            break;
          }

          case TextAttribute.Hidden: {
            startColorCodes.push(SgrParameter.Hidden);
            endColorCodes.push(SgrParameter.HiddenOff);
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

  private _normalizeWriteParameters(parameters: WriteParameters): {
    parts: string[];
    options: IWriteOptions;
  } {
    if (parameters.length === 0) {
      return { parts: [], options: {} };
    } else {
      const lastParameter: string | IWriteOptions = parameters[parameters.length - 1];
      if (typeof lastParameter === 'string') {
        return { parts: parameters as string[], options: {} };
      } else {
        return { parts: parameters.slice(0, -1) as string[], options: lastParameter };
      }
    }
  }
}
