// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { NpmCheck, type INpmCheckState, type INpmCheckPackageSummary } from '@rushstack/npm-check-fork';
import { Colorize } from '@rushstack/terminal';

import type { RushConfiguration } from '../api/RushConfiguration';
import { upgradeInteractive, type IDepsToUpgradeAnswers } from '../utilities/InteractiveUpgradeUI';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';

interface IUpgradeInteractiveDeps {
  projects: RushConfigurationProject[];
  depsToUpgrade: IDepsToUpgradeAnswers;
}

export class InteractiveUpgrader {
  readonly #rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this.#rushConfiguration = rushConfiguration;
  }

  public async upgradeAsync(): Promise<IUpgradeInteractiveDeps> {
    const rushProject: RushConfigurationProject = await this.#getUserSelectedProjectForUpgradeAsync();

    const dependenciesState: INpmCheckPackageSummary[] =
      await this.#getPackageDependenciesStatusAsync(rushProject);

    const depsToUpgrade: IDepsToUpgradeAnswers =
      await this.#getUserSelectedDependenciesToUpgradeAsync(dependenciesState);
    return { projects: [rushProject], depsToUpgrade };
  }

  async #getUserSelectedDependenciesToUpgradeAsync(
    packages: INpmCheckPackageSummary[]
  ): Promise<IDepsToUpgradeAnswers> {
    return upgradeInteractive(packages);
  }

  async #getUserSelectedProjectForUpgradeAsync(): Promise<RushConfigurationProject> {
    const projects: RushConfigurationProject[] | undefined = this.#rushConfiguration.projects;

    const { default: search } = await import('@inquirer/search');

    return await search<RushConfigurationProject>({
      message: 'Select a project you would like to upgrade',
      source: (term) => {
        const choices: { name: string; short: string; value: RushConfigurationProject }[] = projects.map(
          (project) => ({
            name: Colorize.green(project.packageName),
            short: project.packageName,
            value: project
          })
        );
        if (!term) {
          return choices;
        }
        const filter: string = term.toUpperCase();
        return choices.filter((choice) => choice.short.toUpperCase().includes(filter));
      },
      pageSize: 12
    });
  }

  async #getPackageDependenciesStatusAsync(
    rushProject: RushConfigurationProject
  ): Promise<INpmCheckPackageSummary[]> {
    const { projectFolder } = rushProject;

    const currentState: INpmCheckState = await NpmCheck({
      cwd: projectFolder
    });

    return currentState.packages ?? [];
  }
}
