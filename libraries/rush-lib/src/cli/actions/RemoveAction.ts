// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BaseAddAndRemoveAction, PACKAGE_PARAMETER_NAME } from './BaseAddAndRemoveAction.ts';
import type { RushCommandLineParser } from '../RushCommandLineParser.ts';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject.ts';
import type {
  IPackageForRushRemove,
  IPackageJsonUpdaterRushRemoveOptions
} from '../../logic/PackageJsonUpdaterTypes.ts';
import { getVariantAsync } from '../../api/Variants.ts';

const REMOVE_ACTION_NAME: 'remove' = 'remove';

export class RemoveAction extends BaseAddAndRemoveAction {
  public constructor(parser: RushCommandLineParser) {
    const documentation: string = [
      'Removes specified package(s) from the dependencies of the current project (as determined by the current working directory)' +
        ' and then runs "rush update".'
    ].join('\n');
    super({
      actionName: REMOVE_ACTION_NAME,
      summary: 'Removes one or more dependencies from the package.json and runs rush update.',
      documentation,
      safeForSimultaneousRushProcesses: false,
      parser,

      packageNameListParameterDescription:
        'The name of the package which should be removed.' +
        ` To remove multiple packages, run "rush ${REMOVE_ACTION_NAME} ${PACKAGE_PARAMETER_NAME} foo ${PACKAGE_PARAMETER_NAME} bar".`,
      allFlagDescription: 'If specified, the dependency will be removed from all projects that declare it.'
    });
  }

  public async getUpdateOptionsAsync(): Promise<IPackageJsonUpdaterRushRemoveOptions> {
    const projects: RushConfigurationProject[] = super.getProjects();

    const packagesToRemove: IPackageForRushRemove[] = [];

    for (const specifiedPackageName of this.specifiedPackageNameList) {
      if (!this.rushConfiguration.packageNameParser.isValidName(specifiedPackageName)) {
        throw new Error(`The package name "${specifiedPackageName}" is not valid.`);
      }

      for (const project of projects) {
        if (
          !project.packageJsonEditor.tryGetDependency(specifiedPackageName) &&
          !project.packageJsonEditor.tryGetDevDependency(specifiedPackageName)
        ) {
          this.terminal.writeLine(
            `The project "${project.packageName}" does not have "${specifiedPackageName}" in package.json.`
          );
        }
      }

      packagesToRemove.push({ packageName: specifiedPackageName });
    }

    const variant: string | undefined = await getVariantAsync(
      this._variantParameter,
      this.rushConfiguration,
      true
    );

    return {
      projects,
      packagesToUpdate: packagesToRemove,
      skipUpdate: this._skipUpdateFlag.value,
      debugInstall: this.parser.isDebug,
      actionName: this.actionName,
      variant
    };
  }
}
