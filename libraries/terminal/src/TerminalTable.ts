// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AnsiEscape } from './AnsiEscape';

/**
 * The set of characters used to draw table borders.
 *
 * @public
 */
export interface ITerminalTableChars {
  top: string;
  'top-mid': string;
  'top-left': string;
  'top-right': string;
  bottom: string;
  'bottom-mid': string;
  'bottom-left': string;
  'bottom-right': string;
  left: string;
  'left-mid': string;
  mid: string;
  'mid-mid': string;
  right: string;
  'right-mid': string;
  middle: string;
}

/**
 * Options for {@link TerminalTable}.
 *
 * @public
 */
export interface ITerminalTableOptions {
  /**
   * Column header labels.
   */
  head?: string[];

  /**
   * Fixed column widths in characters, including one character of padding on each side.
   * Columns not listed default to auto-sizing based on content.
   */
  colWidths?: number[];

  /**
   * Overrides for individual border characters.
   * Pass an empty string for any character to suppress that part of the border.
   */
  chars?: Partial<ITerminalTableChars>;
}

const DEFAULT_CHARS: ITerminalTableChars = {
  top: '─',
  'top-mid': '┬',
  'top-left': '┌',
  'top-right': '┐',
  bottom: '─',
  'bottom-mid': '┴',
  'bottom-left': '└',
  'bottom-right': '┘',
  left: '│',
  'left-mid': '├',
  mid: '─',
  'mid-mid': '┼',
  right: '│',
  'right-mid': '┤',
  middle: '│'
};

/**
 * Renders text data as a fixed-column table suitable for terminal output.
 *
 * Designed as a drop-in replacement for the `cli-table` and `cli-table3` npm packages,
 * with correct handling of ANSI escape sequences when calculating column widths.
 *
 * @example
 * ```typescript
 * const table = new TerminalTable({ head: ['Name', 'Version'] });
 * table.push(['@rushstack/terminal', '1.0.0']);
 * table.push(['@rushstack/heft', '2.0.0']);
 * console.log(table.toString());
 * ```
 *
 * @public
 */
export class TerminalTable {
  private readonly _head: string[];
  private readonly _specifiedColWidths: (number | undefined)[];
  private readonly _chars: ITerminalTableChars;
  private readonly _rows: string[][];

  public constructor(options?: ITerminalTableOptions) {
    this._head = options?.head ?? [];
    this._specifiedColWidths = options?.colWidths ?? [];
    this._chars = { ...DEFAULT_CHARS, ...options?.chars };
    this._rows = [];
  }

  /**
   * Appends one or more rows to the table.
   */
  public push(...rows: string[][]): void {
    for (const row of rows) {
      this._rows.push(row);
    }
  }

  /**
   * Renders the table to a string.
   */
  public toString(): string {
    const allRows: string[][] = this._head.length > 0 ? [this._head, ...this._rows] : this._rows;
    const colCount: number = Math.max(0, ...allRows.map((r) => r.length));
    if (colCount === 0) {
      return '';
    }

    // Resolve final column widths: use specified width if provided, otherwise auto-size from content.
    const colWidths: number[] = [];
    for (let col: number = 0; col < colCount; col++) {
      const specified: number | undefined = this._specifiedColWidths[col];
      if (specified !== undefined) {
        colWidths.push(specified);
      } else {
        let maxContent: number = 0;
        for (const row of allRows) {
          if (col < row.length) {
            const w: number = AnsiEscape.removeCodes(row[col]).length;
            if (w > maxContent) maxContent = w;
          }
        }
        // +2 for one character of padding on each side
        colWidths.push(maxContent + 2);
      }
    }

    // Renders a horizontal separator line. Returns undefined if the result would be empty.
    const renderSeparator = (
      leftChar: string,
      fillChar: string,
      midChar: string,
      rightChar: string
    ): string | undefined => {
      const line: string = leftChar + colWidths.map((w) => fillChar.repeat(w)).join(midChar) + rightChar;
      return line.length > 0 ? line : undefined;
    };

    // Renders a single data row.
    const renderRow = (row: string[]): string => {
      const cells: string[] = [];
      for (let col: number = 0; col < colCount; col++) {
        const content: string = col < row.length ? row[col] : '';
        const visualWidth: number = AnsiEscape.removeCodes(content).length;
        // 1 char of left-padding; right-padding fills the remainder of the column width.
        const padRight: number = Math.max(colWidths[col] - 1 - visualWidth, 0);
        cells.push(' ' + content + ' '.repeat(padRight));
      }
      return this._chars.left + cells.join(this._chars.middle) + this._chars.right;
    };

    const lines: string[] = [];

    // Top border
    const topLine: string | undefined = renderSeparator(
      this._chars['top-left'],
      this._chars.top,
      this._chars['top-mid'],
      this._chars['top-right']
    );
    if (topLine !== undefined) lines.push(topLine);

    // Header row + separator
    if (this._head.length > 0) {
      lines.push(renderRow(this._head));
      const headerSep: string | undefined = renderSeparator(
        this._chars['left-mid'],
        this._chars.mid,
        this._chars['mid-mid'],
        this._chars['right-mid']
      );
      if (headerSep !== undefined) lines.push(headerSep);
    }

    // Data rows (no separator between them)
    for (const row of this._rows) {
      lines.push(renderRow(row));
    }

    // Bottom border
    const bottomLine: string | undefined = renderSeparator(
      this._chars['bottom-left'],
      this._chars.bottom,
      this._chars['bottom-mid'],
      this._chars['bottom-right']
    );
    if (bottomLine !== undefined) {
      lines.push(bottomLine);
    }

    return lines.join('\n');
  }
}
