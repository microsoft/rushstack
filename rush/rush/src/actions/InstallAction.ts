// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';

import { CommandLineAction, CommandLineFlagParameter } from '@microsoft/ts-command-line';
import {
  RushConfiguration,
  Stopwatch,
  IPackageJson
} from '@microsoft/rush-lib';

import RushCommandLineParser from './RushCommandLineParser';
import GitPolicy from '../utilities/GitPolicy';
import InstallManager from '../utilities/InstallManager';
import LinkAction from './LinkAction';
import ShrinkwrapFile from '../utilities/ShrinkwrapFile';

interface ITempModuleInformation {
  packageJson: IPackageJson;
  existsInProjectConfiguration: boolean;
  filename: string;
}

export default class InstallAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _rushConfiguration: RushConfiguration;
  private _cleanInstall: CommandLineFlagParameter;
  private _cleanInstallFull: CommandLineFlagParameter;
  private _bypassPolicy: CommandLineFlagParameter;
  private _noLinkParameter: CommandLineFlagParameter;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'install',
      summary: 'Install NPM packages as specified by the configuration files in the Rush "common" folder',
      documentation: 'Use this command after pulling new changes from git into your working folder.'
      + ' It will download and install the appropriate NPM packages needed to build your projects.'
      + ' The complete sequence is as follows:  1. If not already installed, install the'
      + ' version of the NPM tool that is specified in the rush.json configuration file.  2. Create the'
      + ' common/npm-local symlink, which points to the folder from #1.  3. If necessary, run'
      + ' "npm prune" in the Rush common folder.  4. If necessary, run "npm install" in the'
      + ' Rush common folder.'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    this._cleanInstall = this.defineFlagParameter({
      parameterLongName: '--clean',
      parameterShortName: '-c',
      description: 'Delete any previously installed files before installing;'
      + ' this takes longer but will resolve data corruption that is often'
      + ' encountered with the NPM tool'
    });
    this._cleanInstallFull = this.defineFlagParameter({
      parameterLongName: '--full-clean',
      parameterShortName: '-C',
      description: 'Like "--clean", but also deletes and reinstalls the NPM tool itself'
    });
    this._bypassPolicy = this.defineFlagParameter({
      parameterLongName: '--bypass-policy',
      description: 'Overrides "gitPolicy" enforcement (use honorably!)'
    });
    this._noLinkParameter = this.defineFlagParameter({
      parameterLongName: '--no-link',
      description: 'Do not automatically run the "rush link" action after "rush install"'
    });
  }

  protected onExecute(): void {
    this._rushConfiguration = RushConfiguration.loadFromDefaultLocation();

    if (!this._bypassPolicy.value) {
      if (!GitPolicy.check(this._rushConfiguration)) {
        process.exit(1);
        return;
      }
    }

    const stopwatch: Stopwatch = Stopwatch.start();

    console.log('Starting "rush install"' + os.EOL);

    const installManager: InstallManager = new InstallManager(this._rushConfiguration);

    installManager.ensureLocalNpmTool(this._cleanInstallFull.value);

    const shrinkwrapFile: ShrinkwrapFile | undefined
      = ShrinkwrapFile.loadFromFile(this._rushConfiguration.shrinkwrapFilename);

    if (!shrinkwrapFile) {
      console.log('');
      console.log(colors.red('Unable to proceed:  The NPM shrinkwrap file is missing.'));
      console.log('');
      console.log('You need to run "rush generate" first.');
      process.exit(1);
      return;
    }

    if (!installManager.regenerateAndValidateShrinkwrap(shrinkwrapFile)) {
      console.log('');
      console.log(colors.red('Unable to proceed:  A required dependency was not found in the common folder.'));
      console.log('');
      console.log('You need to run "rush generate" to update the common folder.');
      process.exit(1);
      return;
    }

    installManager.installCommonModules(this._cleanInstall.value || this._cleanInstallFull.value);

    stopwatch.stop();
    console.log(colors.green(`The common NPM packages are up to date. (${stopwatch.toString()})`));

    if (!this._noLinkParameter.value) {
      const linkAction: LinkAction = new LinkAction(this._parser);
      linkAction.execute();
    } else {
      console.log(os.EOL + 'Next you should probably run: "rush link"');
    }
  }
}
