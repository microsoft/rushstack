// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AnsiEscape } from '../AnsiEscape';
import { Colorize } from '../Colorize';
import { StringBufferTerminalProvider } from '../StringBufferTerminalProvider';
import { Terminal } from '../Terminal';
import { TerminalTable } from '../TerminalTable';

function expectSnapshot(table: TerminalTable): void {
  expect(AnsiEscape.formatForTests(table.toString())).toMatchSnapshot();
}

describe(TerminalTable.name, () => {
  it('renders a table with a header and rows', () => {
    const table: TerminalTable = new TerminalTable({ head: ['Name', 'Version'] });
    table.push(['@rushstack/terminal', '1.0.0']);
    table.push(['@rushstack/heft', '2.0.0']);
    expectSnapshot(table);
  });

  it('renders a table without a header', () => {
    const table: TerminalTable = new TerminalTable();
    table.push(['foo', 'bar']);
    table.push(['baz', 'qux']);
    expectSnapshot(table);
  });

  it('auto-sizes columns to the widest content', () => {
    const table: TerminalTable = new TerminalTable({ head: ['A', 'B'] });
    table.push(['short', 'a very long value here']);
    const output: string = table.toString();
    // "a very long value here" is 22 chars; column width = 22 + 2 = 24
    const lines: string[] = output.split('\n');
    const dataRow: string = lines.find((l) => l.includes('short'))!;
    expect(dataRow).toContain('a very long value here');
    expectSnapshot(table);
  });

  it('respects fixed colWidths', () => {
    const table: TerminalTable = new TerminalTable({ colWidths: [10, 8] });
    table.push(['hi', 'there']);
    expectSnapshot(table);
  });

  it('borderless: true suppresses all borders', () => {
    const table: TerminalTable = new TerminalTable({
      borderless: true,
      colWidths: [10, 8, 6]
    });
    table.push(['alpha', 'beta', 'g']);
    table.push(['longer text', 'x', 'y']);
    expectSnapshot(table);
  });

  it('produces one line per row when borderless (for inquirer-style usage)', () => {
    const table: TerminalTable = new TerminalTable({
      borderless: true,
      colWidths: [20, 10]
    });
    table.push(['row one', 'v1']);
    table.push(['row two', 'v2']);
    table.push(['row three', 'v3']);
    const lines: string[] = table.toString().split('\n');
    expect(lines.length).toBe(3);
  });

  it('chars overrides are applied on top of borderless', () => {
    const table: TerminalTable = new TerminalTable({
      borderless: true,
      borderCharacters: { verticalCenter: ' | ' },
      colWidths: [10, 8]
    });
    table.push(['hello', 'world']);
    expect(table.toString()).toContain(' | ');
    expectSnapshot(table);
  });

  it('strips ANSI codes when calculating column widths', () => {
    const table: TerminalTable = new TerminalTable({ head: ['Package'] });
    // Simulate a colored package name — ANSI codes should not inflate the column width
    const colored: string = Colorize.yellow('my-package'); // yellow "my-package" (10 chars visible)
    table.push([colored]);
    // Column width should be 10 + 2 = 12 (not inflated by escape codes)
    const dataRow: string = table.getLines().find((l) => l.includes('my-package'))!;
    expect(dataRow).toBeDefined();
    expectSnapshot(table);
  });

  it('returns empty string for an empty table', () => {
    const table: TerminalTable = new TerminalTable();
    expect(table.toString()).toBe('');
  });

  it('renders a table with more than two columns', () => {
    const table: TerminalTable = new TerminalTable({ head: ['Name', 'Version', 'License'] });
    table.push(['@rushstack/terminal', '1.0.0', 'MIT']);
    table.push(['@rushstack/heft', '2.0.0', 'MIT']);
    expectSnapshot(table);
  });

  it('renders a single data row with no spurious trailing separator', () => {
    const table: TerminalTable = new TerminalTable();
    table.push(['only', 'row']);
    expectSnapshot(table);
  });

  it('renders a header with no data rows', () => {
    const table: TerminalTable = new TerminalTable({ head: ['Name', 'Version'] });
    expectSnapshot(table);
  });

  it('borderColor is applied to all border characters', () => {
    const table: TerminalTable = new TerminalTable({
      head: ['Name', 'Version'],
      borderColor: Colorize.cyan
    });
    table.push(['foo', '1.0.0']);
    table.push(['bar', '2.0.0']);
    expectSnapshot(table);
  });

  it('headingColor is applied to header cell text but not to borders or data rows', () => {
    const table: TerminalTable = new TerminalTable({
      head: ['Name', 'Version'],
      headingColor: Colorize.bold
    });
    table.push(['foo', '1.0.0']);
    expectSnapshot(table);
  });

  it('borderColor and headingColor can be combined', () => {
    const table: TerminalTable = new TerminalTable({
      head: ['Name', 'Version'],
      borderColor: Colorize.gray,
      headingColor: Colorize.bold
    });
    table.push(['foo', '1.0.0']);
    expectSnapshot(table);
  });

  it('setting horizontalCenter to empty suppresses row and header separators', () => {
    const table: TerminalTable = new TerminalTable({
      head: ['A', 'B'],
      borderCharacters: { horizontalCenter: '' }
    });
    table.push(['x', 'y']);
    table.push(['z', 'w']);
    expectSnapshot(table);
  });

  it('printToTerminal writes each line to the terminal', () => {
    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
    const terminal: Terminal = new Terminal(terminalProvider);
    const table: TerminalTable = new TerminalTable({ head: ['Name', 'Version'] });
    table.push(['@rushstack/terminal', '1.0.0']);
    table.printToTerminal(terminal);
    expect(terminalProvider.getAllOutputAsChunks({ asLines: true })).toMatchSnapshot();
  });
});
