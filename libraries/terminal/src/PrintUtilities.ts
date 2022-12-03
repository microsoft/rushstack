// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as tty from 'tty';
import wordwrap from 'wordwrap';
import { ITerminal } from '@rushstack/node-core-library';

/**
 * A sensible fallback column width for consoles.
 *
 * @public
 */
export const DEFAULT_CONSOLE_WIDTH: number = 80;

/**
 * A collection of utilities for printing messages to the console.
 *
 * @public
 */
export class PrintUtilities {
  /**
   * Returns the width of the console, measured in columns
   */
  public static getConsoleWidth(): number | undefined {
    const stdout: tty.WriteStream = process.stdout as tty.WriteStream;
    if (stdout && stdout.columns) {
      return stdout.columns;
    }
  }

  /**
   * Applies word wrapping.  If maxLineLength is unspecified, then it defaults to the
   * console width.
   */
  public static wrapWords(text: string, maxLineLength?: number, indent?: number): string {
    if (!indent) {
      indent = 0;
    }

    if (!maxLineLength) {
      maxLineLength = PrintUtilities.getConsoleWidth() || DEFAULT_CONSOLE_WIDTH;
    }

    // Apply word wrapping and the provided indent, while also respecting existing newlines
    // and prefix spaces that may exist in the text string already.
    const lines: string[] = text.split(/\r?\n/);
    const wrappedLines: string[] = lines.map((line) => {
      const startingSpace: RegExpMatchArray | null = line.match(/^ +/);
      const addlIndent: number = startingSpace?.[0]?.length || 0;

      if (addlIndent > 0) {
        line = line.replace(/^ +/, '');
      }

      return wordwrap(indent! + addlIndent, maxLineLength! - indent! - addlIndent, { mode: 'soft' })(line);
    });

    return wrappedLines.join('\n');
  }

  /**
   * Displays a message in the console wrapped in a box UI.
   *
   * @param boxWidth - The width of the box, defaults to half of the console width.
   */
  public static printMessageInBox(message: string, terminal: ITerminal, boxWidth?: number): void {
    if (!boxWidth) {
      const consoleWidth: number = PrintUtilities.getConsoleWidth() || DEFAULT_CONSOLE_WIDTH;
      boxWidth = Math.floor(consoleWidth / 2);
    }
    const maxLineLength: number = boxWidth - 10;
    const wrappedMessage: string = PrintUtilities.wrapWords(message, maxLineLength);
    const wrappedMessageLines: string[] = wrappedMessage.split('\n');

    // ╔═══════════╗
    // ║  Message  ║
    // ╚═══════════╝
    terminal.writeLine(` ╔${'═'.repeat(boxWidth - 2)}╗ `);
    for (const line of wrappedMessageLines) {
      const trimmedLine: string = line.trim();
      const padding: number = boxWidth - trimmedLine.length - 2;
      const leftPadding: number = Math.floor(padding / 2);
      const rightPadding: number = padding - leftPadding;
      terminal.writeLine(` ║${' '.repeat(leftPadding)}${trimmedLine}${' '.repeat(rightPadding)}║ `);
    }
    terminal.writeLine(` ╚${'═'.repeat(boxWidth - 2)}╝ `);
  }
}
