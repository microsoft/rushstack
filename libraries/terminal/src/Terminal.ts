// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ITerminalProvider, TerminalProviderSeverity } from './ITerminalProvider';
import { Colorize } from './Colorize';
import type { ITerminal, ITerminalWriteOptions, TerminalWriteParameters } from './ITerminal';
import { AnsiEscape } from './AnsiEscape';

/**
 * This class facilitates writing to a console.
 *
 * @beta
 */
export class Terminal implements ITerminal {
  private readonly _providers: Set<ITerminalProvider>;

  public constructor(provider: ITerminalProvider) {
    this._providers = new Set<ITerminalProvider>([provider]);
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
    this._providers.delete(provider);
  }

  /**
   * {@inheritdoc ITerminal.write}
   */
  public write(...messageParts: TerminalWriteParameters): void {
    const { parts } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(parts, TerminalProviderSeverity.log, false);
  }

  /**
   * {@inheritdoc ITerminal.writeLine}
   */
  public writeLine(...messageParts: TerminalWriteParameters): void {
    const { parts } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(parts, TerminalProviderSeverity.log, true);
  }

  /**
   * {@inheritdoc ITerminal.writeWarning}
   */
  public writeWarning(...messageParts: TerminalWriteParameters): void {
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
  public writeWarningLine(...messageParts: TerminalWriteParameters): void {
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
  public writeError(...messageParts: TerminalWriteParameters): void {
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
  public writeErrorLine(...messageParts: TerminalWriteParameters): void {
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
  public writeVerbose(...messageParts: TerminalWriteParameters): void {
    const { parts } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(parts, TerminalProviderSeverity.verbose, false);
  }

  /**
   * {@inheritdoc ITerminal.writeVerboseLine}
   */
  public writeVerboseLine(...messageParts: TerminalWriteParameters): void {
    const { parts } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(parts, TerminalProviderSeverity.verbose, true);
  }

  /**
   * {@inheritdoc ITerminal.writeDebug}
   */
  public writeDebug(...messageParts: TerminalWriteParameters): void {
    const { parts } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(parts, TerminalProviderSeverity.debug, false);
  }

  /**
   * {@inheritdoc ITerminal.writeDebugLine}
   */
  public writeDebugLine(...messageParts: TerminalWriteParameters): void {
    const { parts } = this._normalizeWriteParameters(messageParts);
    this._writeSegmentsToProviders(parts, TerminalProviderSeverity.debug, true);
  }

  private _writeSegmentsToProviders(
    segments: string[],
    severity: TerminalProviderSeverity,
    followedByEol: boolean
  ): void {
    const lines: string[] = [segments.join('')];
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

  private _normalizeWriteParameters(parameters: TerminalWriteParameters): {
    parts: string[];
    options: ITerminalWriteOptions;
  } {
    if (parameters.length === 0) {
      return { parts: [], options: {} };
    } else {
      const lastParameter: string | ITerminalWriteOptions = parameters[parameters.length - 1];
      if (typeof lastParameter === 'string') {
        return { parts: parameters as string[], options: {} };
      } else {
        return { parts: parameters.slice(0, -1) as string[], options: lastParameter };
      }
    }
  }
}
