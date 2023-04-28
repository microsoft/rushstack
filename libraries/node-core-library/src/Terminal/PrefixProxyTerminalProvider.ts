// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminalProvider, TerminalProviderSeverity } from './ITerminalProvider';

/**
 * Options for {@link PrefixProxyTerminalProvider}.
 *
 * @beta
 */
export interface IPrefixProxyTerminalProviderOptions {
  /**
   * The {@link ITerminalProvider} that will be wrapped.
   */
  terminalProvider: ITerminalProvider;

  /**
   * The prefix that should be added to each line of output.
   */
  prefix: string;
}

function escapeRegExp(literal: string): string {
  // Perform a cheap escape of the literal string so that it can be used in a RegExp
  return literal.replace(/[^A-Za-z0-9_]/g, '\\$&');
}

/**
 * Wraps an existing {@link ITerminalProvider} that prefixes each line of output with a specified
 * prefix string.
 *
 * @beta
 */
export class PrefixProxyTerminalProvider implements ITerminalProvider {
  private _parentTerminalProvider: ITerminalProvider;
  private _prefix: string;
  private _currentPrefix: string;
  private _newlineRegex: RegExp;

  public constructor(options: IPrefixProxyTerminalProviderOptions) {
    const { terminalProvider, prefix } = options;
    this._parentTerminalProvider = terminalProvider;
    this._prefix = prefix;
    this._currentPrefix = prefix;
    // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
    this._newlineRegex = new RegExp(`${escapeRegExp(terminalProvider.eolCharacter)}|\\n`, 'g');
  }

  /** @override */
  public get supportsColor(): boolean {
    return this._parentTerminalProvider.supportsColor;
  }

  /** @override */
  public get eolCharacter(): string {
    return this._parentTerminalProvider.eolCharacter;
  }

  /** @override */
  public write(data: string, severity: TerminalProviderSeverity): void {
    // We need to track newlines to ensure that the prefix is added to each line
    let currentIndex: number = 0;
    // eslint-disable-next-line @rushstack/no-new-null
    let newlineMatch: RegExpExecArray | null;
    while ((newlineMatch = this._newlineRegex.exec(data))) {
      // Extract the line, add the prefix, and write it out with the newline
      const newlineIndex: number = newlineMatch.index;
      const newIndex: number = newlineIndex + newlineMatch[0].length;
      const dataToWrite: string = `${this._currentPrefix}${data.substring(currentIndex, newIndex)}`;
      this._parentTerminalProvider.write(dataToWrite, severity);
      // Update the currentIndex to start the search from the char after the newline
      currentIndex = newIndex;
      this._currentPrefix = this._prefix;
    }

    // The remaining data is not postfixed by a newline, so write out the data and set _isNewline to false
    const remainingData: string = data.substring(currentIndex);
    if (remainingData.length) {
      this._parentTerminalProvider.write(`${this._currentPrefix}${remainingData}`, severity);
      this._currentPrefix = '';
    }
  }
}
