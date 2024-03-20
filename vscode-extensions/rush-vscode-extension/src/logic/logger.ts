// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';

const consoleTerminalProvider: ConsoleTerminalProvider = new ConsoleTerminalProvider();

export const terminal: Terminal = new Terminal(consoleTerminalProvider);

export type LogLevel = 'info' | 'debug';

export const setLogLevel = (level: LogLevel): void => {
  switch (level) {
    case 'debug': {
      consoleTerminalProvider.debugEnabled = true;
      break;
    }
    case 'info':
    default: {
      consoleTerminalProvider.debugEnabled = false;
      break;
    }
  }
};
