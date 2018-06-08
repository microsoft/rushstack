// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as path from 'path';
import { RushCommandLineParser } from '../RushCommandLineParser';

describe('CommandLineHelp', () => {

  const oldCwd: string = process.cwd();
  const localCwd: string = path.join(__dirname, 'repo');

  try {
    process.chdir(localCwd);

    const parser: RushCommandLineParser = new RushCommandLineParser();

    it('prints the global help', () => {
      const helpText: string = colors.stripColors(parser.renderHelpText());
      expect(helpText).toMatchSnapshot();
    });

    for (const action of parser.actions) {
      it(`prints the help for "rush ${action.actionName}"`, () => {
        const helpText: string = colors.stripColors(action.renderHelpText());
        expect(helpText).toMatchSnapshot();
      });
    }

  } finally {
    process.chdir(oldCwd);
  }

  expect(true).toBeTruthy();
});
