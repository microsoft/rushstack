// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';
import type {
  CommandLineFlagParameter,
  CommandLineStringListParameter,
  CommandLineStringParameter
} from '@rushstack/ts-command-line';

import { BaseAddAndRemoveAction } from './BaseAddAndRemoveAction';
import type { RushCommandLineParser } from '../RushCommandLineParser';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type {
  IPackageForRushRemove,
  IPackageJsonUpdaterRushRemoveOptions
} from '../../logic/PackageJsonUpdaterTypes';
import { getVariantAsync, VARIANT_PARAMETER } from '../../api/Variants';

export class RemoveAction extends BaseAddAndRemoveAction {
  protected readonly _allFlag: CommandLineFlagParameter;
  protected readonly _packageNameList: CommandLineStringListParameter;
  private readonly _variantParameter: CommandLineStringParameter;
  private readonly _terminal: ITerminal;

  public constructor(parser: RushCommandLineParser) {
    const documentation: string = [
      'Removes specified package(s) from the dependencies of the current project (as determined by the current working directory)' +
        ' and then runs "rush update".'
    ].join('\n');
    super({
      actionName: 'remove',
      summary: 'Removes one or more dependencies from the package.json and runs rush update.',
      documentation,
      safeForSimultaneousRushProcesses: false,
      parser
    });

    this._terminal = parser.terminal;

    this._packageNameList = this.defineStringListParameter({
      parameterLongName: '--package',
      parameterShortName: '-p',
      required: true,
      argumentName: 'PACKAGE',
      description:
        'The name of the package which should be removed.' +
        ' To remove multiple packages, run "rush remove --package foo --package bar".'
    });
    this._allFlag = this.defineFlagParameter({
      parameterLongName: '--all',
      description: 'If specified, the dependency will be removed from all projects that declare it.'
    });
    this._variantParameter = this.defineStringParameter(VARIANT_PARAMETER);
  }

  public async getUpdateOptionsAsync(): Promise<IPackageJsonUpdaterRushRemoveOptions> {
    const projects: RushConfigurationProject[] = super.getProjects();

    const packagesToRemove: IPackageForRushRemove[] = [];

    for (const specifiedPackageName of this.specifiedPackageNameList) {
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
          !project.packageJsonEditor.tryGetDevDependency(packageName)
        ) {
          this._terminal.writeLine(
            `The project "${project.packageName}" does not have "${packageName}" in package.json.`
          );
        }
      }

      packagesToRemove.push({ packageName });
    }

    const variant: string | undefined = await getVariantAsync(
      this._variantParameter,
      this.rushConfiguration,
      true
    );

    return {
      projects: projects,
      packagesToUpdate: packagesToRemove,
      skipUpdate: this._skipUpdateFlag.value,
      debugInstall: this.parser.isDebug,
      actionName: this.actionName,
      variant
    };
  }
}
