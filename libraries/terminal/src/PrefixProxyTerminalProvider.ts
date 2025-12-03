// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text } from '@rushstack/node-core-library';

import type { ITerminalProvider, TerminalProviderSeverity } from './ITerminalProvider';

/**
 * @beta
 */
export interface IPrefixProxyTerminalProviderOptionsBase {
  /**
   * The {@link ITerminalProvider} that will be wrapped.
   */
  terminalProvider: ITerminalProvider;
}

/**
 * Options for {@link PrefixProxyTerminalProvider}, with a static prefix.
 *
 * @beta
 */
export interface IStaticPrefixProxyTerminalProviderOptions extends IPrefixProxyTerminalProviderOptionsBase {
  /**
   * The prefix that should be added to each line of output.
   */
  prefix: string;
}

/**
 * Options for {@link PrefixProxyTerminalProvider}.
 *
 * @beta
 */
export interface IDynamicPrefixProxyTerminalProviderOptions extends IPrefixProxyTerminalProviderOptionsBase {
  /**
   * A function that returns the prefix that should be added to each line of output. This is useful
   * for prefixing each line with a timestamp.
   */
  getPrefix: () => string;
}

/**
 * @beta
 */
export type IPrefixProxyTerminalProviderOptions =
  | IStaticPrefixProxyTerminalProviderOptions
  | IDynamicPrefixProxyTerminalProviderOptions;

/**
 * Wraps an existing {@link ITerminalProvider} that prefixes each line of output with a specified
 * prefix string.
 *
 * @beta
 */
export class PrefixProxyTerminalProvider implements ITerminalProvider {
  private readonly _parentTerminalProvider: ITerminalProvider;
  private readonly _getPrefix: () => string;
  private readonly _newlineRegex: RegExp;
  private _isOnNewline: boolean;

  public constructor(options: IPrefixProxyTerminalProviderOptions) {
    const { terminalProvider } = options;

    this._parentTerminalProvider = terminalProvider;

    if ((options as IStaticPrefixProxyTerminalProviderOptions).prefix !== undefined) {
      const { prefix } = options as IStaticPrefixProxyTerminalProviderOptions;
      this._getPrefix = () => prefix;
    } else {
      const { getPrefix } = options as IDynamicPrefixProxyTerminalProviderOptions;
      this._getPrefix = getPrefix;
    }

    this._isOnNewline = true;

    this._newlineRegex = new RegExp(`${Text.escapeRegExp(terminalProvider.eolCharacter)}|\\n`, 'g');
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
    let newlineMatch: RegExpExecArray | null;

    while ((newlineMatch = this._newlineRegex.exec(data))) {
      // Extract the line, add the prefix, and write it out with the newline
      const newlineIndex: number = newlineMatch.index;
      const newIndex: number = newlineIndex + newlineMatch[0].length;
      const prefix: string = this._isOnNewline ? this._getPrefix() : '';
      const dataToWrite: string = `${prefix}${data.substring(currentIndex, newIndex)}`;
      this._parentTerminalProvider.write(dataToWrite, severity);
      // Update the currentIndex to start the search from the char after the newline
      currentIndex = newIndex;
      this._isOnNewline = true;
    }

    // The remaining data is not postfixed by a newline, so write out the data and set _isNewline to false
    const remainingData: string = data.substring(currentIndex);
    if (remainingData.length) {
      const prefix: string = this._isOnNewline ? this._getPrefix() : '';
      this._parentTerminalProvider.write(`${prefix}${remainingData}`, severity);
      this._isOnNewline = false;
    }
  }
}
