// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';
import * as path from 'path';

import { BaseScriptAction, IBaseScriptActionOptions } from './BaseScriptAction';
import { Utilities } from '../../utilities/Utilities';
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
import { FileSystem, LockFile } from '@rushstack/node-core-library';
import { InstallHelpers } from '../../logic/InstallHelpers';
import { RushConstants } from '../../logic/RushConstants';
import { LastInstallFlag } from '../../api/LastInstallFlag';

/**
 * Constructor parameters for GlobalScriptAction.
 */
export interface IGlobalScriptActionOptions extends IBaseScriptActionOptions {
  shellCommand: string;
  autoinstallFolder: string | undefined;
}

/**
 * This class implements custom commands that are run once globally for the entire repo
 * (versus bulk commands, which run separately for each project).  The action executes
 * a user-defined script file.
 *
 * @remarks
 * Bulk commands can be defined via common/config/command-line.json.  Rush's predefined "build"
 * and "rebuild" commands are also modeled as bulk commands, because they essentially just
 * invoke scripts from package.json in the same way as a custom command.
 */
export class GlobalScriptAction extends BaseScriptAction {
  private _shellCommand: string;
  private _autoinstallFolder: string | undefined;

  public constructor(
    options: IGlobalScriptActionOptions
  ) {
    super(options);
    this._shellCommand = options.shellCommand;
    this._autoinstallFolder = options.autoinstallFolder;
  }

  private async _prepareAutoinstallFolder(): Promise<string> {
    await InstallHelpers.ensureLocalPackageManager(this.rushConfiguration, this.rushGlobalFolder,
      RushConstants.defaultMaxInstallAttempts);

    const autoinstallFolderForCommand: string = this._autoinstallFolder!;

    const autoinstallFolderFullPath: string = path.join(this.rushConfiguration.commonFolder, 'autoinstall',
      autoinstallFolderForCommand);

    if (!FileSystem.exists(autoinstallFolderFullPath)) {
      throw new Error('The autoinstall folder does not exist: ' + autoinstallFolderFullPath);
    }
    if (!FileSystem.exists(path.join(autoinstallFolderFullPath, 'package.json'))) {
      throw new Error('The autoinstall folder is missing a package.json file: ' + autoinstallFolderFullPath);
    }

    console.log(`Trying to acquire lock for "${autoinstallFolderForCommand}" folder`);

    const lock: LockFile = await LockFile.acquire(autoinstallFolderFullPath, 'autoinstall');

    console.log(`Acquired lock`);

    // Example: common/autoinstall/my-task/.rush/temp
    const lastInstallFlagPath: string = path.join(autoinstallFolderFullPath, RushConstants.projectRushFolderName,
      'temp');

    const lastInstallFlag: LastInstallFlag = new LastInstallFlag(lastInstallFlagPath, {
      node: process.versions.node,
      packageManager: this.rushConfiguration.packageManager,
      packageManagerVersion: this.rushConfiguration.packageManagerToolVersion
    });

    if (!lastInstallFlag.isValid() || lock.dirtyWhenAcquired) {
      // Example: common/autoinstall/my-task/node_modules
      const nodeModulesFolder: string = path.join(autoinstallFolderFullPath, 'node_modules');

      if (FileSystem.exists(nodeModulesFolder)) {
        console.log('Deleting old files from ' + nodeModulesFolder);
        FileSystem.ensureEmptyFolder(nodeModulesFolder);
      }

      // Copy: common/autoinstall/my-task/.npmrc
      Utilities.syncNpmrc(this.rushConfiguration.commonRushConfigFolder, autoinstallFolderFullPath);

      console.log('Autoinstalling dependencies under ' + autoinstallFolderFullPath);

      Utilities.executeCommand(this.rushConfiguration.packageManagerToolFilename, ['install'],
        autoinstallFolderFullPath, undefined, /* suppressOutput */ true, /* keepEnvironment */ true);

      // Create file: common/autoinstall/my-task/.rush/temp/last-install.flag
      lastInstallFlag.create();

      console.log('Autoinstall completed successfully');
    } else {
      console.log('Autoinstall folder is already up to date');
    }

    lock.release();

    return autoinstallFolderFullPath;
  }

  public async run(): Promise<void> {
    const additionalPathFolders: string[] = [];

    if (this._autoinstallFolder) {
      const autoinstallFolderFullPath: string = await this._prepareAutoinstallFolder();
      const autoinstallFolderBinPath: string = path.join(autoinstallFolderFullPath, 'node_modules', '.bin');
      additionalPathFolders.push(autoinstallFolderBinPath);
    }

    // Collect all custom parameter values
    const customParameterValues: string[] = [];

    for (const customParameter of this.customParameters) {
      customParameter.appendToArgList(customParameterValues);
    }

    let shellCommand: string = this._shellCommand;
    if (customParameterValues.length > 0) {
      shellCommand += ' ' + customParameterValues.join(' ');
    }

    const exitCode: number = Utilities.executeLifecycleCommand(
      shellCommand,
      {
        rushConfiguration: this.rushConfiguration,
        workingDirectory: this.rushConfiguration.rushJsonFolder,
        initCwd: this.rushConfiguration.commonTempFolder,
        handleOutput: false,
        environmentPathOptions: {
          includeRepoBin: true,
          additionalPathFolders: additionalPathFolders
        }
      }
    );

    process.exitCode = exitCode;

    if (exitCode > 0) {
      console.log(os.EOL + colors.red(`The script failed with exit code ${exitCode}`));
      throw new AlreadyReportedError();
    }
  }

  protected onDefineParameters(): void {
    this.defineScriptParameters();
  }
}
