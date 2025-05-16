// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal, ConsoleTerminalProvider, type TerminalWriteParameters } from '@rushstack/terminal';

export const terminal: Terminal = new Terminal(new ConsoleTerminalProvider({ verboseEnabled: true }));

export function log(...messageParts: TerminalWriteParameters): void {
  terminal.writeErrorLine(...messageParts);
}
