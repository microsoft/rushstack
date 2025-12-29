// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBufferTerminalProvider } from '../StringBufferTerminalProvider';
import { Terminal } from '../Terminal';
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

  function testWrapWordsToLines(prefix: string | number | undefined): void {
    describe(`with prefix="${prefix}"`, () => {
      it('respects spaces and newlines in a pre-formatted message', () => {
        const userMessage: string = [
          'An error occurred while pushing commits to git remote. Please make sure you have installed and enabled git lfs. The easiest way to do that is run the provided setup script:',
          '',
          '    common/scripts/setup.sh',
          ''
        ].join('\n');

        const result: string[] = PrintUtilities.wrapWordsToLines(userMessage, 50, prefix);
        expect(result).toMatchSnapshot();
      });

      it('handles a line starting with a word longer than the max line length', () => {
        const userMessage: string = [
          'Annnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn error occurred while pushing commits to git remote. Please make sure you have installed and enabled git lfs. The easiest way to do that is run the provided setup script:',
          '',
          '    common/scripts/setup.sh',
          ''
        ].join('\n');

        const result: string[] = PrintUtilities.wrapWordsToLines(userMessage, 50, prefix);
        expect(result).toMatchSnapshot();
      });

      it('handles a line containing a word longer than the max line length', () => {
        const userMessage: string = [
          'An error occurrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrred while pushing commits to git remote. Please make sure you have installed and enabled git lfs. The easiest way to do that is run the provided setup script:',
          '',
          '    common/scripts/setup.sh',
          ''
        ].join('\n');

        const result: string[] = PrintUtilities.wrapWordsToLines(userMessage, 50, prefix);
        expect(result).toMatchSnapshot();
      });

      it('handles a line starting with two words longer than the max line length', () => {
        const userMessage: string = [
          'Annnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn errrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrror occurred while pushing commits to git remote. Please make sure you have installed and enabled git lfs. The easiest way to do that is run the provided setup script:',
          '',
          '    common/scripts/setup.sh',
          ''
        ].join('\n');

        const result: string[] = PrintUtilities.wrapWordsToLines(userMessage, 50, prefix);
        expect(result).toMatchSnapshot();
      });

      it('handles a line with only a word longer than the max line length', () => {
        const userMessage: string = ['Annnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn'].join('\n');

        const result: string[] = PrintUtilities.wrapWordsToLines(userMessage, 50, prefix);
        expect(result).toMatchSnapshot();
      });

      it('applies pre-existing indents on both margins', () => {
        const message: string = [
          'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Maecenas porttitor congue massa.',
          '',
          '    Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Maecenas porttitor congue massa.',
          '',
          'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Maecenas porttitor congue massa.'
        ].join('\n');

        const result: string[] = PrintUtilities.wrapWordsToLines(message, 50, prefix);
        expect(result).toMatchSnapshot();
      });
    });
  }

  describe(PrintUtilities.wrapWordsToLines.name, () => {
    testWrapWordsToLines(undefined);
    testWrapWordsToLines(4);
    testWrapWordsToLines('| ');
  });

  describe(PrintUtilities.printMessageInBox.name, () => {
    function validateOutput(expectedWidth: number): void {
      const outputLines: string[] = terminalProvider
        .getOutput({ normalizeSpecialCharacters: false })
        .split('\n');
      expect(outputLines).toMatchSnapshot();

      expect(outputLines.every((x) => x.length <= expectedWidth));
    }

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

    it('Handles a case where there is a word longer than the boxwidth', () => {
      const userMessage: string = [
        'Annnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn error occurred while pushing commits to git remote. Please make sure you have installed and enabled git lfs. The easiest way to do that is run the provided setup script:',
        '',
        '    common/scripts/setup.sh',
        ''
      ].join('\n');

      PrintUtilities.printMessageInBox(userMessage, terminal, 50);
      validateOutput(50);
    });

    it('word-wraps a message with a trailing fragment', () => {
      const lines: string[] = PrintUtilities.wrapWordsToLines(
        'This Thursday, we will complete the Node.js version upgrade.  Any pipelines that still have not upgraded will be temporarily disabled.',
        36
      );
      expect(lines).toMatchInlineSnapshot(`
Array [
  "This Thursday, we will complete the",
  "Node.js version upgrade.  Any",
  "pipelines that still have not",
  "upgraded will be temporarily",
  "disabled.",
]
`);

      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(36);
      }
    });
  });
});
