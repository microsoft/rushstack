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
  readonly #parentTerminalProvider: ITerminalProvider;
  readonly #getPrefix: () => string;
  readonly #newlineRegex: RegExp;
  #isOnNewline: boolean;

  public constructor(options: IPrefixProxyTerminalProviderOptions) {
    const { terminalProvider } = options;

    this.#parentTerminalProvider = terminalProvider;

    if ((options as IStaticPrefixProxyTerminalProviderOptions).prefix !== undefined) {
      const { prefix } = options as IStaticPrefixProxyTerminalProviderOptions;
      this.#getPrefix = () => prefix;
    } else {
      const { getPrefix } = options as IDynamicPrefixProxyTerminalProviderOptions;
      this.#getPrefix = getPrefix;
    }

    this.#isOnNewline = true;

    this.#newlineRegex = new RegExp(`${Text.escapeRegExp(terminalProvider.eolCharacter)}|\\n`, 'g');
  }

  public get supportsColor(): boolean {
    return this.#parentTerminalProvider.supportsColor;
  }

  public get eolCharacter(): string {
    return this.#parentTerminalProvider.eolCharacter;
  }

  public write(data: string, severity: TerminalProviderSeverity): void {
    // We need to track newlines to ensure that the prefix is added to each line
    let currentIndex: number = 0;
    let newlineMatch: RegExpExecArray | null;

    while ((newlineMatch = this.#newlineRegex.exec(data))) {
      // Extract the line, add the prefix, and write it out with the newline
      const newlineIndex: number = newlineMatch.index;
      const newIndex: number = newlineIndex + newlineMatch[0].length;
      const prefix: string = this.#isOnNewline ? this.#getPrefix() : '';
      const dataToWrite: string = `${prefix}${data.substring(currentIndex, newIndex)}`;
      this.#parentTerminalProvider.write(dataToWrite, severity);
      // Update the currentIndex to start the search from the char after the newline
      currentIndex = newIndex;
      this.#isOnNewline = true;
    }

    // The remaining data is not postfixed by a newline, so write out the data and set _isNewline to false
    const remainingData: string = data.substring(currentIndex);
    if (remainingData.length) {
      const prefix: string = this.#isOnNewline ? this.#getPrefix() : '';
      this.#parentTerminalProvider.write(`${prefix}${remainingData}`, severity);
      this.#isOnNewline = false;
    }
  }
}
