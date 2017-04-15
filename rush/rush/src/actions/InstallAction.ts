// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as fsx from 'fs-extra';
import * as glob from 'glob';
import globEscape = require('glob-escape');
import * as os from 'os';
import * as path from 'path';

import { CommandLineAction, CommandLineFlagParameter } from '@microsoft/ts-command-line';
import {
  JsonFile,
  RushConfiguration,
  Utilities,
  Stopwatch,
  AsyncRecycle,
  IPackageJson
} from '@microsoft/rush-lib';

import RushCommandLineParser from './RushCommandLineParser';
import GitPolicy from '../utilities/GitPolicy';
import { TempModuleGenerator } from '../utilities/TempModuleGenerator';
import LinkAction from './LinkAction';
import ShrinkwrapFile from '../utilities/ShrinkwrapFile';

const MAX_INSTALL_ATTEMPTS: number = 5;

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

    InstallHelpers.ensureLocalNpmTool(this._rushConfiguration, this._cleanInstallFull.value);

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

    const tempModuleGenerator: TempModuleGenerator = new TempModuleGenerator(this._rushConfiguration);
    if (!tempModuleGenerator.regenerateAndValidateShrinkwrap(shrinkwrapFile)) {
      console.log('');
      console.log(colors.red('Unable to proceed:  A required dependency was not found in the common folder.'));
      console.log('');
      console.log('You need to run "rush generate" to update the common folder.');
      process.exit(1);
      return;
    }

    InstallHelpers.installCommonModules(this._rushConfiguration,
      this._cleanInstall.value || this._cleanInstallFull.value);

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

export class InstallHelpers {
  public static ensureLocalNpmTool(rushConfiguration: RushConfiguration, forceReinstall: boolean): void {
    // Example: "C:\Users\YourName\.rush"
    const rushHomeFolder: string = path.join(rushConfiguration.homeFolder, '.rush');

    if (!fsx.existsSync(rushHomeFolder)) {
      console.log('Creating ' + rushHomeFolder);
      fsx.mkdirSync(rushHomeFolder);
    }

    // Example: "C:\Users\YourName\.rush\npm-1.2.3"
    const npmToolFolder: string = path.join(rushHomeFolder, 'npm-' + rushConfiguration.npmToolVersion);
    // Example: "C:\Users\YourName\.rush\npm-1.2.3\last-install.flag"
    const npmToolFlagFile: string = path.join(npmToolFolder, 'last-install.flag');

    // NOTE: We don't care about the timestamp for last-install.flag, because nobody will change
    // the package.json for this case
    if (forceReinstall || !fsx.existsSync(npmToolFlagFile)) {
      console.log(colors.bold('Installing NPM version ' + rushConfiguration.npmToolVersion) + os.EOL);

      if (fsx.existsSync(npmToolFolder)) {
        console.log('Deleting old files from ' + npmToolFolder);
        Utilities.dangerouslyDeletePath(npmToolFolder);
      }
      Utilities.createFolderWithRetry(npmToolFolder);

      const npmPackageJson: PackageJson = {
        dependencies: { 'npm': rushConfiguration.npmToolVersion },
        description: 'Temporary file generated by the Rush tool',
        name: 'npm-local-install',
        private: true,
        version: '0.0.0'
      };
      JsonFile.saveJsonFile(npmPackageJson, path.join(npmToolFolder, 'package.json'));

      console.log(os.EOL + 'Running "npm install" in ' + npmToolFolder);

      // NOTE: Here we use whatever version of NPM we happen to find in the PATH
      Utilities.executeCommandWithRetry('npm', ['install'], MAX_INSTALL_ATTEMPTS, npmToolFolder);

      // Create the marker file to indicate a successful install
      fsx.writeFileSync(npmToolFlagFile, '');
      console.log('Successfully installed NPM ' + rushConfiguration.npmToolVersion);
    } else {
      console.log('Found NPM version ' + rushConfiguration.npmToolVersion + ' in ' + npmToolFolder);
    }

    // Example: "C:\MyRepo\common\npm-local"
    const localNpmToolFolder: string = path.join(rushConfiguration.commonFolder, 'npm-local');
    if (fsx.existsSync(localNpmToolFolder)) {
      fsx.unlinkSync(localNpmToolFolder);
    }
    console.log(os.EOL + 'Symlinking "' + localNpmToolFolder + '"');
    console.log('  --> "' + npmToolFolder + '"');
    fsx.symlinkSync(npmToolFolder, localNpmToolFolder, 'junction');
  }

  public static installCommonModules(rushConfiguration: RushConfiguration, cleanInstall: boolean): void {
    // Example: "C:\MyRepo\common\npm-local\node_modules\.bin\npm"
    const npmToolFilename: string = rushConfiguration.npmToolFilename;
    if (!fsx.existsSync(npmToolFilename)) {
      // This is a sanity check.  It should never happen if the above logic worked correctly.
      throw new Error('Failed to create "' + npmToolFilename + '"');
    }

    console.log(os.EOL + colors.bold('Checking modules in ' + rushConfiguration.commonFolder) + os.EOL);

    // Example: "C:\MyRepo\common\last-install.flag"
    const commonNodeModulesMarkerFilename: string =
      path.join(rushConfiguration.commonFolder, 'last-install.flag');
    const commonNodeModulesFolder: string = path.join(rushConfiguration.commonFolder, 'node_modules');

    let needToInstall: boolean = false;
    let skipPrune: boolean = false;

    if (cleanInstall) {
      if (fsx.existsSync(commonNodeModulesMarkerFilename)) {
        // If we are cleaning the node_modules folder, then also delete the flag file
        // to force a reinstall
        fsx.unlinkSync(commonNodeModulesMarkerFilename);
      }

      // Example: "C:\MyRepo\common\node_modules"
      if (fsx.existsSync(commonNodeModulesFolder)) {
        console.log('Deleting old files from ' + commonNodeModulesFolder);
        Utilities.dangerouslyDeletePath(commonNodeModulesFolder);
        Utilities.createFolderWithRetry(commonNodeModulesFolder);
      }

      if (rushConfiguration.cacheFolder) {
        const cacheCleanArgs: string[] = ['cache', 'clean', rushConfiguration.cacheFolder];
        console.log(os.EOL + `Running "npm ${cacheCleanArgs.join(' ')}"`);
        Utilities.executeCommand(npmToolFilename, cacheCleanArgs, rushConfiguration.commonFolder);
      } else {
        // Ideally we should clean the global cache here.  However, the global NPM cache
        // is (inexplicably) not threadsafe, so if there are any concurrent "npm install"
        // processes running this would cause them to crash.
        console.log(os.EOL + 'Skipping "npm cache clean" because the cache is global.');
      }

      needToInstall = true;
      skipPrune = true;
    } else {
      // Compare the timestamps last-install.flag, npm-shrinkwrap, and package.json to see if our install is outdated
      const potentiallyChangedFiles: string[] = [];

      // Consider the timestamp on the node_modules folder; if someone tampered with it
      // or deleted it entirely, then isFileTimestampCurrent() will cause us to redo "npm install".
      potentiallyChangedFiles.push(commonNodeModulesFolder);

      // Additionally, if they pulled an updated shrinkwrap file from Git, we need to install as well
      potentiallyChangedFiles.push(rushConfiguration.shrinkwrapFilename);

      if (!Utilities.isFileTimestampCurrent(commonNodeModulesMarkerFilename, potentiallyChangedFiles)) {
        needToInstall = true;
      }
    }

    if (needToInstall) {
      // The "npm install" command is not transactional; if it is killed, then the "node_modules"
      // folder may be in a corrupted state (e.g. because a postinstall script only executed partially).
      // Rush works around this using a marker file "last-install.flag".  We delete this file
      // before installing, and then create it again after a successful "npm install".  Thus,
      // if this file exists, it guarantees we are in a good state.  If not, we must do a clean intall.
      if (!fsx.existsSync(commonNodeModulesMarkerFilename)) {
        if (fsx.existsSync(commonNodeModulesFolder)) {
          // If an "npm install" is interrupted,
          console.log('Deleting the "node_modules" folder because the previous Rush install' +
            ' did not complete successfully.');

          AsyncRecycle.recycleDirectory(rushConfiguration, commonNodeModulesFolder);
        }

        skipPrune = true;
      } else {
        // Delete the successful install file to indicate the install has started
        fsx.unlinkSync(commonNodeModulesMarkerFilename);
      }

      if (!skipPrune) {
        console.log(`Running "npm prune" in ${rushConfiguration.commonFolder}`);
        Utilities.executeCommandWithRetry(npmToolFilename, ['prune'], MAX_INSTALL_ATTEMPTS,
          rushConfiguration.commonFolder);

        // Delete the temp projects because NPM will not notice when they are changed.
        // We can recognize them because their names start with "rush-"

        // Example: "C:\MyRepo\common\node_modules\rush-"
        const pathToDeleteWithoutStar: string = path.join(commonNodeModulesFolder, 'rush-');
        console.log(`Deleting ${pathToDeleteWithoutStar}*`);
        // Glob can't handle Windows paths
        const normalizedpathToDeleteWithoutStar: string
          = Utilities.getAllReplaced(pathToDeleteWithoutStar, '\\', '/');
        for (const tempModulePath of glob.sync(globEscape(normalizedpathToDeleteWithoutStar) + '*')) {
          Utilities.dangerouslyDeletePath(tempModulePath);
        }
      }

      const npmInstallArgs: string[] = ['install'];
      if (rushConfiguration.cacheFolder) {
        npmInstallArgs.push('--cache', rushConfiguration.cacheFolder);
      }

      if (rushConfiguration.tmpFolder) {
        npmInstallArgs.push('--tmp', rushConfiguration.tmpFolder);
      }

      // Next, run "npm install" in the common folder
      console.log(os.EOL + `Running "npm ${npmInstallArgs.join(' ')}" in ${rushConfiguration.commonFolder}`);
      Utilities.executeCommandWithRetry(npmToolFilename,
        npmInstallArgs,
        MAX_INSTALL_ATTEMPTS,
        rushConfiguration.commonFolder);

      // Create the marker file to indicate a successful install
      fsx.createFileSync(commonNodeModulesMarkerFilename);
      console.log('');
    }
  }

}
