// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  ITerminalProvider,
  Terminal
} from '@microsoft/node-core-library';

export class TerminalProvider {
  private static _terminals: Map<ITerminalProvider, Terminal> = new Map<ITerminalProvider, Terminal>();

  public static getTerminal(provider: ITerminalProvider): Terminal {
    if (!TerminalProvider._terminals.has(provider)) {
      TerminalProvider._terminals.set(provider, new Terminal(provider));
    }

    return TerminalProvider._terminals.get(provider)!;
  }
}
