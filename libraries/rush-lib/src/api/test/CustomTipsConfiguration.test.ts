// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile } from '@rushstack/node-core-library';
import {
  type IOutputChunk,
  PrintUtilities,
  StringBufferTerminalProvider,
  Terminal
} from '@rushstack/terminal';

import { CustomTipId, CustomTipsConfiguration, type ICustomTipsJson } from '../CustomTipsConfiguration';
import { RushConfiguration } from '../RushConfiguration';

const LOREM: string =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

describe(CustomTipsConfiguration.name, () => {
  it('loads the config file (custom-tips.json)', () => {
    const rushFilename: string = `${__dirname}/repo/rush-npm.json`;
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
    expect(rushConfiguration.customTipsConfiguration.providedCustomTipsByTipId).toMatchSnapshot();
  });

  it('reports an error for duplicate tips', () => {
    expect(() => {
      new CustomTipsConfiguration(`${__dirname}/jsonFiles/custom-tips.error.json`);
    }).toThrowError('TIP_RUSH_INCONSISTENT_VERSIONS');
  });

  function runFormattingTests(testName: string, customTipText: string): void {
    describe(`formatting (${testName})`, () => {
      let customTipsConfiguration: CustomTipsConfiguration;
      let terminalProvider: StringBufferTerminalProvider;
      let terminal: Terminal;

      const CUSTOM_TIP_FOR_TESTING: CustomTipId = CustomTipId.TIP_PNPM_INVALID_NODE_VERSION;

      beforeEach(() => {
        terminalProvider = new StringBufferTerminalProvider(true);
        terminal = new Terminal(terminalProvider);

        const mockCustomTipsJson: ICustomTipsJson = {
          customTips: [
            {
              tipId: CUSTOM_TIP_FOR_TESTING,
              message: customTipText
            }
          ]
        };
        jest.spyOn(JsonFile, 'loadAndValidate').mockReturnValue(mockCustomTipsJson);
        customTipsConfiguration = new CustomTipsConfiguration('');

        jest.spyOn(PrintUtilities, 'getConsoleWidth').mockReturnValue(60);
      });

      afterEach(() => {
        jest.restoreAllMocks();

        const terminalProviderOutput: IOutputChunk[] = terminalProvider.getAllOutputAsChunks();
        const lineSplitTerminalProviderOutput: string[] = [];
        for (const { text, severity } of terminalProviderOutput) {
          const lines: string[] = text.split('[n]');
          for (const line of lines) {
            lineSplitTerminalProviderOutput.push(`[${severity}] ${line}`);
          }
        }

        expect(lineSplitTerminalProviderOutput).toMatchSnapshot();
      });

      const printFunctions = [
        CustomTipsConfiguration.prototype._showTip,
        CustomTipsConfiguration.prototype._showInfoTip,
        CustomTipsConfiguration.prototype._showWarningTip,
        CustomTipsConfiguration.prototype._showErrorTip
      ];

      for (const printFunction of printFunctions) {
        it(`${printFunction.name} prints an expected message`, () => {
          printFunction.call(customTipsConfiguration, terminal, CUSTOM_TIP_FOR_TESTING);
        });
      }
    });
  }

  runFormattingTests('a short message', 'This is a test');
  runFormattingTests('a long message', LOREM);
  runFormattingTests('a message with newlines', 'This is a test\nThis is a test');
  runFormattingTests('a message with an indented line', 'This is a test\n  This is a test');
  runFormattingTests('a long message with an indented line', `${LOREM}\n  ${LOREM}`);
});
