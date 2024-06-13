// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal, ConsoleTerminalProvider } from '@rushstack/terminal';

export const logProvider: ConsoleTerminalProvider = new ConsoleTerminalProvider();
export const terminal: Terminal = new Terminal(logProvider);
