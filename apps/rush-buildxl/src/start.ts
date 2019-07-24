// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  Terminal,
  ConsoleTerminalProvider
} from '@microsoft/node-core-library';

import { RushBuildXLCommandLineParser } from './cli/RushBuildXLCommandLineParser';

const terminal: Terminal = new Terminal(new ConsoleTerminalProvider({ verboseEnabled: true }));
const parser: RushBuildXLCommandLineParser = new RushBuildXLCommandLineParser(terminal);
parser.execute().catch((error) => terminal.writeErrorLine(error));
