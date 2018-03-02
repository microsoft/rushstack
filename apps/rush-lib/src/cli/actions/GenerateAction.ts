// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';
import * as path from 'path';
import * as fsx from 'fs-extra';
import { CommandLineFlagParameter } from '@microsoft/ts-command-line';

import { PackageManager } from '../../data/RushConfiguration';
import Utilities from '../../utilities/Utilities';
import { Stopwatch } from '../../utilities/Stopwatch';
import InstallManager, { InstallType } from '../logic/InstallManager';
import { LinkManagerFactory } from '../logic/LinkManagerFactory';
import { BaseLinkManager } from '../logic/base/BaseLinkManager';
import RushCommandLineParser from './RushCommandLineParser';
import { ApprovedPackagesChecker } from '../logic/ApprovedPackagesChecker';
import { BaseShrinkwrapFile } from '../logic/base/BaseShrinkwrapFile';
import { ShrinkwrapFileFactory } from '../logic/ShrinkwrapFileFactory';
import { BaseRushAction } from './BaseRushAction';

export default class GenerateAction extends BaseRushAction {
  private _parser: RushCommandLineParser;
  private _lazyParameter: CommandLineFlagParameter;
  private _noLinkParameter: CommandLineFlagParameter;
  private _forceParameter: CommandLineFlagParameter;
  private _cleanParameter: CommandLineFlagParameter;
  private _conservativeParameter: CommandLineFlagParameter;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'generate',
      summary: 'Generate a new shrinkwrap file containing the latest semver-compatible versions.',
      documentation: 'Run the "rush generate" command only if: (1) you are setting up a new repo, or'
      + ' (2) you want to upgrade to the latest versions of your dependencies, or (3)'
      + ' you modified a package.json file and "rush install" can\'t find what it needs.'
      + ' The "rush generate" command will do a clean install of your Rush "common" folder,'
      + ' upgrading you to the latest semver-compatible versions of all dependencies.'
      + ' Then, it will create a new shrinkwrap file, which you should commit to source control.'
      + ' Afterwards, it will run "rush link" to create symlinks for all your projects.'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    this._lazyParameter = this.defineFlagParameter({
      parameterLongName: '--lazy',
      parameterShortName: '-l',
      description: 'Use this to save time in situations where you need to run "rush generate" repeatedly'
      + ' while editing package.json files.  It performs a much quicker incremental install,'
      + ' but does not generate a shrinkwrap file; you will still need to run a full "rush generate"'
      + ' (without --lazy) before committing your changes.'
    });
    this._forceParameter = this.defineFlagParameter({
      parameterLongName: '--force',
      parameterShortName: '-f',
      description: 'Use this to bypass checking the shrinkwrap file, which forces rush generate to run even if all'
      + ' dependencies already exist in the shrinkwrap file. Only applies when package manager is npm.'
    });
    this._noLinkParameter = this.defineFlagParameter({
      parameterLongName: '--no-link',
      description: 'Do not automatically run the "rush link" action after "rush generate"'
    });
    this._cleanParameter = this.defineFlagParameter({
      parameterLongName: '--clean',
      parameterShortName: '-c',
      description: 'When using pnpm, forces a non-incremental clean install which clears the node_module and pnpm'
        + ' store. Use this if any store corruption has occurred.'
    });
    this._conservativeParameter = this.defineFlagParameter({
      parameterLongName: '--conservative',
      description: 'When using pnpm, this only bumps the minimal set of versions necessary to satisfy'
      + ' package.json requirements, avoiding a full upgrade of unrelated shrinkwrap dependencies.'
    });
  }

  protected run(): Promise<void> {
    const stopwatch: Stopwatch = Stopwatch.start();
    const isLazy: boolean = this._lazyParameter.value;

    if (this._cleanParameter.value && this._lazyParameter.value) {
      throw new Error(`Cannot specify both --clean and --lazy, as these are mutually exclusive operations.`);
    }

    if (this._lazyParameter.value && this.rushConfiguration.packageManager === 'pnpm') {
      console.warn(colors.yellow('The --lazy flag is not required for pnpm'
        + ' because its algorithm inherently incorporates this optimization.'));
    }

    if (this._cleanParameter.value && this.rushConfiguration.packageManager === 'npm') {
      console.warn(colors.yellow('The --clean flag is not required for npm'
        + ' because its algorithm always performs a clean installation.'));
    }

    if (this._conservativeParameter.value && this.rushConfiguration.packageManager !== 'pnpm') {
      throw new Error(`The --conservative flag is only supported for pnpm.`);
    }

    ApprovedPackagesChecker.rewriteConfigFiles(this.rushConfiguration);

    const installManager: InstallManager = new InstallManager(this.rushConfiguration);

    const committedShrinkwrapFilename: string = this.rushConfiguration.committedShrinkwrapFilename;
    const tempShrinkwrapFilename: string = this.rushConfiguration.tempShrinkwrapFilename;

    try {
      const shrinkwrapFile: BaseShrinkwrapFile | undefined = ShrinkwrapFileFactory.getShrinkwrapFile(
        this.rushConfiguration.packageManager,
        this.rushConfiguration.committedShrinkwrapFilename);

      if (shrinkwrapFile
        && !this._forceParameter.value
        && installManager.createTempModulesAndCheckShrinkwrap(shrinkwrapFile, false)) {
        console.log();
        console.log(colors.yellow('Skipping generate, since all project dependencies are already satisfied.'));
        console.log();
        console.log(`If you want to force an upgrade to the latest compatible versions, use ` +
          `${colors.yellow('rush generate --force')}. Otherwise, just run ${colors.green('rush install')}.)`);
        return Promise.resolve();
      }
    } catch (ex) {
      console.log();
      console.log('There was a problem reading the shrinkwrap file. Proceeding with "rush generate".');
    }

    return installManager.ensureLocalPackageManager(false).then(() => {
      installManager.createTempModules(true);

      if (this._conservativeParameter.value) {
        if (fsx.existsSync(committedShrinkwrapFilename)) {
          console.log(os.EOL + 'The "--conservative" flag was provided, so preserving '
            + committedShrinkwrapFilename);
        } else {
          throw new Error('The "--conservative" flag cannot be used because the shrinkwrap file is missing: '
            + committedShrinkwrapFilename);
        }

        // Copy common\config\rush\shrinkwrap.yaml --> common\temp\shrinkwrap.yaml
        console.log(os.EOL + 'Updating ' + tempShrinkwrapFilename);
        fsx.copySync(committedShrinkwrapFilename, tempShrinkwrapFilename);
      } else {
        if (fsx.existsSync(tempShrinkwrapFilename)) {
          console.log(os.EOL + 'Deleting ' + tempShrinkwrapFilename);
          fsx.unlinkSync(tempShrinkwrapFilename);
        }
      }

      const packageManager: PackageManager = this.rushConfiguration.packageManager;

      if (this.rushConfiguration.packageManager === 'pnpm') {

        // Do an incremental install unless --clean is specified
        installManager.installCommonModules(this._cleanParameter.value
          ? InstallType.ForceClean
          : InstallType.Normal);

        this._syncShrinkwrapAndCheckInstallFlag(installManager);

      } else if (this.rushConfiguration.packageManager === 'npm') {

        if (isLazy) {
          console.log(colors.green(
            `${os.EOL}Rush is running in "--lazy" mode. ` +
            `You will need to run a normal "rush generate" before committing.`));

          // Do an incremental install
          installManager.installCommonModules(InstallType.Normal);

          console.log(os.EOL + colors.bold('(Skipping "npm shrinkwrap")') + os.EOL);

          // delete the automatically created npm5 "package.lock" file
          const packageLogFilePath: string = path.join(this.rushConfiguration.commonTempFolder, 'package.lock');
          if (fsx.existsSync(packageLogFilePath)) {
            console.log('Removing NPM 5\'s "package.lock" file');
            fsx.removeSync(packageLogFilePath);
          }
        } else {
          // Do a clean install
          installManager.installCommonModules(InstallType.ForceClean);

          console.log(os.EOL + colors.bold('Running "npm shrinkwrap"...'));
          const npmArgs: string[] = ['shrinkwrap'];
          installManager.pushConfigurationArgs(npmArgs);
          Utilities.executeCommand(this.rushConfiguration.packageManagerToolFilename,
            npmArgs, this.rushConfiguration.commonTempFolder);
          console.log('"npm shrinkwrap" completed' + os.EOL);

          this._syncShrinkwrapAndCheckInstallFlag(installManager);
        }

      } else {
        // program bug
        throw new Error(`Program bug: invalid package manager "${packageManager}"`);
      }

      stopwatch.stop();
      console.log(os.EOL + colors.green(`Rush generate finished successfully. (${stopwatch.toString()})`));

      if (!this._noLinkParameter.value) {
        const linkManager: BaseLinkManager =
          LinkManagerFactory.getLinkManager(this.rushConfiguration);
        // NOTE: Setting force=true here shouldn't be strictly necessary, since installCommonModules()
        // above should have already deleted the marker file, but it doesn't hurt to be explicit.
        return linkManager.createSymlinksForProjects(true);
      } else {
        console.log(os.EOL + 'Next you should probably run: "rush link"');
      }
    });
  }

  private _syncShrinkwrapAndCheckInstallFlag(installManager: InstallManager): void {
    // Copy (or delete) common\temp\shrinkwrap.yaml --> common\config\rush\shrinkwrap.yaml
    installManager.syncFile(this.rushConfiguration.tempShrinkwrapFilename,
      this.rushConfiguration.committedShrinkwrapFilename);

    // The flag file is normally created by installCommonModules(), but "rush install" will
    // compare its timestamp against the shrinkwrap file.  Since we just generated a new
    // npm-shrinkwrap file, it's safe to bump the timestamp, which ensures that "rush install"
    // won't do anything immediately after "rush generate".  This is a minor performance
    // optimization, but it helps people to understand the semantics of the commands.
    if (installManager.commonNodeModulesMarker.isValid()) {
      installManager.commonNodeModulesMarker.create();
    } else {
      // Sanity check -- since we requested a clean install above, this should never occur
      throw new Error('The install flag file is missing');
    }
  }
}
