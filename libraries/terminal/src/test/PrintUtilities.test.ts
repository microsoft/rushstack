// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBufferTerminalProvider, Terminal } from '@rushstack/node-core-library';

import { PrintUtilities } from '../PrintUtilities';

describe(PrintUtilities.name, () => {
  describe(PrintUtilities.printMessageInBox.name, () => {
    const MESSAGE: string =
      'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Maecenas porttitor congue massa. Fusce posuere, magna sed pulvinar ultricies, purus lectus malesuada libero, sit amet commodo magna eros quis urna.';

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

    it('Correctly prints a narrow box', () => {
      PrintUtilities.printMessageInBox(MESSAGE, terminal, 20);
      validateOutput(20);
    });

    it('Correctly prints a wide box', () => {
      PrintUtilities.printMessageInBox(MESSAGE, terminal, 300);
      validateOutput(300);
    });

    it('Correctly gets the console width', () => {
      jest.spyOn(PrintUtilities, 'getConsoleWidth').mockReturnValue(65);

      PrintUtilities.printMessageInBox(MESSAGE, terminal);
      validateOutput(32);
    });
  });
});
