// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBufferTerminalProvider, Terminal } from '@rushstack/node-core-library';

import { PrintUtilities } from '../PrintUtilities';

describe(PrintUtilities.name, () => {
  let terminalProvider: StringBufferTerminalProvider;
  let terminal: Terminal;

  beforeEach(() => {
    terminalProvider = new StringBufferTerminalProvider(false);
    terminal = new Terminal(terminalProvider);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  function validateOutput(expectedWidth: number): void {
    const outputLines: string[] = terminalProvider
      .getOutput({ normalizeSpecialCharacters: true })
      .split('[n]');
    expect(outputLines).toMatchSnapshot();

    expect(outputLines[0].trim().length).toEqual(expectedWidth);
  }

  describe(PrintUtilities.wrapWords.name, () => {
    it('respects spaces and newlines in a pre-formatted message', () => {
      const userMessage: string = [
        'An error occurred while pushing commits to git remote. Please make sure you have installed and enabled git lfs. The easiest way to do that is run the provided setup script:',
        '',
        '    common/scripts/setup.sh',
        ''
      ].join('\n');

      const result: string = PrintUtilities.wrapWords(userMessage, 50, 4);
      expect(result.split(/\n/)).toMatchSnapshot();
    });

    it('applies pre-existing indents on both margins', () => {
      const message: string = [
        'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Maecenas porttitor congue massa.',
        '',
        '    Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Maecenas porttitor congue massa.',
        '',
        'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Maecenas porttitor congue massa.'
      ].join('\n');

      const result: string = PrintUtilities.wrapWords(message, 50);
      expect(result.split(/\n/)).toMatchSnapshot();
    });
  });

  describe(PrintUtilities.printMessageInBox.name, () => {
    const MESSAGE: string =
      'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Maecenas porttitor congue massa. Fusce posuere, magna sed pulvinar ultricies, purus lectus malesuada libero, sit amet commodo magna eros quis urna.';

    it('prints a long message wrapped in narrow box', () => {
      PrintUtilities.printMessageInBox(MESSAGE, terminal, 20);
      validateOutput(20);
    });

    it('prints a long message wrapped in a wide box', () => {
      PrintUtilities.printMessageInBox(MESSAGE, terminal, 300);
      validateOutput(300);
    });

    it('prints a long message wrapped in a box using the console width', () => {
      jest.spyOn(PrintUtilities, 'getConsoleWidth').mockReturnValue(65);

      PrintUtilities.printMessageInBox(MESSAGE, terminal);
      validateOutput(32);
    });

    it('respects spaces and newlines in a pre-formatted message', () => {
      const userMessage: string = [
        'An error occurred while pushing commits to git remote. Please make sure you have installed and enabled git lfs. The easiest way to do that is run the provided setup script:',
        '',
        '    common/scripts/setup.sh',
        ''
      ].join('\n');

      PrintUtilities.printMessageInBox(userMessage, terminal, 50);
      validateOutput(50);
    });
  });
});
