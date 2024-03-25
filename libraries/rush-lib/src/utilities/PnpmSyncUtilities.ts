// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';
import type { ILogMessageCallbackOptions } from 'pnpm-sync-lib';

export function logMessageCallback(logMessageOptions: ILogMessageCallbackOptions, terminal: ITerminal): void {
  const { message, messageKind } = logMessageOptions;
  switch (messageKind) {
    case 'error':
      terminal.writeErrorLine(message);
      break;
    case 'warning':
      terminal.writeWarningLine(message);
      break;
    case 'verbose':
      terminal.writeVerboseLine(message);
      break;
    default:
      terminal.writeLine(message);
      break;
  }
}
