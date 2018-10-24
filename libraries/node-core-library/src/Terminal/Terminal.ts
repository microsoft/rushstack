// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'os';

import { ITerminalProvider, TerminalProviderSeverity } from './ITerminalProvider';
import { IColorableSequence, ColorValue } from './Colors';

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

  public registerProvider(provider: ITerminalProvider): void {
    this._providers.add(provider);
  }

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
    this.write(...messageParts, { text: EOL });
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
        (part) => ({ ...(typeof part === 'string' ? { text: part } : part), foregroundColor: ColorValue.Yellow })
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
          (part) => ({ ...(typeof part === 'string' ? { text: part } : part), foregroundColor: ColorValue.Yellow })
        ),
        { text: EOL }
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
        (part) => ({ ...(typeof part === 'string' ? { text: part } : part), foregroundColor: ColorValue.Red })
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
          (part) => ({ ...(typeof part === 'string' ? { text: part } : part), foregroundColor: ColorValue.Yellow })
        ),
        { text: EOL }
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
    this.writeVerbose(...messageParts, { text: EOL });
  }

  private _writeSegmentsToProviders(
    segments: (string | IColorableSequence)[],
    severity: TerminalProviderSeverity
  ): void {
    let withColor: string;
    let withoutColor: string;

    this._providers.forEach((provider) => {
      const textToWrite: string = provider.supportsColor
        ? (withColor || (withColor = this._serializeFormattableTextSegments(segments, true)))
        : (withoutColor || (withoutColor = this._serializeFormattableTextSegments(segments, false)));
      provider.write(textToWrite, severity);
    });
  }

  private _serializeFormattableTextSegments(segments: (string | IColorableSequence)[], withColor: boolean): string {
    const segmentsToJoin: string[] = [];
    for (let i: number = 0; i < segments.length; i++) {
      let segment: string | IColorableSequence = segments[i];
      if (withColor) {
        if (typeof segment === 'string') {
          segment = { text: segment };
        }

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
        segmentsToJoin.push(typeof segment === 'string' ? segment : segment.text);
      }
    }

    return segmentsToJoin.join('');
  }
}
