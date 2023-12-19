// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// ----------------------------------------------------------------------------------------------------------
// TO AVOID EXTRA DEPENDENCIES, THE CODE IN THIS FILE WAS BORROWED FROM:
//
// rushstack/libraries/terminal/src/PrintUtilities.ts
//
// KEEP IT IN SYNC WITH THAT FILE.
// ----------------------------------------------------------------------------------------------------------

/**
 * Applies word wrapping and returns an array of lines.
 *
 * @param text - The text to wrap
 * @param maxLineLength - The maximum length of a line, defaults to the console width
 * @param indent - The number of spaces to indent the wrapped lines, defaults to 0
 */
export function wrapWordsToLines(text: string, maxLineLength?: number, indent?: number): string[];
/**
 * Applies word wrapping and returns an array of lines.
 *
 * @param text - The text to wrap
 * @param maxLineLength - The maximum length of a line, defaults to the console width
 * @param linePrefix - The string to prefix each line with, defaults to ''
 */
export function wrapWordsToLines(text: string, maxLineLength?: number, linePrefix?: string): string[];
/**
 * Applies word wrapping and returns an array of lines.
 *
 * @param text - The text to wrap
 * @param maxLineLength - The maximum length of a line, defaults to the console width
 * @param indentOrLinePrefix - The number of spaces to indent the wrapped lines or the string to prefix
 * each line with, defaults to no prefix
 */
export function wrapWordsToLines(
  text: string,
  maxLineLength?: number,
  indentOrLinePrefix?: number | string
): string[];
export function wrapWordsToLines(
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
    maxLineLength = process.stdout.getWindowSize()[0];
  }

  // Apply word wrapping and the provided line prefix, while also respecting existing newlines
  // and prefix spaces that may exist in the text string already.
  const lines: string[] = text.split(/\r?\n/);

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

      if (currentLineStartIndex < line.length) {
        wrappedLines.push(linePrefix + lineAdditionalPrefix + line.substring(currentLineStartIndex));
      }
    }
  }

  return wrappedLines;
}
