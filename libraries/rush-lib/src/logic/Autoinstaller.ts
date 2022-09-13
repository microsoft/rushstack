// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import colors from 'colors/safe';
import * as path from 'path';

import { FileSystem, IPackageJson, JsonFile, LockFile, NewlineKind } from '@rushstack/node-core-library';
import { Utilities } from '../utilities/Utilities';

import { PackageName, IParsedPackageNameOrError } from '@rushstack/node-core-library';
import { RushConfiguration } from '../api/RushConfiguration';
import { PackageJsonEditor } from '../api/PackageJsonEditor';
import { InstallHelpers } from './installManager/InstallHelpers';
import { RushGlobalFolder } from '../api/RushGlobalFolder';
import { RushConstants } from './RushConstants';
import { LastInstallFlag } from '../api/LastInstallFlag';

interface IAutoinstallerOptions {
  autoinstallerName: string;
  rushConfiguration: RushConfiguration;
  restrictConsoleOutput?: boolean;
}

export class Autoinstaller {
  public readonly name: string;

  private readonly _rushConfiguration: RushConfiguration;
  private readonly _restrictConsoleOutput: boolean;

  public constructor(options: IAutoinstallerOptions) {
    this.name = options.autoinstallerName;
    this._rushConfiguration = options.rushConfiguration;
    this._restrictConsoleOutput = options.restrictConsoleOutput || false;

    Autoinstaller.validateName(this.name);
  }

  // Example: .../common/autoinstallers/my-task
  public get folderFullPath(): string {
    return path.join(this._rushConfiguration.commonAutoinstallersFolder, this.name);
  }

  // Example: .../common/autoinstallers/my-task/package-lock.yaml
  public get shrinkwrapFilePath(): string {
    return path.join(
      this._rushConfiguration.commonAutoinstallersFolder,
      this.name,
      this._rushConfiguration.shrinkwrapFilename
    );
  }

  // Example: .../common/autoinstallers/my-task/package.json
  public get packageJsonPath(): string {
    return path.join(this._rushConfiguration.commonAutoinstallersFolder, this.name, 'package.json');
  }

  public static validateName(autoinstallerName: string): void {
    const nameOrError: IParsedPackageNameOrError = PackageName.tryParse(autoinstallerName);
    if (nameOrError.error) {
      throw new Error(`The specified name "${autoinstallerName}" is invalid: ` + nameOrError.error);
    }
    if (nameOrError.scope) {
      throw new Error(`The specified name "${autoinstallerName}" must not contain an NPM scope`);
    }
  }

  public async prepareAsync(): Promise<void> {
    const autoinstallerFullPath: string = this.folderFullPath;

    if (!FileSystem.exists(autoinstallerFullPath)) {
      throw new Error(
        `The autoinstaller ${this.name} does not exist, Please run\nrush init-autoinstaller --name ${this.name}\n`
      );
    }

    const rushGlobalFolder: RushGlobalFolder = new RushGlobalFolder();
    await InstallHelpers.ensureLocalPackageManager(
      this._rushConfiguration,
      rushGlobalFolder,
      RushConstants.defaultMaxInstallAttempts,
      this._restrictConsoleOutput
    );

    // Example: common/autoinstallers/my-task/package.json
    const relativePathForLogs: string = path.relative(
      this._rushConfiguration.rushJsonFolder,
      autoinstallerFullPath
    );

    this._logIfConsoleOutputIsNotRestricted(`Acquiring lock for "${relativePathForLogs}" folder...`);

    const lock: LockFile = await LockFile.acquire(autoinstallerFullPath, 'autoinstaller');

    // Example: .../common/autoinstallers/my-task/.rush/temp
    const lastInstallFlagPath: string = path.join(
      autoinstallerFullPath,
      RushConstants.projectRushFolderName,
      'temp'
    );

    const packageJsonPath: string = path.join(autoinstallerFullPath, 'package.json');
    const packageJson: IPackageJson = JsonFile.load(packageJsonPath);

    const lastInstallFlag: LastInstallFlag = new LastInstallFlag(lastInstallFlagPath, {
      node: process.versions.node,
      packageManager: this._rushConfiguration.packageManager,
      packageManagerVersion: this._rushConfiguration.packageManagerToolVersion,
      packageJson: packageJson,
      rushJsonFolder: this._rushConfiguration.rushJsonFolder
    });

    // Example: ../common/autoinstallers/my-task/node_modules
    const nodeModulesFolder = path.join(autoinstallerFullPath, RushConstants.nodeModulesFolderName);
    const isLastInstallFlagDirty =
      !lastInstallFlag.isValid() ||
      !Utilities.isFileTimestampCurrent(FileSystem.getStatistics(lastInstallFlag.path).mtime, [
        nodeModulesFolder
      ]);

    if (isLastInstallFlagDirty || lock.dirtyWhenAcquired) {
      if (FileSystem.exists(nodeModulesFolder)) {
        this._logIfConsoleOutputIsNotRestricted('Deleting old files from ' + nodeModulesFolder);
        FileSystem.ensureEmptyFolder(nodeModulesFolder);
      }

      // Copy: .../common/autoinstallers/my-task/.npmrc
      Utilities.syncNpmrc(this._rushConfiguration.commonRushConfigFolder, autoinstallerFullPath);

      this._logIfConsoleOutputIsNotRestricted(`Installing dependencies under ${autoinstallerFullPath}...\n`);

      Utilities.executeCommand({
        command: this._rushConfiguration.packageManagerToolFilename,
        args: ['install', '--frozen-lockfile'],
        workingDirectory: autoinstallerFullPath,
        keepEnvironment: true
      });

      // Create file: ../common/autoinstallers/my-task/.rush/temp/last-install.flag
      lastInstallFlag.create();

      this._logIfConsoleOutputIsNotRestricted('Auto install completed successfully\n');
    } else {
      this._logIfConsoleOutputIsNotRestricted('Autoinstaller folder is already up to date\n');
    }

    lock.release();
  }

  public update(): void {
    const autoinstallerPackageJsonPath: string = path.join(this.folderFullPath, 'package.json');

    if (!FileSystem.exists(autoinstallerPackageJsonPath)) {
      throw new Error(`The specified autoinstaller path does not exist: ` + autoinstallerPackageJsonPath);
    }

    this._logIfConsoleOutputIsNotRestricted(
      `Updating autoinstaller package: ${autoinstallerPackageJsonPath}`
    );

    let oldFileContents: string = '';

    if (FileSystem.exists(this.shrinkwrapFilePath)) {
      oldFileContents = FileSystem.readFile(this.shrinkwrapFilePath, { convertLineEndings: NewlineKind.Lf });
      this._logIfConsoleOutputIsNotRestricted('Deleting ' + this.shrinkwrapFilePath);
      FileSystem.deleteFile(this.shrinkwrapFilePath);
    }

    // Detect a common mistake where PNPM prints "Already up-to-date" without creating a shrinkwrap file
    const packageJsonEditor: PackageJsonEditor = PackageJsonEditor.load(this.packageJsonPath);
    if (packageJsonEditor.dependencyList.length === 0 && packageJsonEditor.dependencyList.length === 0) {
      throw new Error(
        'You must add at least one dependency to the autoinstaller package' +
          ' before invoking this command:\n' +
          this.packageJsonPath
      );
    }

    this._logIfConsoleOutputIsNotRestricted();

    Utilities.syncNpmrc(this._rushConfiguration.commonRushConfigFolder, this.folderFullPath);

    Utilities.executeCommand({
      command: this._rushConfiguration.packageManagerToolFilename,
      args: ['install'],
      workingDirectory: this.folderFullPath,
      keepEnvironment: true
    });

    this._logIfConsoleOutputIsNotRestricted();

    if (this._rushConfiguration.packageManager === 'npm') {
      this._logIfConsoleOutputIsNotRestricted(colors.bold('Running "npm shrinkwrap"...'));
      Utilities.executeCommand({
        command: this._rushConfiguration.packageManagerToolFilename,
        args: ['shrinkwrap'],
        workingDirectory: this.folderFullPath,
        keepEnvironment: true
      });
      this._logIfConsoleOutputIsNotRestricted('"npm shrinkwrap" completed');
      this._logIfConsoleOutputIsNotRestricted();
    }

    if (!FileSystem.exists(this.shrinkwrapFilePath)) {
      throw new Error(
        'The package manager did not create the expected shrinkwrap file: ' + this.shrinkwrapFilePath
      );
    }

    const newFileContents: string = FileSystem.readFile(this.shrinkwrapFilePath, {
      convertLineEndings: NewlineKind.Lf
    });
    if (oldFileContents !== newFileContents) {
      this._logIfConsoleOutputIsNotRestricted(
        colors.green('The shrinkwrap file has been updated.') + '  Please commit the updated file:'
      );
      this._logIfConsoleOutputIsNotRestricted(`\n  ${this.shrinkwrapFilePath}`);
    } else {
      this._logIfConsoleOutputIsNotRestricted(colors.green('Already up to date.'));
    }
  }

  private _logIfConsoleOutputIsNotRestricted(message?: string): void {
    if (!this._restrictConsoleOutput) {
      console.log(message);
    }
  }
}
