// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal, ConsoleTerminalProvider } from '@rushstack/terminal';

import { CreateLinksCommandLineParser } from './cli/CreateLinksCommandLineParser.ts';

const terminal: Terminal = new Terminal(new ConsoleTerminalProvider({ verboseEnabled: true }));

const parser: CreateLinksCommandLineParser = new CreateLinksCommandLineParser(terminal);
parser.executeAsync().catch(terminal.writeErrorLine);
