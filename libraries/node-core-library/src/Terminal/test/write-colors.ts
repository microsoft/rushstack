// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This file is a little program that prints all of the colors to the console.
 *
 * Run this program with `node write-colors.js`
 */

import {
  Terminal,
  ConsoleTerminalProvider
} from '../../index';
import { createColorGrid } from './createColorGrid';
import { Colors } from '../Colors';

const terminal: Terminal = new Terminal(new ConsoleTerminalProvider());
for (const line of createColorGrid()) {
  terminal.writeLine(...line);
}

terminal.writeLine();

terminal.write('Normal text...');
terminal.writeLine(Colors.green('done'));

terminal.writeError('Error...');
terminal.writeErrorLine(Colors.green('done'));

terminal.writeWarning('Warning...');
terminal.writeWarningLine(Colors.green('done'));
