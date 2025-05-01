// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal, ConsoleTerminalProvider } from '@rushstack/terminal';

export const terminal: Terminal = new Terminal(new ConsoleTerminalProvider({ verboseEnabled: true }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function log(message?: any, ...optionalParams: any[]): void {
  terminal.writeErrorLine(message, ...optionalParams);
}
