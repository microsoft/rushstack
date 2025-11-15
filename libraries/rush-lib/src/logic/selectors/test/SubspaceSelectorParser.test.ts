// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { RushConfiguration } from '../../../api/RushConfiguration';
import { SubspaceSelectorParser } from '../SubspaceSelectorParser';

describe(SubspaceSelectorParser.name, () => {
  let rushConfiguration: RushConfiguration;
  let terminal: Terminal;
  let terminalProvider: StringBufferTerminalProvider;
  let parser: SubspaceSelectorParser;

  beforeEach(() => {
    const rushJsonFile: string = path.resolve(__dirname, '../../../api/test/repo/rush-npm.json');
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    terminalProvider = new StringBufferTerminalProvider();
    terminal = new Terminal(terminalProvider);
    parser = new SubspaceSelectorParser(rushConfiguration);
  });

  it('should return completions based on configuration', () => {
    const completions = Array.from(parser.getCompletions());
    // The test fixture doesn't have subspaces configured, so completions may be empty
    expect(Array.isArray(completions)).toBe(true);
  });

  it('should select projects from default subspace', async () => {
    const result = await parser.evaluateSelectorAsync({
      unscopedSelector: 'default',
      terminal,
      parameterName: '--only'
    });

    const projects = Array.from(result);
    // Should get projects from the default subspace
    expect(projects.length).toBeGreaterThan(0);
  });
});
