// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalTable } from '../TerminalTable';

describe(TerminalTable.name, () => {
  it('renders a table with a header and rows', () => {
    const table: TerminalTable = new TerminalTable({ head: ['Name', 'Version'] });
    table.push(['@rushstack/terminal', '1.0.0']);
    table.push(['@rushstack/heft', '2.0.0']);
    expect(table.toString()).toMatchSnapshot();
  });

  it('renders a table without a header', () => {
    const table: TerminalTable = new TerminalTable();
    table.push(['foo', 'bar']);
    table.push(['baz', 'qux']);
    expect(table.toString()).toMatchSnapshot();
  });

  it('auto-sizes columns to the widest content', () => {
    const table: TerminalTable = new TerminalTable({ head: ['A', 'B'] });
    table.push(['short', 'a very long value here']);
    const output: string = table.toString();
    // "a very long value here" is 22 chars; column width = 22 + 2 = 24
    const lines: string[] = output.split('\n');
    const dataRow: string = lines.find((l) => l.includes('short'))!;
    expect(dataRow).toContain('a very long value here');
    expect(output).toMatchSnapshot();
  });

  it('respects fixed colWidths', () => {
    const table: TerminalTable = new TerminalTable({ colWidths: [10, 8] });
    table.push(['hi', 'there']);
    const row: string = table.toString();
    // Cell 0 padded to 10, cell 1 padded to 8
    expect(row).toMatchSnapshot();
  });

  it('supports empty border chars (invisible borders)', () => {
    const table: TerminalTable = new TerminalTable({
      chars: {
        top: '',
        'top-mid': '',
        'top-left': '',
        'top-right': '',
        bottom: '',
        'bottom-mid': '',
        'bottom-left': '',
        'bottom-right': '',
        left: '',
        'left-mid': '',
        mid: '',
        'mid-mid': '',
        right: '',
        'right-mid': '',
        middle: ' '
      },
      colWidths: [10, 8, 6]
    });
    table.push(['alpha', 'beta', 'g']);
    table.push(['longer text', 'x', 'y']);
    expect(table.toString()).toMatchSnapshot();
  });

  it('produces one line per row when borders are empty (for inquirer-style usage)', () => {
    const table: TerminalTable = new TerminalTable({
      chars: {
        top: '',
        'top-mid': '',
        'top-left': '',
        'top-right': '',
        bottom: '',
        'bottom-mid': '',
        'bottom-left': '',
        'bottom-right': '',
        left: '',
        'left-mid': '',
        mid: '',
        'mid-mid': '',
        right: '',
        'right-mid': '',
        middle: ' '
      },
      colWidths: [20, 10]
    });
    table.push(['row one', 'v1']);
    table.push(['row two', 'v2']);
    table.push(['row three', 'v3']);
    const lines: string[] = table.toString().split('\n');
    expect(lines.length).toBe(3);
  });

  it('strips ANSI codes when calculating column widths', () => {
    const table: TerminalTable = new TerminalTable({ head: ['Package'] });
    // Simulate a colored package name — ANSI codes should not inflate the column width
    const colored: string = '\x1b[33mmy-package\x1b[0m'; // yellow "my-package" (10 chars visible)
    table.push([colored]);
    const output: string = table.toString();
    // Column width should be 10 + 2 = 12 (not inflated by escape codes)
    const dataRow: string = output.split('\n').find((l) => l.includes('my-package'))!;
    expect(dataRow).toBeDefined();
    expect(output).toMatchSnapshot();
  });

  it('returns empty string for an empty table', () => {
    const table: TerminalTable = new TerminalTable();
    expect(table.toString()).toBe('');
  });
});
