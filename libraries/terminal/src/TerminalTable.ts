// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AnsiEscape } from './AnsiEscape';
import type { ITerminal } from './ITerminal';

/**
 * The set of characters used to draw table borders.
 *
 * Visual reference (default Unicode box-drawing characters):
 * ```
 * ┌─────────┬─────────┐  ← topLeft, top (fill), topCenter, topRight
 * │ header  │ header  │  ← left, verticalCenter, right
 * ├─────────┼─────────┤  ← leftCenter, horizontalCenter (fill), centerCenter, rightCenter
 * │ data    │ data    │  ← left, verticalCenter, right
 * └─────────┴─────────┘  ← bottomLeft, bottom (fill), bottomCenter, bottomRight
 * ```
 *
 * @public
 */
export interface ITerminalTableChars {
  /** Fill character for the top border row. Default: `─` */
  top: string;
  /** Junction where a column divider meets the top border. Default: `┬` */
  topCenter: string;
  /** Top-left corner. Default: `┌` */
  topLeft: string;
  /** Top-right corner. Default: `┐` */
  topRight: string;
  /** Fill character for the bottom border row. Default: `─` */
  bottom: string;
  /** Junction where a column divider meets the bottom border. Default: `┴` */
  bottomCenter: string;
  /** Bottom-left corner. Default: `└` */
  bottomLeft: string;
  /** Bottom-right corner. Default: `┘` */
  bottomRight: string;
  /** Left border character for data rows. Default: `│` */
  left: string;
  /** Left end of the header/body separator row. Default: `├` */
  leftCenter: string;
  /** Fill character for the header/body separator row. Default: `─` */
  horizontalCenter: string;
  /** Junction where a column divider crosses the header/body separator. Default: `┼` */
  centerCenter: string;
  /** Right border character for data rows. Default: `│` */
  right: string;
  /** Right end of the header/body separator row. Default: `┤` */
  rightCenter: string;
  /** Column separator character within data rows. Default: `│` */
  verticalCenter: string;
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
   * If `true`, all border and separator lines are suppressed. Columns are visually
   * separated only by the built-in one-character left-padding of each cell.
   * This is a convenient shorthand for setting every entry in `chars` to `''`.
   */
  borderless?: boolean;

  /**
   * Overrides for individual border characters.
   * Pass an empty string for any character to suppress that part of the border.
   * Applied after `borderless`, so individual characters can be restored even in
   * borderless mode.
   */
  borderCharacters?: Partial<ITerminalTableChars>;

  /**
   * A function to apply styling to all border and grid line characters.
   *
   * @example
   * ```typescript
   * import { Colorize } from '@rushstack/terminal';
   * new TerminalTable({ borderColor: Colorize.gray })
   * ```
   */
  borderColor?: (text: string) => string;

  /**
   * A function to apply styling to the text within header row cells.
   *
   * @example
   * ```typescript
   * import { Colorize } from '@rushstack/terminal';
   * new TerminalTable({ headingColor: Colorize.bold })
   * ```
   */
  headingColor?: (text: string) => string;
}

const BORDERLESS_CHARS: ITerminalTableChars = {
  top: '',
  topCenter: '',
  topLeft: '',
  topRight: '',
  bottom: '',
  bottomCenter: '',
  bottomLeft: '',
  bottomRight: '',
  left: '',
  leftCenter: '',
  horizontalCenter: '',
  centerCenter: '',
  right: '',
  rightCenter: '',
  verticalCenter: ''
};

const DEFAULT_CHARS: ITerminalTableChars = {
  top: '─',
  topCenter: '┬',
  topLeft: '┌',
  topRight: '┐',
  bottom: '─',
  bottomCenter: '┴',
  bottomLeft: '└',
  bottomRight: '┘',
  left: '│',
  leftCenter: '├',
  horizontalCenter: '─',
  centerCenter: '┼',
  right: '│',
  rightCenter: '┤',
  verticalCenter: '│'
};

/**
 * Renders text data as a fixed-column table suitable for terminal output.
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
  private readonly _borderCharacters: ITerminalTableChars;
  private readonly _borderColor: ((text: string) => string) | undefined;
  private readonly _headingColor: ((text: string) => string) | undefined;
  private readonly _rows: string[][];

  public constructor(options: ITerminalTableOptions = {}) {
    const { head, colWidths, borderless, borderCharacters, borderColor, headingColor } = options;
    this._head = head ?? [];
    this._specifiedColWidths = colWidths ?? [];
    this._borderCharacters = {
      ...(borderless ? BORDERLESS_CHARS : DEFAULT_CHARS),
      ...borderCharacters
    };
    this._borderColor = borderColor;
    this._headingColor = headingColor;
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

  public getLines(): string[] {
    const {
      _head: head,
      _rows: rows,
      _specifiedColWidths: specifiedColWidths,
      _borderColor: borderColor,
      _headingColor: headingColor,
      _borderCharacters: {
        top: topSeparator,
        topCenter: topCenterSeparator,
        topLeft: topLeftSeparator,
        topRight: topRightSeparator,
        bottom: bottomSeparator,
        bottomCenter: bottomCenterSeparator,
        bottomLeft: bottomLeftSeparator,
        bottomRight: bottomRightSeparator,
        left: leftSeparator,
        leftCenter: leftCenterSeparator,
        horizontalCenter: horizontalCenterSeparator,
        centerCenter: centerCenterSeparator,
        right: rightSeparator,
        rightCenter: rightCenterSeparator,
        verticalCenter: verticalCenterSeparator
      }
    } = this;

    const allRows: string[][] = [head, ...rows];
    const columnCount: number = Math.max(0, ...allRows.map((r) => r.length));
    if (columnCount === 0) {
      return [];
    }

    // Resolve final column widths: use specified width if provided, otherwise auto-size from content.
    const columnWidths: number[] = [];
    for (let columnIndex: number = 0; columnIndex < columnCount; columnIndex++) {
      const specified: number | undefined = specifiedColWidths[columnIndex];
      if (specified !== undefined) {
        columnWidths.push(specified);
      } else {
        let maxContent: number = 0;
        for (const row of allRows) {
          if (columnIndex < row.length) {
            const width: number = AnsiEscape.removeCodes(row[columnIndex]).length;
            if (width > maxContent) {
              maxContent = width;
            }
          }
        }

        // +2 for one character of padding on each side
        columnWidths.push(maxContent + 2);
      }
    }

    // Builds a styled horizontal separator line; returns undefined if fillChar is empty (suppressed).
    const buildSepLine = (
      leftChar: string,
      fillChar: string,
      midChar: string,
      rightChar: string
    ): string | undefined => {
      if (fillChar.length === 0) {
        return undefined;
      }
      const line: string = leftChar + columnWidths.map((w) => fillChar.repeat(w)).join(midChar) + rightChar;
      return borderColor ? borderColor(line) : line;
    };

    // Pre-compute all separator lines (borderColor applied once per line, not per character).
    const topLine: string | undefined = buildSepLine(
      topLeftSeparator,
      topSeparator,
      topCenterSeparator,
      topRightSeparator
    );
    const centerLine: string | undefined = buildSepLine(
      leftCenterSeparator,
      horizontalCenterSeparator,
      centerCenterSeparator,
      rightCenterSeparator
    );
    const bottomLine: string | undefined = buildSepLine(
      bottomLeftSeparator,
      bottomSeparator,
      bottomCenterSeparator,
      bottomRightSeparator
    );

    // Pre-colorize vertical border chars used in data rows.
    const styledLeft: string = borderColor && leftSeparator ? borderColor(leftSeparator) : leftSeparator;
    const styledMid: string =
      borderColor && verticalCenterSeparator ? borderColor(verticalCenterSeparator) : verticalCenterSeparator;
    const styledRight: string = borderColor && rightSeparator ? borderColor(rightSeparator) : rightSeparator;

    // Renders a single data row. If contentColor is provided, it is applied to each cell's text.
    const renderRow = (row: string[], contentColor?: (text: string) => string): string => {
      const cells: string[] = [];
      for (let col: number = 0; col < columnCount; col++) {
        const content: string = col < row.length ? row[col] : '';
        const visualWidth: number = AnsiEscape.removeCodes(content).length;
        // 1 char of left-padding; right-padding fills the remainder of the column width.
        const padRight: number = Math.max(columnWidths[col] - 1 - visualWidth, 0);
        const styledContent: string = content && contentColor ? contentColor(content) : content;
        cells.push(' ' + styledContent + ' '.repeat(padRight));
      }
      return styledLeft + cells.join(styledMid) + styledRight;
    };

    const lines: string[] = [];

    if (topLine !== undefined) {
      lines.push(topLine);
    }

    if (head.length > 0) {
      lines.push(renderRow(head, headingColor));
      if (centerLine !== undefined) {
        lines.push(centerLine);
      }
    }

    for (let i: number = 0; i < this._rows.length; i++) {
      lines.push(renderRow(this._rows[i]));
      if (i < this._rows.length - 1 && centerLine !== undefined) {
        lines.push(centerLine);
      }
    }

    if (bottomLine !== undefined) {
      lines.push(bottomLine);
    }

    return lines;
  }

  /**
   * Renders the table to a string.
   */
  public toString(): string {
    const lines: string[] = this.getLines();
    return lines.join('\n');
  }

  /**
   * Writes the rendered table to the provided terminal, one line at a time.
   */
  public printToTerminal(terminal: ITerminal): void {
    for (const line of this.getLines()) {
      terminal.writeLine(line);
    }
  }
}
