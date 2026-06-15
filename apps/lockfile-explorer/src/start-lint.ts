// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal/lib/index';

import { LintCommandLineParser } from './cli/lint/LintCommandLineParser';

const terminal: Terminal = new Terminal(new ConsoleTerminalProvider());
const parser: LintCommandLineParser = new LintCommandLineParser(terminal);

parser.executeAsync().catch(console.error); // CommandLineParser.executeAsync() should never reject the promise
