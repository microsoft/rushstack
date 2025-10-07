// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import Prompt from 'inquirer/lib/ui/prompt';

import { Colorize } from '@rushstack/terminal';

import type { RushConfiguration } from '../api/RushConfiguration';
import { upgradeInteractive, type IDepsToUpgradeAnswers } from '../utilities/InteractiveUpgradeUI';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import { SearchListPrompt } from '../utilities/prompts/SearchListPrompt';
import InteractiveUpgraderPackages from '../utilities/InteractiveUpgraderPackages/InteractiveUpgraderPackages';
import type { IPackageInfo } from '../utilities/InteractiveUpgraderPackages/interfaces/IPackageInfo';

interface IUpgradeInteractiveDeps {
  projects: RushConfigurationProject[];
  depsToUpgrade: IDepsToUpgradeAnswers;
}

export class InteractiveUpgrader {
  private readonly _rushConfiguration: RushConfiguration;
  private _interactiveUpgraderGetPackages: InteractiveUpgraderPackages;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    this._interactiveUpgraderGetPackages = new InteractiveUpgraderPackages();
  }

  public async upgradeAsync(): Promise<IUpgradeInteractiveDeps> {
    const rushProject: RushConfigurationProject = await this._getUserSelectedProjectForUpgradeAsync();

    const dependenciesState: IPackageInfo[] = await this._getPackageDependenciesStatusAsync(rushProject);

    const depsToUpgrade: IDepsToUpgradeAnswers =
      await this._getUserSelectedDependenciesToUpgradeAsync(dependenciesState);
    return { projects: [rushProject], depsToUpgrade };
  }

  private async _getUserSelectedDependenciesToUpgradeAsync(
    packages: IPackageInfo[]
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
  ): Promise<IPackageInfo[]> {
    const { projectFolder } = rushProject;

    const packages: IPackageInfo[] =
      await this._interactiveUpgraderGetPackages.getPackagesAsync(projectFolder);

    return packages ?? [];
  }
}
