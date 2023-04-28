// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  ITerminal,
  Terminal,
  ITerminalProvider,
  TerminalProviderSeverity
} from '@rushstack/node-core-library';

export class PrefixProxyTerminalProvider implements ITerminalProvider {
  private _parent: ITerminalProvider;
  private _prefix: string;
  private _isNewline: boolean = true;

  public constructor(parent: ITerminalProvider, prefix: string) {
    this._parent = parent;
    this._prefix = prefix;
  }

  public static getTerminal(parent: ITerminalProvider, prefix: string): ITerminal {
    const provider: ITerminalProvider = new PrefixProxyTerminalProvider(parent, prefix);
    return new Terminal(provider);
  }

  public get supportsColor(): boolean {
    return this._parent.supportsColor;
  }

  public get eolCharacter(): string {
    return this._parent.eolCharacter;
  }

  public write(data: string, severity: TerminalProviderSeverity): void {
    // We need to track newlines to ensure that the prefix is added to each line
    let currentIndex: number = 0;
    let newlineIndex: number;
    while ((newlineIndex = data.indexOf('\n', currentIndex)) !== -1) {
      // Extract the line, add the prefix, and write it out with the newline
      const newIndex: number = newlineIndex + 1;
      const dataToWrite: string = `${this._isNewline ? this._prefix : ''}${data.substring(
        currentIndex,
        newIndex
      )}`;
      this._parent.write(dataToWrite, severity);
      // Update the currentIndex to start the search from the char after the newline
      currentIndex = newIndex;
      this._isNewline = true;
    }

    // The remaining data is not postfixed by a newline, so write out the data and set _isNewline to false
    const remainingData: string = data.substring(currentIndex);
    if (remainingData.length) {
      this._parent.write(`${this._isNewline ? this._prefix : ''}${remainingData}`, severity);
      this._isNewline = false;
    }
  }
}
