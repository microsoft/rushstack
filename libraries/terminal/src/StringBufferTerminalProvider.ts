// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBuilder, Text } from '@rushstack/node-core-library';

import { type ITerminalProvider, TerminalProviderSeverity } from './ITerminalProvider';
import { AnsiEscape } from './AnsiEscape';

/**
 * @beta
 */
export interface IStringBufferOutputOptions {
  /**
   * If set to true, special characters like \\n, \\r, and the \\u001b character
   * in color control tokens will get normalized to [-n-], [-r-], and [-x-] respectively
   *
   * This option defaults to `true`
   */
  normalizeSpecialCharacters?: boolean;
}

/**
 * @beta
 */
export interface IStringBufferOutputChunksOptions extends IStringBufferOutputOptions {
  /**
   * If true, the output chunks will be returned as a flat array of prefixed strings of an array of objects.
   */
  asFlat?: boolean;
}

/**
 * @beta
 */
export interface IAllStringBufferOutput {
  log: string;
  warning: string;
  error: string;
  verbose: string;
  debug: string;
}

/**
 * @beta
 */
export type TerminalProviderSeverityName = keyof typeof TerminalProviderSeverity;

/**
 * @beta
 */
export interface IOutputChunk {
  text: string;
  severity: TerminalProviderSeverityName;
}

function _normalizeOutput(s: string, options: IStringBufferOutputOptions | undefined): string {
  options = {
    normalizeSpecialCharacters: true,

    ...(options || {})
  };

  s = Text.convertToLf(s);

  if (options.normalizeSpecialCharacters) {
    return AnsiEscape.formatForTests(s, { encodeNewlines: true });
  } else {
    return s;
  }
}

const LONGEST_SEVERITY_NAME_LENGTH: number = Math.max(
  ...Object.keys(TerminalProviderSeverity).map(({ length }) => length)
);

/**
 * Terminal provider that stores written data in buffers separated by severity.
 * This terminal provider is designed to be used when code that prints to a terminal
 * is being unit tested.
 *
 * @beta
 */
export class StringBufferTerminalProvider implements ITerminalProvider {
  private _standardBuffer: StringBuilder = new StringBuilder();
  private _verboseBuffer: StringBuilder = new StringBuilder();
  private _debugBuffer: StringBuilder = new StringBuilder();
  private _warningBuffer: StringBuilder = new StringBuilder();
  private _errorBuffer: StringBuilder = new StringBuilder();
  private _allOutputChunks: IOutputChunk[] = [];

  /**
   * {@inheritDoc ITerminalProvider.supportsColor}
   */
  public readonly supportsColor: boolean;

  public constructor(supportsColor: boolean = false) {
    this.supportsColor = supportsColor;
  }

  /**
   * {@inheritDoc ITerminalProvider.write}
   */
  public write(text: string, severity: TerminalProviderSeverity): void {
    this._allOutputChunks.push({
      text,
      severity: TerminalProviderSeverity[severity] as TerminalProviderSeverityName
    });

    switch (severity) {
      case TerminalProviderSeverity.warning: {
        this._warningBuffer.append(text);
        break;
      }

      case TerminalProviderSeverity.error: {
        this._errorBuffer.append(text);
        break;
      }

      case TerminalProviderSeverity.verbose: {
        this._verboseBuffer.append(text);
        break;
      }

      case TerminalProviderSeverity.debug: {
        this._debugBuffer.append(text);
        break;
      }

      case TerminalProviderSeverity.log:
      default: {
        this._standardBuffer.append(text);
        break;
      }
    }
  }

  /**
   * {@inheritDoc ITerminalProvider.eolCharacter}
   */
  public get eolCharacter(): string {
    return '\n';
  }

  /**
   * Get everything that has been written at log-level severity.
   */
  public getOutput(options?: IStringBufferOutputOptions): string {
    return _normalizeOutput(this._standardBuffer.toString(), options);
  }

  /**
   * @deprecated - use {@link StringBufferTerminalProvider.getVerboseOutput}
   */
  public getVerbose(options?: IStringBufferOutputOptions): string {
    return this.getVerboseOutput(options);
  }

  /**
   * Get everything that has been written at verbose-level severity.
   */
  public getVerboseOutput(options?: IStringBufferOutputOptions): string {
    return _normalizeOutput(this._verboseBuffer.toString(), options);
  }

  /**
   * Get everything that has been written at debug-level severity.
   */
  public getDebugOutput(options?: IStringBufferOutputOptions): string {
    return _normalizeOutput(this._debugBuffer.toString(), options);
  }

  /**
   * Get everything that has been written at error-level severity.
   */
  public getErrorOutput(options?: IStringBufferOutputOptions): string {
    return _normalizeOutput(this._errorBuffer.toString(), options);
  }

  /**
   * Get everything that has been written at warning-level severity.
   */
  public getWarningOutput(options?: IStringBufferOutputOptions): string {
    return _normalizeOutput(this._warningBuffer.toString(), options);
  }

  /**
   * Get everything that has been written at all severity levels.
   */
  public getAllOutput(sparse?: false, options?: IStringBufferOutputOptions): IAllStringBufferOutput;
  public getAllOutput(sparse: true, options?: IStringBufferOutputOptions): Partial<IAllStringBufferOutput>;
  public getAllOutput(
    sparse: boolean | undefined,
    options?: IStringBufferOutputOptions
  ): Partial<IAllStringBufferOutput> {
    const result: Partial<IAllStringBufferOutput> = {};

    const log: string = this.getOutput(options);
    if (!sparse || log) {
      result.log = log;
    }

    const warning: string = this.getWarningOutput(options);
    if (!sparse || warning) {
      result.warning = warning;
    }

    const error: string = this.getErrorOutput(options);
    if (!sparse || error) {
      result.error = error;
    }

    const verbose: string = this.getVerboseOutput(options);
    if (!sparse || verbose) {
      result.verbose = verbose;
    }

    const debug: string = this.getDebugOutput(options);
    if (!sparse || debug) {
      result.debug = debug;
    }

    return result;
  }

  /**
   * Get everything that has been written as an array of output chunks, preserving order.
   */
  public getAllOutputAsChunks(
    options?: IStringBufferOutputChunksOptions & { asFlat?: false }
  ): IOutputChunk[];
  public getAllOutputAsChunks(
    options: IStringBufferOutputChunksOptions & { asFlat: true }
  ): `[${string}] ${string}`[];
  public getAllOutputAsChunks(options: IStringBufferOutputChunksOptions = {}): IOutputChunk[] | string[] {
    if (options.asFlat) {
      return this._allOutputChunks.map(({ text: rawText, severity: rawSeverity }) => {
        const text: string = _normalizeOutput(rawText, options);
        const severity: TerminalProviderSeverity | string = (
          rawSeverity as TerminalProviderSeverityName
        ).padStart(LONGEST_SEVERITY_NAME_LENGTH, ' ');

        return `[${severity}] ${text}`;
      });
    } else {
      return this._allOutputChunks.map(({ text: rawText, severity }) => {
        const text: string = _normalizeOutput(rawText, options);
        return {
          text,
          severity
        };
      });
    }
  }
}
