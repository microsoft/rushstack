// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This file is a little program that prints all of the colors to the console.
 *
 * Run this program with `node write-colors.js`
 */

import { Terminal, ConsoleTerminalProvider, Colorize } from '../index.ts';
import { createColorGrid } from './createColorGrid.ts';

const terminal: Terminal = new Terminal(new ConsoleTerminalProvider());
function writeColorGrid(colorGrid: string[][]): void {
  for (const line of colorGrid) {
    terminal.writeLine(...line);
  }
}

writeColorGrid(createColorGrid());
terminal.writeLine();
writeColorGrid(createColorGrid(Colorize.bold));
terminal.writeLine();
writeColorGrid(createColorGrid(Colorize.dim));
terminal.writeLine();
writeColorGrid(createColorGrid(Colorize.underline));
terminal.writeLine();
writeColorGrid(createColorGrid(Colorize.blink));
terminal.writeLine();
writeColorGrid(createColorGrid(Colorize.invertColor));
terminal.writeLine();
writeColorGrid(createColorGrid(Colorize.hidden));
terminal.writeLine();

terminal.write('Normal text...');
terminal.writeLine(Colorize.green('done'));

terminal.writeError('Error...');
terminal.writeErrorLine(Colorize.green('done'));

terminal.writeWarning('Warning...');
terminal.writeWarningLine(Colorize.green('done'));
