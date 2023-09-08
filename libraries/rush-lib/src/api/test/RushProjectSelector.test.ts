// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../RushConfiguration';
import { RushConfigurationProject } from '../RushConfigurationProject';
import { RushProjectSelector } from '../RushProjectSelector';

function createProjectSelector(): RushProjectSelector {
  const rushJsonFile: string = `${__dirname}/repo/rush-pnpm.json`;
  const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
  const projectSelector: RushProjectSelector = new RushProjectSelector(rushConfig, {
    gitSelectorParserOptions: {
      includeExternalDependencies: true,
      enableFiltering: false
    }
  });
  return projectSelector;
}

describe(RushProjectSelector.name, () => {
  describe(RushProjectSelector.prototype.selectExpression.name, () => {
    it('treats a string as a project name', async () => {
      const projectSelector: RushProjectSelector = createProjectSelector();
      const projects: ReadonlySet<RushConfigurationProject> = await projectSelector.selectExpression(
        'project2'
      );
      expect([...projects].map((project) => project.packageName)).toEqual(['project2']);
    });

    it('selects a project using a detailed scope', async () => {
      const projectSelector: RushProjectSelector = createProjectSelector();
      const projects: ReadonlySet<RushConfigurationProject> = await projectSelector.selectExpression({
        scope: 'name',
        value: 'project2'
      });
      expect(Array.from(projects, (project) => project.packageName)).toEqual(['project2']);
    });

    it('selects several projects with a union operator', async () => {
      const projectSelector: RushProjectSelector = createProjectSelector();
      const projects: ReadonlySet<RushConfigurationProject> = await projectSelector.selectExpression({
        union: ['project1', 'project2', 'project3']
      });
      expect(Array.from(projects, (project) => project.packageName)).toEqual([
        'project1',
        'project2',
        'project3'
      ]);
    });

    it('restricts a selection with an intersect operator', async () => {
      const projectSelector: RushProjectSelector = createProjectSelector();
      const projects: ReadonlySet<RushConfigurationProject> = await projectSelector.selectExpression({
        intersect: [{ union: ['project1', 'project2', 'project3'] }, 'project2']
      });
      expect(Array.from(projects, (project) => project.packageName)).toEqual(['project2']);
    });

    it('restricts a selection with a subtract operator', async () => {
      const projectSelector: RushProjectSelector = createProjectSelector();
      const projects: ReadonlySet<RushConfigurationProject> = await projectSelector.selectExpression({
        subtract: [{ union: ['project1', 'project2', 'project3'] }, 'project2']
      });
      expect(Array.from(projects, (project) => project.packageName)).toEqual(['project1', 'project3']);
    });

    it('applies a parameter to a project', async () => {
      const projectSelector: RushProjectSelector = createProjectSelector();
      const projects: ReadonlySet<RushConfigurationProject> = await projectSelector.selectExpression({
        '--to': 'project1'
      });
      expect(Array.from(projects, (project) => project.packageName)).toEqual(['project1']);
    });
  });
});
