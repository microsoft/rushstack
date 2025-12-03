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

  it('should return completions for version policies', () => {
    const completions = Array.from(parser.getCompletions());
    expect(completions.length).toBeGreaterThan(0);
    expect(completions).toContain('testPolicy');
  });

  it('should select projects by version policy', async () => {
    const result = await parser.evaluateSelectorAsync({
      unscopedSelector: 'testPolicy',
      terminal,
      parameterName: '--only'
    });

    const projects = Array.from(result);
    expect(projects).toHaveLength(2);
    const packageNames = projects.map((p) => p.packageName).sort();
    expect(packageNames).toEqual(['project1', 'project3']);
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
