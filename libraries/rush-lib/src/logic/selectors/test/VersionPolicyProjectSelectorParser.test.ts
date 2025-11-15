// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { RushConfiguration } from '../../../api/RushConfiguration';
import { VersionPolicyProjectSelectorParser } from '../VersionPolicyProjectSelectorParser';

describe(VersionPolicyProjectSelectorParser.name, () => {
  let rushConfiguration: RushConfiguration;
  let terminal: Terminal;
  let terminalProvider: StringBufferTerminalProvider;
  let parser: VersionPolicyProjectSelectorParser;

  beforeEach(() => {
    const rushJsonFile: string = path.resolve(__dirname, '../../../api/test/repo/rush-npm.json');
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    terminalProvider = new StringBufferTerminalProvider();
    terminal = new Terminal(terminalProvider);
    parser = new VersionPolicyProjectSelectorParser(rushConfiguration);
  });

  it('should return empty completions when no version policies exist', () => {
    // The test fixture doesn't have version policies configured
    const completions = Array.from(parser.getCompletions());
    expect(completions).toHaveLength(0);
  });

  it('should throw error for non-existent version policy', async () => {
    await expect(
      parser.evaluateSelectorAsync({
        unscopedSelector: 'nonexistent-policy',
        terminal,
        parameterName: '--only'
      })
    ).rejects.toThrow();
  });
});
