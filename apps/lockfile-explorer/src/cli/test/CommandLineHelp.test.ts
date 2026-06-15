// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AnsiEscape, Terminal, StringBufferTerminalProvider } from '@rushstack/terminal';
import type { CommandLineParser } from '@rushstack/ts-command-line';

import { ExplorerCommandLineParser } from '../explorer/ExplorerCommandLineParser';
import { LintCommandLineParser } from '../lint/LintCommandLineParser';

describe('CommandLineHelp', () => {
  let terminal: Terminal;
  let terminalProvider: StringBufferTerminalProvider;

  beforeEach(() => {
    terminalProvider = new StringBufferTerminalProvider();
    terminal = new Terminal(terminalProvider);

    // ts-command-line calls process.exit() which interferes with Jest
    jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Test code called process.exit(${code})`);
    });
  });

  afterEach(() => {
    expect(terminalProvider.getAllOutputAsChunks({ asLines: true })).toMatchSnapshot('terminal output');
  });

  describe.each([
    {
      name: 'ExplorerCommandLineParser',
      createParser: () => new ExplorerCommandLineParser(terminal)
    },
    {
      name: 'LintCommandLineParser',
      createParser: () => new LintCommandLineParser(terminal)
    }
  ])('$name', ({ createParser }) => {
    it(`prints the help`, async () => {
      const parser: CommandLineParser = createParser();

      const globalHelpText: string = AnsiEscape.formatForTests(parser.renderHelpText());
      expect(globalHelpText).toMatchSnapshot('global help');

      for (const action of parser.actions) {
        const actionHelpText: string = AnsiEscape.formatForTests(action.renderHelpText());
        expect(actionHelpText).toMatchSnapshot(action.actionName);
      }
    });
  });
});
