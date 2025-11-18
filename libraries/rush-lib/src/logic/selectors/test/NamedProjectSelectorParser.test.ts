// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { RushConfiguration } from '../../../api/RushConfiguration';
import { NamedProjectSelectorParser } from '../NamedProjectSelectorParser';

describe(NamedProjectSelectorParser.name, () => {
  let rushConfiguration: RushConfiguration;
  let terminal: Terminal;
  let terminalProvider: StringBufferTerminalProvider;
  let parser: NamedProjectSelectorParser;

  beforeEach(() => {
    const rushJsonFile: string = path.resolve(__dirname, '../../../api/test/repo/rush-npm.json');
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    terminalProvider = new StringBufferTerminalProvider();
    terminal = new Terminal(terminalProvider);
    parser = new NamedProjectSelectorParser(rushConfiguration);
  });

  it('should select a project by exact package name', async () => {
    const result = await parser.evaluateSelectorAsync({
      unscopedSelector: 'project1',
      terminal,
      parameterName: '--only'
    });

    const projects = Array.from(result);
    expect(projects).toHaveLength(1);
    expect(projects[0].packageName).toBe('project1');
  });

  it('should throw error for non-existent project', async () => {
    await expect(
      parser.evaluateSelectorAsync({
        unscopedSelector: 'nonexistent',
        terminal,
        parameterName: '--only'
      })
    ).rejects.toThrow();
  });

  it('should provide completions for all projects', () => {
    const completions = Array.from(parser.getCompletions());
    expect(completions).toContain('project1');
    expect(completions).toContain('project2');
    expect(completions).toContain('project3');
  });
});
