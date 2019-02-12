// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  ITerminalProvider,
  TerminalProviderSeverity
} from './ITerminalProvider';
import {
  IColorableSequence,
  ColorValue,
  Colors,
  eolSequence,
  TextAttribute
} from './Colors';

/**
 * This class facilitates writing to a console.
 *
 * @beta
 */
export class Terminal {
  private _providers: Set<ITerminalProvider>;

  public constructor(provider: ITerminalProvider) {
    this._providers = new Set<ITerminalProvider>();
    this._providers.add(provider);
  }

  /**
   * Subscribe a new terminal provider.
   */
  public registerProvider(provider: ITerminalProvider): void {
    this._providers.add(provider);
  }

  /**
   * Unsubscribe a terminal provider. If the provider isn't subscribed, this function does nothing.
   */
  public unregisterProvider(provider: ITerminalProvider): void {
    if (this._providers.has(provider)) {
      this._providers.delete(provider);
    }
  }

  /**
   * Write a generic message to the terminal
   */
  public write(...messageParts: (string | IColorableSequence)[]): void {
    this._writeSegmentsToProviders(messageParts, TerminalProviderSeverity.log);
  }

  /**
   * Write a generic message to the terminal, followed by a newline
   */
  public writeLine(...messageParts: (string | IColorableSequence)[]): void {
    this.write(...messageParts, eolSequence);
  }

  /**
   * Write a warning message to the console with yellow text.
   *
   * @remarks
   * The yellow color takes precedence over any other foreground colors set.
   */
  public writeWarning(...messageParts: (string | IColorableSequence)[]): void {
    this._writeSegmentsToProviders(
      messageParts.map(
        (part): IColorableSequence => ({
          ...Colors._normalizeStringOrColorableSequence(part),
          foregroundColor: ColorValue.Yellow
        })
      ),
      TerminalProviderSeverity.warning
    );
  }

  /**
   * Write a warning message to the console with yellow text, followed by a newline.
   *
   * @remarks
   * The yellow color takes precedence over any other foreground colors set.
   */
  public writeWarningLine(...messageParts: (string | IColorableSequence)[]): void {
    this._writeSegmentsToProviders(
      [
        ...messageParts.map(
          (part): IColorableSequence => ({
            ...Colors._normalizeStringOrColorableSequence(part),
            foregroundColor: ColorValue.Yellow
          })
        ),
        eolSequence
      ],
      TerminalProviderSeverity.warning
    );
  }

  /**
   * Write an error message to the console with red text.
   *
   * @remarks
   * The red color takes precedence over any other foreground colors set.
   */
  public writeError(...messageParts: (string | IColorableSequence)[]): void {
    this._writeSegmentsToProviders(
      messageParts.map(
        (part): IColorableSequence => ({
          ...Colors._normalizeStringOrColorableSequence(part),
          foregroundColor: ColorValue.Red
        })
      ),
      TerminalProviderSeverity.error
    );
  }

  /**
   * Write an error message to the console with red text, followed by a newline.
   *
   * @remarks
   * The red color takes precedence over any other foreground colors set.
   */
  public writeErrorLine(...messageParts: (string | IColorableSequence)[]): void {
    this._writeSegmentsToProviders(
      [
        ...messageParts.map(
          (part): IColorableSequence => ({
            ...Colors._normalizeStringOrColorableSequence(part),
            foregroundColor: ColorValue.Red
          })
        ),
        eolSequence
      ],
      TerminalProviderSeverity.error
    );
  }

  /**
   * Write a verbose-level message.
   */
  public writeVerbose(...messageParts: (string | IColorableSequence)[]): void {
    this._writeSegmentsToProviders(messageParts, TerminalProviderSeverity.verbose);
  }

  /**
   * Write a verbose-level message followed by a newline.
   */
  public writeVerboseLine(...messageParts: (string | IColorableSequence)[]): void {
    this.writeVerbose(...messageParts, eolSequence);
  }

  private _writeSegmentsToProviders(
    segments: (string | IColorableSequence)[],
    severity: TerminalProviderSeverity
  ): void {
    const withColorText: { [eolChar: string]: string } = {};
    const withoutColorText: { [eolChar: string]: string } = {};
    let withColorLines: string[] | undefined;
    let withoutColorLines: string[] | undefined;

    this._providers.forEach((provider) => {
      const eol: string = provider.eolCharacter;
      let textToWrite: string;
      if (provider.supportsColor) {
        if (!withColorLines) {
          withColorLines = this._serializeFormattableTextSegments(segments, true);
        }

        if (!withColorText[eol]) {
          withColorText[eol] = withColorLines.join(eol);
        }

        textToWrite = withColorText[eol];
      } else {
        if (!withoutColorLines) {
          withoutColorLines = this._serializeFormattableTextSegments(segments, false);
        }

        if (!withoutColorText[eol]) {
          withoutColorText[eol] = withoutColorLines.join(eol);
        }

        textToWrite = withoutColorText[eol];
      }

      provider.write(textToWrite, severity);
    });
  }

  private _serializeFormattableTextSegments(segments: (string | IColorableSequence)[], withColor: boolean): string[] {
    const lines: string[] = [];
    let segmentsToJoin: string[] = [];
    let lastSegmentWasEol: boolean = false;
    for (let i: number = 0; i < segments.length; i++) {
      const segment: IColorableSequence = Colors._normalizeStringOrColorableSequence(segments[i]);
      lastSegmentWasEol = !!segment.isEol;
      if (lastSegmentWasEol) {
        lines.push(segmentsToJoin.join(''));
        segmentsToJoin = [];
      } else {

        if (withColor) {
          const startColorCodes: number[] = [];
          const endColorCodes: number[] = [];
          switch (segment.foregroundColor) {
            case ColorValue.Black: {
              startColorCodes.push(30);
              endColorCodes.push(39);
              break;
            }

            case ColorValue.Red: {
              startColorCodes.push(31);
              endColorCodes.push(39);
              break;
            }

            case ColorValue.Green: {
              startColorCodes.push(32);
              endColorCodes.push(39);
              break;
            }

            case ColorValue.Yellow: {
              startColorCodes.push(33);
              endColorCodes.push(39);
              break;
            }

            case ColorValue.Blue: {
              startColorCodes.push(34);
              endColorCodes.push(39);
              break;
            }

            case ColorValue.Magenta: {
              startColorCodes.push(35);
              endColorCodes.push(39);
              break;
            }

            case ColorValue.Cyan: {
              startColorCodes.push(36);
              endColorCodes.push(39);
              break;
            }

            case ColorValue.White: {
              startColorCodes.push(37);
              endColorCodes.push(39);
              break;
            }

            case ColorValue.Gray: {
              startColorCodes.push(90);
              endColorCodes.push(39);
              break;
            }
          }

          switch (segment.backgroundColor) {
            case ColorValue.Black: {
              startColorCodes.push(40);
              endColorCodes.push(49);
              break;
            }

            case ColorValue.Red: {
              startColorCodes.push(41);
              endColorCodes.push(49);
              break;
            }

            case ColorValue.Green: {
              startColorCodes.push(42);
              endColorCodes.push(49);
              break;
            }

            case ColorValue.Yellow: {
              startColorCodes.push(43);
              endColorCodes.push(49);
              break;
            }

            case ColorValue.Blue: {
              startColorCodes.push(44);
              endColorCodes.push(49);
              break;
            }

            case ColorValue.Magenta: {
              startColorCodes.push(45);
              endColorCodes.push(49);
              break;
            }

            case ColorValue.Cyan: {
              startColorCodes.push(46);
              endColorCodes.push(49);
              break;
            }

            case ColorValue.White: {
              startColorCodes.push(47);
              endColorCodes.push(49);
              break;
            }

            case ColorValue.Gray: {
              startColorCodes.push(100);
              endColorCodes.push(49);
              break;
            }
          }

          if (segment.textAttributes) {
            for (const textAttribute of segment.textAttributes) {
              switch (textAttribute) {
                case TextAttribute.Bold: {
                  startColorCodes.push(1);
                  endColorCodes.push(21);
                  break;
                }

                case TextAttribute.Dim: {
                  startColorCodes.push(2);
                  endColorCodes.push(22);
                  break;
                }

                case TextAttribute.Underline: {
                  startColorCodes.push(4);
                  endColorCodes.push(24);
                  break;
                }

                case TextAttribute.Blink: {
                  startColorCodes.push(5);
                  endColorCodes.push(25);
                  break;
                }

                case TextAttribute.InvertColor: {
                  startColorCodes.push(7);
                  endColorCodes.push(27);
                  break;
                }

                case TextAttribute.Hidden: {
                  startColorCodes.push(8);
                  endColorCodes.push(28);
                  break;
                }
              }
            }
          }

          for (let j: number = 0; j < startColorCodes.length; j++) {
            const code: number = startColorCodes[j];
            segmentsToJoin.push(...[
              '\u001b[',
              code.toString(),
              'm'
            ]);
          }

          segmentsToJoin.push(segment.text);

          for (let j: number = endColorCodes.length - 1; j >= 0; j--) {
            const code: number = endColorCodes[j];
            segmentsToJoin.push(...[
              '\u001b[',
              code.toString(),
              'm'
            ]);
          }
        } else {
          segmentsToJoin.push(segment.text);
        }
      }
    }

    if (segmentsToJoin.length > 0) {
      lines.push(segmentsToJoin.join(''));
    }

    if (lastSegmentWasEol) {
      lines.push('');
    }

    return lines;
  }
}
