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
import InstallManager, { InstallType } from '../utilities/InstallManager';
import LinkManager from '../utilities/LinkManager';
import ShrinkwrapFile from '../utilities/ShrinkwrapFile';
import { ApprovedPackagesChecker } from '../utilities/ApprovedPackagesChecker';

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
      documentation: 'Always run "rush install" whenever you: (1) clone a repo, or (2) pull new changes from source'
      + ' control, or (3) edit any package.json file.  The "rush install" command installs NPM packages into your'
      + ' Rush "common" folder, using the exact versions specified in your npm-shrinkwrap.json file.'
      + ' It also makes sure these versions satisfy your dependencies; if not, it will ask you to run'
      + ' "rush generate". If there is nothing to do, then "rush install" won\'t take any time.'
      + ' Afterwards, it will run "rush link" to create symlinks for all your projects.'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    this._cleanInstall = this.defineFlagParameter({
      parameterLongName: '--clean',
      parameterShortName: '-c',
      description: 'Deletes the common "node_modules" folder and NPM cache before installing.'
        + ' Use this option if you suspect that your package folder has become corrupted.'
        + ' This occurs sometimes due to bugs in the NPM tool, or if you upgraded your'
        + ' Node.js engine.'
    });
    this._cleanInstallFull = this.defineFlagParameter({
      parameterLongName: '--full-clean',
      parameterShortName: '-C',
      description: '(UNSAFE!) Similar to "--clean", but also deletes and reinstalls shared files'
        + ' such as the NPM tool itself. This is a more aggressive fix that is NOT SAFE to run'
        + ' regularly because it may cause other Rush or NPM processes to fail.'
    });
    this._bypassPolicy = this.defineFlagParameter({
      parameterLongName: '--bypass-policy',
      description: 'Overrides "gitPolicy" enforcement'
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

      ApprovedPackagesChecker.rewriteConfigFiles(this._rushConfiguration);
    }

    const stopwatch: Stopwatch = Stopwatch.start();

    console.log('Starting "rush install"' + os.EOL);

    const installManager: InstallManager = new InstallManager(this._rushConfiguration);

    installManager.ensureLocalNpmTool(this._cleanInstallFull.value);

    const shrinkwrapFile: ShrinkwrapFile | undefined
      = ShrinkwrapFile.loadFromFile(this._rushConfiguration.committedShrinkwrapFilename);

    if (!shrinkwrapFile) {
      console.log('');
      console.log(colors.red('Unable to proceed: The NPM shrinkwrap file is missing.'));
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

    let installType: InstallType = InstallType.Normal;
    if (this._cleanInstallFull.value) {
      installType = InstallType.UnsafePurge;
    } else if (this._cleanInstall.value) {
      installType = InstallType.ForceClean;
    }

    installManager.installCommonModules(installType);

    stopwatch.stop();
    console.log(colors.green(`Done. (${stopwatch.toString()})`));

    if (!this._noLinkParameter.value) {
      const linkManager: LinkManager = new LinkManager(this._rushConfiguration);
      this._parser.catchSyncErrors(linkManager.createSymlinksForProjects(false));
    } else {
      console.log(os.EOL + 'Next you should probably run: "rush link"');
    }
  }
}
