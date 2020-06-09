// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';
import * as path from 'path';

import { BaseScriptAction, IBaseScriptActionOptions } from './BaseScriptAction';
import { Utilities } from '../../utilities/Utilities';
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
import { FileSystem, LockFile, IPackageJson, JsonFile, PackageName } from '@rushstack/node-core-library';
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
  private readonly _shellCommand: string;
  private readonly _autoinstallFolder: string;
  private readonly _autoinstallFolderFullPath: string;

  public constructor(options: IGlobalScriptActionOptions) {
    super(options);
    this._shellCommand = options.shellCommand;
    this._autoinstallFolder = options.autoinstallFolder || '';

    if (this._autoinstallFolder) {
      const error: string = PackageName.tryParse(this._autoinstallFolder).error;
      if (error) {
        throw new Error(
          `The custom command "${this.actionName}" specifies a "autoinstallFolder" containing` +
            ` invalid characters: ` +
            error
        );
      }

      // Example: .../common/autoinstall/my-task
      this._autoinstallFolderFullPath = path.join(
        this.rushConfiguration.commonFolder,
        'autoinstall',
        this._autoinstallFolder
      );

      if (!FileSystem.exists(this._autoinstallFolderFullPath)) {
        throw new Error(
          `The custom command "${this.actionName}" specifies an "autoinstallFolder" setting` +
            ' but the path does not exist: ' +
            this._autoinstallFolderFullPath
        );
      }

      // Example: .../common/autoinstall/my-task/package.json
      const packageJsonPath: string = path.join(this._autoinstallFolderFullPath, 'package.json');
      if (!FileSystem.exists(packageJsonPath)) {
        throw new Error(
          `The custom command "${this.actionName}" specifies an "autoinstallFolder" setting` +
            ` whose package.json file was not found: ` +
            packageJsonPath
        );
      }

      const packageJson: IPackageJson = JsonFile.load(packageJsonPath);

      if (packageJson.name !== this._autoinstallFolder) {
        throw new Error(
          `The custom command "${this.actionName}" specifies an "autoinstallFolder" setting,` +
            ` but the package.json file's "name" field is not "${this._autoinstallFolder}": ` +
            packageJsonPath
        );
      }
    } else {
      this._autoinstallFolderFullPath = '';
    }
  }

  private async _prepareAutoinstallFolder(): Promise<void> {
    await InstallHelpers.ensureLocalPackageManager(
      this.rushConfiguration,
      this.rushGlobalFolder,
      RushConstants.defaultMaxInstallAttempts
    );

    // Example: common/autoinstall/my-task/package.json
    const relativePathForLogs: string = path.relative(
      this.rushConfiguration.rushJsonFolder,
      this._autoinstallFolderFullPath
    );

    console.log(`Acquiring lock for "${relativePathForLogs}" folder...`);

    const lock: LockFile = await LockFile.acquire(this._autoinstallFolderFullPath, 'autoinstall');

    // Example: .../common/autoinstall/my-task/.rush/temp
    const lastInstallFlagPath: string = path.join(
      this._autoinstallFolderFullPath,
      RushConstants.projectRushFolderName,
      'temp'
    );

    const packageJsonPath: string = path.join(this._autoinstallFolderFullPath, 'package.json');
    const packageJson: IPackageJson = JsonFile.load(packageJsonPath);

    const lastInstallFlag: LastInstallFlag = new LastInstallFlag(lastInstallFlagPath, {
      node: process.versions.node,
      packageManager: this.rushConfiguration.packageManager,
      packageManagerVersion: this.rushConfiguration.packageManagerToolVersion,
      packageJson: packageJson
    });

    if (!lastInstallFlag.isValid() || lock.dirtyWhenAcquired) {
      // Example: ../common/autoinstall/my-task/node_modules
      const nodeModulesFolder: string = path.join(this._autoinstallFolderFullPath, 'node_modules');

      if (FileSystem.exists(nodeModulesFolder)) {
        console.log('Deleting old files from ' + nodeModulesFolder);
        FileSystem.ensureEmptyFolder(nodeModulesFolder);
      }

      // Copy: .../common/autoinstall/my-task/.npmrc
      Utilities.syncNpmrc(this.rushConfiguration.commonRushConfigFolder, this._autoinstallFolderFullPath);

      console.log(`Installing dependencies under ${this._autoinstallFolderFullPath}...\n`);

      Utilities.executeCommand(
        this.rushConfiguration.packageManagerToolFilename,
        ['install', '--frozen-lockfile'],
        this._autoinstallFolderFullPath,
        undefined,
        /* suppressOutput */ false,
        /* keepEnvironment */ true
      );

      // Create file: ../common/autoinstall/my-task/.rush/temp/last-install.flag
      lastInstallFlag.create();

      console.log('Autoinstall completed successfully\n');
    } else {
      console.log('Autoinstall folder is already up to date\n');
    }

    lock.release();
  }

  public async run(): Promise<void> {
    const additionalPathFolders: string[] = [];

    if (this._autoinstallFolder) {
      await this._prepareAutoinstallFolder();

      const autoinstallFolderBinPath: string = path.join(
        this._autoinstallFolderFullPath,
        'node_modules',
        '.bin'
      );
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

    const exitCode: number = Utilities.executeLifecycleCommand(shellCommand, {
      rushConfiguration: this.rushConfiguration,
      workingDirectory: this.rushConfiguration.rushJsonFolder,
      initCwd: this.rushConfiguration.commonTempFolder,
      handleOutput: false,
      environmentPathOptions: {
        includeRepoBin: true,
        additionalPathFolders: additionalPathFolders
      }
    });

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
