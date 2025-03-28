// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineStringListParameter, CommandLineStringParameter } from '@rushstack/ts-command-line';
import path from 'path';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushConnect } from '../../utilities/RushConnect';
import { BaseRushAction, type IBaseRushActionOptions } from './BaseRushAction';
import { Async } from '@rushstack/node-core-library';

export abstract class BaseSymlinkPackageAction extends BaseRushAction {
  protected readonly _projectList: CommandLineStringListParameter;
  protected readonly _pathParameter: CommandLineStringParameter;

  protected constructor(options: IBaseRushActionOptions) {
    super(options);

    this._pathParameter = this.defineStringParameter({
      parameterLongName: '--path',
      argumentName: 'PATH',
      required: true,
      description:
        'The folder path of a locally built project, whose installation will be simulated using node_modules' +
        ' symlinks.  This folder will be the target of the symlinks.'
    });

    this._projectList = this.defineStringListParameter({
      parameterLongName: '--project',
      required: false,
      argumentName: 'PROJECT',
      description:
        'A list of Rush project names to connect to the external package. ' +
        'If not specified, uses the project in the current working directory.'
    });
  }

  protected abstract connectPackageAsync(
    consumerPackage: RushConfigurationProject,
    linkedPackagePath: string,
    rushConnect: RushConnect
  ): Promise<void>;

  protected async getProjectsToLinkAsync(): Promise<Set<RushConfigurationProject>> {
    const projectsToLink: Set<RushConfigurationProject> = new Set();
    const projectNames: readonly string[] = this._projectList.values;

    if (projectNames.length > 0) {
      for (const projectName of projectNames) {
        const project: RushConfigurationProject | undefined =
          this.rushConfiguration.getProjectByName(projectName);
        if (!project) {
          throw new Error(`The project "${projectName}" was not found in the "rush.json"`);
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
    const rushConnect: RushConnect = RushConnect.loadFromLinkStateFile(this.rushConfiguration);
    const linkedPackagePath: string = path.resolve(this._pathParameter.value!);
    const projectsToLink: Set<RushConfigurationProject> = await this.getProjectsToLinkAsync();

    await Async.forEachAsync(projectsToLink, async (project) => {
      await this.connectPackageAsync(project, linkedPackagePath, rushConnect);
    });
  }
}
