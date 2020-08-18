// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colors } from '@rushstack/node-core-library';

import { HeftToolsCommandLineParser } from '../HeftToolsCommandLineParser';

describe('CommandLineHelp', () => {
  let parser: HeftToolsCommandLineParser;

  beforeEach(() => {
    parser = new HeftToolsCommandLineParser();
  });

  it('prints the global help', () => {
    const helpText: string = Colors.normalizeColorTokensForTest(parser.renderHelpText());
    expect(helpText).toMatchSnapshot();
  });

  it(`prints the help for each action`, () => {
    for (const action of parser.actions) {
      const helpText: string = Colors.normalizeColorTokensForTest(action.renderHelpText());
      expect(helpText).toMatchSnapshot(action.actionName);
    }
  });
});
