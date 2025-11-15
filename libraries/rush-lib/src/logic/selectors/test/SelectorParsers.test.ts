// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { RushConfiguration } from '../../../api/RushConfiguration';
import { NamedProjectSelectorParser } from '../NamedProjectSelectorParser';
import { TagProjectSelectorParser } from '../TagProjectSelectorParser';
import { PathProjectSelectorParser } from '../PathProjectSelectorParser';

describe('SelectorParsers', () => {
  let rushConfiguration: RushConfiguration;
  let terminal: Terminal;
  let terminalProvider: StringBufferTerminalProvider;

  beforeEach(() => {
    const rushJsonFile: string = path.resolve(__dirname, '../../../api/test/repo/rush-npm.json');
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    terminalProvider = new StringBufferTerminalProvider();
    terminal = new Terminal(terminalProvider);
  });

  describe(NamedProjectSelectorParser.name, () => {
    let parser: NamedProjectSelectorParser;

    beforeEach(() => {
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

  describe(TagProjectSelectorParser.name, () => {
    let parser: TagProjectSelectorParser;

    beforeEach(() => {
      parser = new TagProjectSelectorParser(rushConfiguration);
    });

    it('should return empty array for projects without tags', () => {
      // The test fixture doesn't have tags configured, so this should return empty
      const completions = Array.from(parser.getCompletions());
      expect(completions).toHaveLength(0);
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

  describe(PathProjectSelectorParser.name, () => {
    let parser: PathProjectSelectorParser;
    const originalCwd = process.cwd();

    beforeEach(() => {
      parser = new PathProjectSelectorParser(rushConfiguration);
      // Set cwd to the test repo root for consistent path resolution
      process.chdir(rushConfiguration.rushJsonFolder);
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it('should select a project by exact path', async () => {
      const result = await parser.evaluateSelectorAsync({
        unscopedSelector: 'project1',
        terminal,
        parameterName: '--only'
      });

      const projects = Array.from(result);
      expect(projects).toHaveLength(1);
      expect(projects[0].packageName).toBe('project1');
    });

    it('should select a project by path within the project', async () => {
      const result = await parser.evaluateSelectorAsync({
        unscopedSelector: 'project1/src/index.ts',
        terminal,
        parameterName: '--only'
      });

      const projects = Array.from(result);
      expect(projects).toHaveLength(1);
      expect(projects[0].packageName).toBe('project1');
    });

    it('should select multiple projects from a parent directory', async () => {
      const result = await parser.evaluateSelectorAsync({
        unscopedSelector: '.',
        terminal,
        parameterName: '--only'
      });

      const projects = Array.from(result);
      expect(projects.length).toBeGreaterThan(0);
      // Should include all projects in the test repo
      const packageNames = projects.map((p) => p.packageName).sort();
      expect(packageNames).toContain('project1');
      expect(packageNames).toContain('project2');
      expect(packageNames).toContain('project3');
    });

    it('should select project from current directory when using dot', async () => {
      // Change to project1 directory
      process.chdir(path.join(rushConfiguration.rushJsonFolder, 'project1'));

      const result = await parser.evaluateSelectorAsync({
        unscopedSelector: '.',
        terminal,
        parameterName: '--only'
      });

      const projects = Array.from(result);
      expect(projects).toHaveLength(1);
      expect(projects[0].packageName).toBe('project1');
    });

    it('should handle absolute paths', async () => {
      const absolutePath = path.join(rushConfiguration.rushJsonFolder, 'project2');

      const result = await parser.evaluateSelectorAsync({
        unscopedSelector: absolutePath,
        terminal,
        parameterName: '--only'
      });

      const projects = Array.from(result);
      expect(projects).toHaveLength(1);
      expect(projects[0].packageName).toBe('project2');
    });

    it('should throw error for paths that do not match any project', async () => {
      await expect(
        parser.evaluateSelectorAsync({
          unscopedSelector: 'nonexistent/path',
          terminal,
          parameterName: '--only'
        })
      ).rejects.toThrow();
    });

    it('should handle paths outside workspace', async () => {
      // Paths outside the workspace should not match any project and throw
      await expect(
        parser.evaluateSelectorAsync({
          unscopedSelector: '../outside',
          terminal,
          parameterName: '--only'
        })
      ).rejects.toThrow();
    });

    it('should return empty completions', () => {
      const completions = Array.from(parser.getCompletions());
      expect(completions).toHaveLength(0);
    });
  });
});
