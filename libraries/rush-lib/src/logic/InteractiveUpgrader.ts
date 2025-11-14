// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import Prompt from 'inquirer/lib/ui/prompt';

import { NpmCheck, type INpmCheckState, type INpmCheckPackageSummary } from '@rushstack/npm-check-fork';
import { Colorize } from '@rushstack/terminal';

import type { RushConfiguration } from '../api/RushConfiguration';
import { upgradeInteractive, type IDepsToUpgradeAnswers } from '../utilities/InteractiveUpgradeUI';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import { SearchListPrompt } from '../utilities/prompts/SearchListPrompt';

interface IUpgradeInteractiveDeps {
  projects: RushConfigurationProject[];
  depsToUpgrade: IDepsToUpgradeAnswers;
}

export class InteractiveUpgrader {
  private readonly _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public async upgradeAsync(): Promise<IUpgradeInteractiveDeps> {
    const rushProject: RushConfigurationProject = await this._getUserSelectedProjectForUpgradeAsync();

    const dependenciesState: INpmCheckPackageSummary[] =
      await this._getPackageDependenciesStatusAsync(rushProject);

    const depsToUpgrade: IDepsToUpgradeAnswers =
      await this._getUserSelectedDependenciesToUpgradeAsync(dependenciesState);
    return { projects: [rushProject], depsToUpgrade };
  }

  private async _getUserSelectedDependenciesToUpgradeAsync(
    packages: INpmCheckPackageSummary[]
  ): Promise<IDepsToUpgradeAnswers> {
    return upgradeInteractive(packages);
  }

  private async _getUserSelectedProjectForUpgradeAsync(): Promise<RushConfigurationProject> {
    const projects: RushConfigurationProject[] | undefined = this._rushConfiguration.projects;
    const ui: Prompt = new Prompt({
      list: SearchListPrompt
    });

    const { selectProject } = await ui.run([
      {
        name: 'selectProject',
        message: 'Select a project you would like to upgrade',
        type: 'list',
        choices: projects.map((project) => {
          return {
            name: Colorize.green(project.packageName),
            value: project
          };
        }),
        pageSize: 12
      }
    ]);

    return selectProject;
  }

  private async _getPackageDependenciesStatusAsync(
    rushProject: RushConfigurationProject
  ): Promise<INpmCheckPackageSummary[]> {
    const { projectFolder } = rushProject;

    const currentState: INpmCheckState = await NpmCheck({
      cwd: projectFolder
    });

    return currentState.packages ?? [];
  }
}
