// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  CommandLineStringListParameter,
  IRequiredCommandLineStringParameter
} from '@rushstack/ts-command-line';
import path from 'path';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { HotlinkManager } from '../../utilities/HotlinkManager';
import { BaseRushAction, type IBaseRushActionOptions } from './BaseRushAction';
import { Async } from '@rushstack/node-core-library';
import { RushConstants } from '../../logic/RushConstants';

export abstract class BaseHotlinkPackageAction extends BaseRushAction {
  protected readonly _projectList: CommandLineStringListParameter;
  protected readonly _pathParameter: IRequiredCommandLineStringParameter;

  protected constructor(options: IBaseRushActionOptions) {
    super(options);

    this._pathParameter = this.defineStringParameter({
      parameterLongName: '--path',
      argumentName: 'PATH',
      required: true,
      description:
        'The path of folder of a project outside of this Rush repo, whose installation will be simulated using' +
        ' node_modules symlinks ("hotlinks").  This folder is the symlink target.'
    });

    this._projectList = this.defineStringListParameter({
      parameterLongName: '--project',
      required: false,
      argumentName: 'PROJECT',
      description:
        'A list of Rush project names that will be hotlinked to the "--path" folder. ' +
        'If not specified, the default is the project of the current working directory.'
    });
  }

  protected abstract connectPackageAsync(
    consumerPackage: RushConfigurationProject,
    linkedPackagePath: string,
    hotlinkManager: HotlinkManager
  ): Promise<void>;

  protected async getProjectsToLinkAsync(): Promise<Set<RushConfigurationProject>> {
    const projectsToLink: Set<RushConfigurationProject> = new Set();
    const projectNames: readonly string[] = this._projectList.values;

    if (projectNames.length > 0) {
      for (const projectName of projectNames) {
        const project: RushConfigurationProject | undefined =
          this.rushConfiguration.getProjectByName(projectName);
        if (!project) {
          throw new Error(`The project "${projectName}" was not found in "${RushConstants.rushPackageName}"`);
        }
        projectsToLink.add(project);
      }
    } else {
      const currentProject: RushConfigurationProject | undefined =
        this.rushConfiguration.tryGetProjectForPath(process.cwd());
      if (!currentProject) {
        throw new Error(`No Rush project was found in the current working directory`);
      }
      projectsToLink.add(currentProject);
    }

    return projectsToLink;
  }

  protected async runAsync(): Promise<void> {
    const hotlinkManager: HotlinkManager = HotlinkManager.loadFromRushConfiguration(this.rushConfiguration);
    const linkedPackagePath: string = path.resolve(process.cwd(), this._pathParameter.value);
    const projectsToLink: Set<RushConfigurationProject> = await this.getProjectsToLinkAsync();

    await Async.forEachAsync(
      projectsToLink,
      async (project) => {
        await this.connectPackageAsync(project, linkedPackagePath, hotlinkManager);
      },
      { concurrency: 5 }
    );
  }
}
