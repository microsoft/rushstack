// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AnsiEscape } from '@rushstack/terminal';

import { RushCommandLineParser } from '../RushCommandLineParser';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';

describe('CommandLineHelp', () => {
  let oldCwd: string | undefined;

  let parser: RushCommandLineParser;

  beforeEach(() => {
    // ts-command-line calls process.exit() which interferes with Jest
    jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Test code called process.exit(${code})`);
    });

    oldCwd = process.cwd();
    const localCwd: string = `${__dirname}/repo`;

    process.chdir(localCwd);

    // This call may terminate the entire test run because it invokes process.exit()
    // if it encounters errors.
    // TODO Remove the calls to process.exit() or override them for testing.
    parser = new RushCommandLineParser();
    // eslint-disable-next-line no-console
    parser.executeAsync().catch(console.error);
  });

  afterEach(() => {
    if (oldCwd) {
      process.chdir(oldCwd);
    }

    EnvironmentConfiguration.reset();
  });

  it('prints the global help', () => {
    const helpText: string = AnsiEscape.formatForTests(parser.renderHelpText());
    expect(helpText).toMatchSnapshot();
  });

  it(`prints the help for each action`, () => {
    for (const action of parser.actions) {
      const helpText: string = AnsiEscape.formatForTests(action.renderHelpText());
      expect(helpText).toMatchSnapshot(action.actionName);
    }
  });
});
