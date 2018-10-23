import * as colors from 'colors';
import { EOL } from 'os';

import { ITerminalProvider, Severity } from './ITerminalProvider';
import { Text } from '../Text';

interface IFormattableTextSegment {
  text: string;
  colorFunction?: (s: string) => string;
}

/**
 * This class facilitates writing to a console.
 *
 * @beta
 */
export class Terminal {
  public verboseEnabled: boolean;

  private _providers: Set<ITerminalProvider>;

  public constructor(provider: ITerminalProvider, verboseEnabled: boolean = false) {
    this._providers = new Set<ITerminalProvider>();
    this._providers.add(provider);

    this.verboseEnabled = verboseEnabled;
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
  public write(message: string): void {
    const segments: IFormattableTextSegment[] = this._getFormattedTime();
    segments.push(...[
      {
        text: message,
        colorFunction: colors.red
      },
      { text: EOL }
    ]);

    this._writeSegmentsToProviders(segments, Severity.log);

  }

  /**
   * Write a warning message to the console
   */
  public writeWarning(message: string): void {
    const segments: IFormattableTextSegment[] = this._getFormattedTime();
    segments.push(...[
      {
        text: message,
        colorFunction: colors.yellow
      },
      { text: EOL }
    ]);

    this._writeSegmentsToProviders(segments, Severity.warn);
  }

  /**
   * Write an error message to the console
   */
  public writeError(message: string): void {
    const segments: IFormattableTextSegment[] = this._getFormattedTime();
    segments.push(...[
      {
        text: message,
        colorFunction: colors.red
      },
      { text: EOL }
    ]);

    this._writeSegmentsToProviders(segments, Severity.error);
  }

  /**
   * Write a verbose-level message. Messages are only written if verbose mode is turned on.
   */
  public writeVerbose(message: string): void {
    if (this.verboseEnabled) {
      const segments: IFormattableTextSegment[] = this._getFormattedTime();
      segments.push(...[
        { text: message },
        { text: EOL }
      ]);

      this._writeSegmentsToProviders(segments, Severity.log);
    }
  }

  private _getFormattedTime(): IFormattableTextSegment[] {
    const now: Date = new Date();
    const hours: string = Text.padStart(now.getHours().toString(), 2, '0');
    const minutes: string = Text.padStart(now.getMinutes().toString(), 2, '0');
    const seconds: string = Text.padStart(now.getSeconds().toString(), 2, '0');

    const separatedTime: string = `${hours}:${minutes}:${seconds}`;
    return [
      {
        text: '['
      },
      {
        text: separatedTime,
        colorFunction: colors.gray
      },
      {
        text: ']'
      }
    ];
  }

  private _writeSegmentsToProviders(segments: IFormattableTextSegment[], severity: Severity): void {
    let withColor: string;
    let withoutColor: string;

    this._providers.forEach((provider) => {
      const textToWrite: string = provider.supportsColor
        ? (withColor || (withColor = this._serializeFormattableTextSegments(segments, true)))
        : (withoutColor || (withoutColor = this._serializeFormattableTextSegments(segments, false)));
      provider.write(textToWrite, severity);
    });
  }

  private _serializeFormattableTextSegments(segments: IFormattableTextSegment[], withColor: boolean): string {
    const segmentsToJoin: string[] = segments.map(
      (segment) => withColor && segment.colorFunction ? segment.colorFunction(segment.text) : segment.text
    );
    return segmentsToJoin.join('');
  }
}
