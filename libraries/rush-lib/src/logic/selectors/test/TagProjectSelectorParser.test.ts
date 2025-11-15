// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { RushConfiguration } from '../../../api/RushConfiguration';
import { TagProjectSelectorParser } from '../TagProjectSelectorParser';

describe(TagProjectSelectorParser.name, () => {
  let rushConfiguration: RushConfiguration;
  let terminal: Terminal;
  let terminalProvider: StringBufferTerminalProvider;
  let parser: TagProjectSelectorParser;

  beforeEach(() => {
    const rushJsonFile: string = path.resolve(__dirname, '../../../api/test/repo/rush-npm.json');
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    terminalProvider = new StringBufferTerminalProvider();
    terminal = new Terminal(terminalProvider);
    parser = new TagProjectSelectorParser(rushConfiguration);
  });

  it('should provide completions for tags', () => {
    const completions = Array.from(parser.getCompletions());
    expect(completions.length).toBeGreaterThan(0);
    expect(completions).toContain('frontend');
    expect(completions).toContain('backend');
    expect(completions).toContain('ui');
  });

  it('should select projects by tag', async () => {
    const result = await parser.evaluateSelectorAsync({
      unscopedSelector: 'frontend',
      terminal,
      parameterName: '--only'
    });

    const projects = Array.from(result);
    expect(projects.length).toBe(2);
    const packageNames = projects.map((p) => p.packageName).sort();
    expect(packageNames).toEqual(['project1', 'project3']);
  });

  it('should select single project by unique tag', async () => {
    const result = await parser.evaluateSelectorAsync({
      unscopedSelector: 'backend',
      terminal,
      parameterName: '--only'
    });

    const projects = Array.from(result);
    expect(projects).toHaveLength(1);
    expect(projects[0].packageName).toBe('project2');
  });

  it('should throw error for non-existent tag', async () => {
    await expect(
      parser.evaluateSelectorAsync({
        unscopedSelector: 'nonexistent-tag',
        terminal,
        parameterName: '--only'
      })
    ).rejects.toThrow();
  });
});
