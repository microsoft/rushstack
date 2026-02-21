// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  CommandLineFlagParameter,
  CommandLineStringListParameter,
  CommandLineStringParameter
} from '@rushstack/ts-command-line';

import { BaseRushAction, type IBaseRushActionOptions } from './BaseRushAction.ts';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject.ts';
import type * as PackageJsonUpdaterType from '../../logic/PackageJsonUpdater.ts';
import type {
  IPackageForRushUpdate,
  IPackageJsonUpdaterRushBaseUpdateOptions
} from '../../logic/PackageJsonUpdaterTypes.ts';
import { RushConstants } from '../../logic/RushConstants.ts';
import { VARIANT_PARAMETER } from '../../api/Variants.ts';

export const PACKAGE_PARAMETER_NAME: '--package' = '--package';

export interface IBasePackageJsonUpdaterRushOptions {
  /**
   * The projects whose package.jsons should get updated
   */
  projects: RushConfigurationProject[];
  /**
   * The dependencies to be added.
   */
  packagesToHandle: IPackageForRushUpdate[];
  /**
   * If specified, "rush update" will not be run after updating the package.json file(s).
   */
  skipUpdate: boolean;
  /**
   * If specified, "rush update" will be run in debug mode.
   */
  debugInstall: boolean;
}

export interface IBaseAddAndRemoveActionOptions extends IBaseRushActionOptions {
  allFlagDescription: string;
  packageNameListParameterDescription: string;
}

/**
 * This is the common base class for AddAction and RemoveAction.
 */
export abstract class BaseAddAndRemoveAction extends BaseRushAction {
  protected readonly _skipUpdateFlag: CommandLineFlagParameter;
  protected readonly _packageNameListParameter: CommandLineStringListParameter;
  protected readonly _allFlag: CommandLineFlagParameter;
  protected readonly _variantParameter: CommandLineStringParameter;

  protected get specifiedPackageNameList(): readonly string[] {
    return this._packageNameListParameter.values;
  }

  public constructor(options: IBaseAddAndRemoveActionOptions) {
    super(options);

    const { packageNameListParameterDescription, allFlagDescription } = options;

    this._skipUpdateFlag = this.defineFlagParameter({
      parameterLongName: '--skip-update',
      parameterShortName: '-s',
      description:
        'If specified, the "rush update" command will not be run after updating the package.json files.'
    });

    this._packageNameListParameter = this.defineStringListParameter({
      parameterLongName: PACKAGE_PARAMETER_NAME,
      parameterShortName: '-p',
      required: true,
      argumentName: 'PACKAGE',
      description: packageNameListParameterDescription
    });

    this._allFlag = this.defineFlagParameter({
      parameterLongName: '--all',
      description: allFlagDescription
    });

    this._variantParameter = this.defineStringParameter(VARIANT_PARAMETER);
  }

  protected abstract getUpdateOptionsAsync(): Promise<IPackageJsonUpdaterRushBaseUpdateOptions>;

  protected getProjects(): RushConfigurationProject[] {
    if (this._allFlag.value) {
      return this.rushConfiguration.projects;
    } else {
      const currentProject: RushConfigurationProject | undefined =
        this.rushConfiguration.tryGetProjectForPath(process.cwd());

      if (!currentProject) {
        throw new Error(
          `The rush "${this.actionName}" command must be invoked under a project` +
            ` folder that is registered in ${RushConstants.rushJsonFilename} unless the ${this._allFlag.longName} is used.`
        );
      }

      return [currentProject];
    }
  }

  public async runAsync(): Promise<void> {
    const packageJsonUpdater: typeof PackageJsonUpdaterType = await import(
      /* webpackChunkName: 'PackageJsonUpdater' */ '../../logic/PackageJsonUpdater.ts'
    );
    const updater: PackageJsonUpdaterType.PackageJsonUpdater = new packageJsonUpdater.PackageJsonUpdater(
      this.terminal,
      this.rushConfiguration,
      this.rushGlobalFolder
    );

    const updateOptions: IPackageJsonUpdaterRushBaseUpdateOptions = await this.getUpdateOptionsAsync();
    await updater.doRushUpdateAsync(updateOptions);
  }
}
