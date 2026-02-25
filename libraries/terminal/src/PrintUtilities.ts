// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text } from '@rushstack/node-core-library';

import type { ITerminal } from './ITerminal.ts';

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
    return process.stdout?.columns;
  }

  /**
   * Applies word wrapping.
   *
   * @param text - The text to wrap
   * @param maxLineLength - The maximum length of a line, defaults to the console width
   * @param indent - The number of spaces to indent the wrapped lines, defaults to 0
   */
  public static wrapWords(text: string, maxLineLength?: number, indent?: number): string;
  /**
   * Applies word wrapping.
   *
   * @param text - The text to wrap
   * @param maxLineLength - The maximum length of a line, defaults to the console width
   * @param linePrefix - The string to prefix each line with, defaults to ''
   */
  public static wrapWords(text: string, maxLineLength?: number, linePrefix?: string): string;
  /**
   * Applies word wrapping.
   *
   * @param text - The text to wrap
   * @param maxLineLength - The maximum length of a line, defaults to the console width
   * @param indentOrLinePrefix - The number of spaces to indent the wrapped lines or the string to prefix
   * each line with, defaults to no prefix
   */
  public static wrapWords(text: string, maxLineLength?: number, indentOrLinePrefix?: number | string): string;
  public static wrapWords(
    text: string,
    maxLineLength?: number,
    indentOrLinePrefix?: number | string
  ): string {
    const wrappedLines: string[] = PrintUtilities.wrapWordsToLines(
      text,
      maxLineLength,
      indentOrLinePrefix as string | undefined // TS is confused by the overloads
    );
    return wrappedLines.join('\n');
  }

  /**
   * Applies word wrapping and returns an array of lines.
   *
   * @param text - The text to wrap
   * @param maxLineLength - The maximum length of a line, defaults to the console width
   * @param indent - The number of spaces to indent the wrapped lines, defaults to 0
   */
  public static wrapWordsToLines(text: string, maxLineLength?: number, indent?: number): string[];
  /**
   * Applies word wrapping and returns an array of lines.
   *
   * @param text - The text to wrap
   * @param maxLineLength - The maximum length of a line, defaults to the console width
   * @param linePrefix - The string to prefix each line with, defaults to ''
   */
  public static wrapWordsToLines(text: string, maxLineLength?: number, linePrefix?: string): string[];
  /**
   * Applies word wrapping and returns an array of lines.
   *
   * @param text - The text to wrap
   * @param maxLineLength - The maximum length of a line, defaults to the console width
   * @param indentOrLinePrefix - The number of spaces to indent the wrapped lines or the string to prefix
   * each line with, defaults to no prefix
   */
  public static wrapWordsToLines(
    text: string,
    maxLineLength?: number,
    indentOrLinePrefix?: number | string
  ): string[];
  public static wrapWordsToLines(
    text: string,
    maxLineLength?: number,
    indentOrLinePrefix?: number | string
  ): string[] {
    let linePrefix: string;
    switch (typeof indentOrLinePrefix) {
      case 'number':
        linePrefix = ' '.repeat(indentOrLinePrefix);
        break;
      case 'string':
        linePrefix = indentOrLinePrefix;
        break;
      default:
        linePrefix = '';
        break;
    }

    const linePrefixLength: number = linePrefix.length;

    if (!maxLineLength) {
      maxLineLength = PrintUtilities.getConsoleWidth() || DEFAULT_CONSOLE_WIDTH;
    }

    // Apply word wrapping and the provided line prefix, while also respecting existing newlines
    // and prefix spaces that may exist in the text string already.
    const lines: string[] = Text.splitByNewLines(text);

    const wrappedLines: string[] = [];
    for (const line of lines) {
      if (line.length + linePrefixLength <= maxLineLength) {
        wrappedLines.push(linePrefix + line);
      } else {
        const lineAdditionalPrefix: string = line.match(/^\s*/)?.[0] || '';
        const whitespaceRegexp: RegExp = /\s+/g;
        let currentWhitespaceMatch: RegExpExecArray | null = null;
        let previousWhitespaceMatch: RegExpExecArray | undefined;
        let currentLineStartIndex: number = lineAdditionalPrefix.length;
        let previousBreakRanOver: boolean = false;
        while ((currentWhitespaceMatch = whitespaceRegexp.exec(line)) !== null) {
          if (currentWhitespaceMatch.index + linePrefixLength - currentLineStartIndex > maxLineLength) {
            let whitespaceToSplitAt: RegExpExecArray | undefined;
            if (
              !previousWhitespaceMatch ||
              // Handle the case where there are two words longer than the maxLineLength in a row
              previousBreakRanOver
            ) {
              whitespaceToSplitAt = currentWhitespaceMatch;
            } else {
              whitespaceToSplitAt = previousWhitespaceMatch;
            }

            wrappedLines.push(
              linePrefix +
                lineAdditionalPrefix +
                line.substring(currentLineStartIndex, whitespaceToSplitAt.index)
            );
            previousBreakRanOver = whitespaceToSplitAt.index - currentLineStartIndex > maxLineLength;
            currentLineStartIndex = whitespaceToSplitAt.index + whitespaceToSplitAt[0].length;
          } else {
            previousBreakRanOver = false;
          }

          previousWhitespaceMatch = currentWhitespaceMatch;
        }

        if (
          previousWhitespaceMatch &&
          line.length + linePrefixLength - currentLineStartIndex > maxLineLength
        ) {
          const whitespaceToSplitAt: RegExpExecArray = previousWhitespaceMatch;

          wrappedLines.push(
            linePrefix +
              lineAdditionalPrefix +
              line.substring(currentLineStartIndex, whitespaceToSplitAt.index)
          );
          currentLineStartIndex = whitespaceToSplitAt.index + whitespaceToSplitAt[0].length;
        }

        if (currentLineStartIndex < line.length) {
          wrappedLines.push(linePrefix + lineAdditionalPrefix + line.substring(currentLineStartIndex));
        }
      }
    }

    return wrappedLines;
  }

  /**
   * Displays a message in the console wrapped in a box UI.
   *
   * @param message - The message to display.
   * @param terminal - The terminal to write the message to.
   * @param boxWidth - The width of the box, defaults to half of the console width.
   */
  public static printMessageInBox(message: string, terminal: ITerminal, boxWidth?: number): void {
    if (!boxWidth) {
      const consoleWidth: number = PrintUtilities.getConsoleWidth() || DEFAULT_CONSOLE_WIDTH;
      boxWidth = Math.floor(consoleWidth / 2);
    }

    const maxLineLength: number = boxWidth - 10;
    const wrappedMessageLines: string[] = PrintUtilities.wrapWordsToLines(message, maxLineLength);
    let longestLineLength: number = 0;
    const trimmedLines: string[] = [];
    for (const line of wrappedMessageLines) {
      const trimmedLine: string = line.trim();
      trimmedLines.push(trimmedLine);
      longestLineLength = Math.max(longestLineLength, trimmedLine.length);
    }

    if (longestLineLength > boxWidth - 2) {
      // If the longest line is longer than the box, print bars above and below the message
      // ═════════════
      //  Message
      // ═════════════
      const headerAndFooter: string = ` ${'═'.repeat(boxWidth)}`;
      terminal.writeLine(headerAndFooter);
      for (const line of wrappedMessageLines) {
        terminal.writeLine(` ${line}`);
      }

      terminal.writeLine(headerAndFooter);
    } else {
      // ╔═══════════╗
      // ║  Message  ║
      // ╚═══════════╝
      terminal.writeLine(` ╔${'═'.repeat(boxWidth - 2)}╗`);
      for (const trimmedLine of trimmedLines) {
        const padding: number = boxWidth - trimmedLine.length - 2;
        const leftPadding: number = Math.floor(padding / 2);
        const rightPadding: number = padding - leftPadding;
        terminal.writeLine(` ║${' '.repeat(leftPadding)}${trimmedLine}${' '.repeat(rightPadding)}║`);
      }
      terminal.writeLine(` ╚${'═'.repeat(boxWidth - 2)}╝`);
    }
  }
}
