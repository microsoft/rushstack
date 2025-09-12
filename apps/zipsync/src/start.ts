// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { version } from '../package.json';
import { Colorize } from '@rushstack/terminal/lib/Colorize';
import { ConsoleTerminalProvider } from '@rushstack/terminal/lib/ConsoleTerminalProvider';
import { Terminal } from '@rushstack/terminal/lib/Terminal';

import { ZipSyncCommandLineParser } from './ZipSyncCommandLineParser';

const toolVersion: string = version;

const consoleTerminalProvider: ConsoleTerminalProvider = new ConsoleTerminalProvider();
const terminal: Terminal = new Terminal(consoleTerminalProvider);

terminal.writeLine();
terminal.writeLine(Colorize.bold(`zipsync ${toolVersion}`) + ' - ' + Colorize.cyan('https://rushstack.io'));
terminal.writeLine();

const commandLine: ZipSyncCommandLineParser = new ZipSyncCommandLineParser(consoleTerminalProvider, terminal);
commandLine.executeAsync().catch((error) => {
  terminal.writeError(error);
});
