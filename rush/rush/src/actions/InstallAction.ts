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
      summary: 'Install NPM packages in the Rush "common" folder, as specified by your shrinkwrap file.',
      documentation: 'Always run "rush install" if you: (1) cloned a new repo, or (2) pulled new changes from Git,'
      + ' or (3) edited any package.json file.  The "rush install" command installs NPM packages into your'
      + ' Rush "common" folder, using the exact versions specified in your npm-shrinkwrap.json file.'
      + ' (It also makes sure these versions are adequate; if not, it will ask you to run "rush generate".)'
      + ' If there is nothing to do, then "rush install" won\'t take any time.'
      + ' Afterwards, it will run "rush link" to create symlinks for all your projects.'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    this._cleanInstall = this.defineFlagParameter({
      parameterLongName: '--clean',
      parameterShortName: '-c',
      description: 'Delete any previously installed files before installing;'
      + ' this takes longer but will resolve data corruption that is sometimes'
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

    if (!installManager.createTempModulesAndCheckShrinkwrap(shrinkwrapFile)) {
      console.log('');
      console.log(colors.red('You need to run "rush generate" to update your NPM shrinkwrap file.'));
      process.exit(1);
      return;
    }

    installManager.installCommonModules(this._cleanInstall.value || this._cleanInstallFull.value);

    stopwatch.stop();
    console.log(colors.green(`Done. (${stopwatch.toString()})`));

    if (!this._noLinkParameter.value) {
      const linkAction: LinkAction = new LinkAction(this._parser);
      linkAction.execute();
    } else {
      console.log(os.EOL + 'Next you should probably run: "rush link"');
    }
  }
}
