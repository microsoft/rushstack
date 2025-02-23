// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineStringListParameter, CommandLineStringParameter } from '@rushstack/ts-command-line';
import path from 'path';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushConnect } from '../../utilities/RushConnect';
import { BaseRushAction, type IBaseRushActionOptions } from './BaseRushAction';
import { Async } from '@rushstack/node-core-library';

export abstract class BaseConnectPackageAction extends BaseRushAction {
  protected readonly _projectList: CommandLineStringListParameter;
  protected readonly _pathParameter: CommandLineStringParameter;

  protected constructor(options: IBaseRushActionOptions) {
    super(options);

    this._pathParameter = this.defineStringParameter({
      parameterLongName: '--path',
      argumentName: 'PATH',
      required: true,
      description: 'The filesystem path to the external package to be connected'
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

  protected async runAsync(): Promise<void> {
    const rushConnect = RushConnect.loadFromLinkStateFileAsync(this.rushConfiguration);

    const linkedPackagePath: string = path.resolve(this._pathParameter.value!);
    const consumerPackage: readonly string[] = this._projectList.values;

    const projectsToLink: Set<RushConfigurationProject> = new Set();
    if (consumerPackage.length > 0) {
      for (const projectName of consumerPackage) {
        const sourceProject: RushConfigurationProject | undefined =
          this.rushConfiguration.getProjectByName(projectName);
        if (!sourceProject) {
          throw new Error(`The project "${projectName}" was not found in the "rush.json"`);
        }
        projectsToLink.add(sourceProject);
      }
    } else {
      const currentPackage: RushConfigurationProject | undefined =
        this.rushConfiguration.tryGetProjectForPath(process.cwd());
      if (!currentPackage) {
        throw new Error(`No Rush project was found in the current working directory`);
      }
      projectsToLink.add(currentPackage);
    }

    await Async.forEachAsync(projectsToLink, async (projectToLink: RushConfigurationProject) => {
      await this.connectPackageAsync(projectToLink, linkedPackagePath, rushConnect);
    });
  }
}
