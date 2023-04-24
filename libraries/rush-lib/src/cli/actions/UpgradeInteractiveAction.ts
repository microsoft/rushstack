// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineFlagParameter } from '@rushstack/ts-command-line';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';

import type * as PackageJsonUpdaterType from '../../logic/PackageJsonUpdater';
import type * as InteractiveUpgraderType from '../../logic/InteractiveUpgrader';

export class UpgradeInteractiveAction extends BaseRushAction {
  private _makeConsistentFlag: CommandLineFlagParameter;
  private _skipUpdateFlag: CommandLineFlagParameter;

  public constructor(parser: RushCommandLineParser) {
    const documentation: string[] = [
      'Provide an interactive way to upgrade your dependencies. Running the command will open an interactive prompt' +
        ' that will ask you which projects and which dependencies you would like to upgrade.' +
        ' It will then update your package.json files, and run "rush update" for you.' +
        ' If you are using ensureConsistentVersions policy, upgrade-interactive will update all packages which use the' +
        ' dependencies that you are upgrading and match their SemVer range if provided. If ensureConsistentVersions' +
        ' is not enabled, upgrade-interactive will only update the dependency in the package you specify.' +
        ' This can be overriden by using the --make-consistent flag.'
    ];
    super({
      actionName: 'upgrade-interactive',
      summary: 'Provides interactive prompt for upgrading package dependencies per project',
      safeForSimultaneousRushProcesses: false,
      documentation: documentation.join(''),
      parser
    });

    this._makeConsistentFlag = this.defineFlagParameter({
      parameterLongName: '--make-consistent',
      description:
        'When upgrading dependencies from a single project, also upgrade dependencies from other projects.'
    });

    this._skipUpdateFlag = this.defineFlagParameter({
      parameterLongName: '--skip-update',
      parameterShortName: '-s',
      description:
        'If specified, the "rush update" command will not be run after updating the package.json files.'
    });
  }

  public async runAsync(): Promise<void> {
    const [{ PackageJsonUpdater }, { InteractiveUpgrader }] = await Promise.all([
      import(/* webpackChunkName: 'PackageJsonUpdater' */ '../../logic/PackageJsonUpdater'),
      import(/* webpackChunkName: 'InteractiveUpgrader' */ '../../logic/InteractiveUpgrader')
    ]);

    const packageJsonUpdater: PackageJsonUpdaterType.PackageJsonUpdater = new PackageJsonUpdater(
      this.rushConfiguration,
      this.rushGlobalFolder
    );
    const interactiveUpgrader: InteractiveUpgraderType.InteractiveUpgrader = new InteractiveUpgrader(
      this.rushConfiguration
    );

    const shouldMakeConsistent: boolean =
      this.rushConfiguration.ensureConsistentVersions || this._makeConsistentFlag.value;

    const { projects, depsToUpgrade } = await interactiveUpgrader.upgrade();

    await packageJsonUpdater.doRushUpgradeAsync({
      projects: projects,
      packagesToAdd: depsToUpgrade.packages,
      updateOtherPackages: shouldMakeConsistent,
      skipUpdate: this._skipUpdateFlag.value,
      debugInstall: this.parser.isDebug
    });
  }
}
