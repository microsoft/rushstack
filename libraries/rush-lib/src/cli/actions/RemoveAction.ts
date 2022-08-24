// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import { CommandLineFlagParameter, CommandLineStringListParameter } from '@rushstack/ts-command-line';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';

import type * as PackageJsonUpdaterType from '../../logic/PackageJsonUpdater';

export class RemoveAction extends BaseRushAction {
  private _allFlag!: CommandLineFlagParameter;
  private _skipUpdateFlag!: CommandLineFlagParameter;
  private _packageNameList!: CommandLineStringListParameter;

  public constructor(parser: RushCommandLineParser) {
    const documentation: string[] = [
      'Removes specified package(s) from the dependencies of the current project (as determined by the current working directory)' +
        ' and then runs "rush update".'
    ];
    super({
      actionName: 'remove',
      summary: 'Remove one or more dependencies from the package.json and runs rush update.',
      documentation: documentation.join(os.EOL),
      safeForSimultaneousRushProcesses: false,
      parser
    });
  }

  public onDefineParameters(): void {
    this._packageNameList = this.defineStringListParameter({
      parameterLongName: '--package',
      parameterShortName: '-p',
      required: true,
      argumentName: 'PACKAGE',
      description:
        'The name of the package which should be removed.' +
        ' To remove multiple packages, run "rush remove --package foo --package bar".'
    });
    this._skipUpdateFlag = this.defineFlagParameter({
      parameterLongName: '--skip-update',
      parameterShortName: '-s',
      description:
        'If specified, the "rush update" command will not be run after updating the package.json files.'
    });
    this._allFlag = this.defineFlagParameter({
      parameterLongName: '--all',
      description: 'If specified, the dependency will be removed from all projects that declare it.'
    });
  }

  public async runAsync(): Promise<void> {
    let projects: RushConfigurationProject[];
    if (this._allFlag.value) {
      projects = this.rushConfiguration.projects;
    } else {
      const currentProject: RushConfigurationProject | undefined =
        this.rushConfiguration.tryGetProjectForPath(process.cwd());

      if (!currentProject) {
        throw new Error(
          'The "rush remove" command must be invoked under a project' +
            ` folder that is registered in rush.json unless the ${this._allFlag.longName} is used.`
        );
      }

      projects = [currentProject];
    }

    const packageJsonUpdater: typeof PackageJsonUpdaterType = await import('../../logic/PackageJsonUpdater');

    const specifiedPackageNameList: ReadonlyArray<string> = this._packageNameList.values!;
    const packagesToRemove: PackageJsonUpdaterType.IPackageForRushRemove[] = [];

    for (const specifiedPackageName of specifiedPackageNameList) {
      /**
       * Name
       */
      const packageName: string = specifiedPackageName;

      if (!this.rushConfiguration.packageNameParser.isValidName(packageName)) {
        throw new Error(`The package name "${packageName}" is not valid.`);
      }

      for (const project of projects) {
        if (
          !project.packageJsonEditor.tryGetDependency(packageName) &&
          !project.packageJsonEditor.tryGetDevDependency(packageName) &&
          !project.packageJsonEditor.tryGetResolution(packageName)
        ) {
          throw new Error(`The project "${project.packageName}" do not have ${packageName} in package.json.`);
        }
      }

      packagesToRemove.push({ packageName });
    }

    const updater: PackageJsonUpdaterType.PackageJsonUpdater = new packageJsonUpdater.PackageJsonUpdater(
      this.rushConfiguration,
      this.rushGlobalFolder
    );

    await updater.doRushRemoveAsync({
      projects: projects,
      packagesToRemove,
      skipUpdate: this._skipUpdateFlag.value,
      debugInstall: this.parser.isDebug
    });
  }
}
