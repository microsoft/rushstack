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

export class Autoinstaller {
  public name: string;

  private _rushConfiguration: RushConfiguration;

  public constructor(autoinstallerName: string, rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    Autoinstaller.validateName(autoinstallerName);
    this.name = autoinstallerName;
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
      RushConstants.defaultMaxInstallAttempts
    );

    // Example: common/autoinstallers/my-task/package.json
    const relativePathForLogs: string = path.relative(
      this._rushConfiguration.rushJsonFolder,
      autoinstallerFullPath
    );

    console.log(`Acquiring lock for "${relativePathForLogs}" folder...`);

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
      packageJson: packageJson
    });

    if (!lastInstallFlag.isValid() || lock.dirtyWhenAcquired) {
      // Example: ../common/autoinstallers/my-task/node_modules
      const nodeModulesFolder: string = path.join(autoinstallerFullPath, 'node_modules');

      if (FileSystem.exists(nodeModulesFolder)) {
        console.log('Deleting old files from ' + nodeModulesFolder);
        FileSystem.ensureEmptyFolder(nodeModulesFolder);
      }

      // Copy: .../common/autoinstallers/my-task/.npmrc
      Utilities.syncNpmrc(this._rushConfiguration.commonRushConfigFolder, autoinstallerFullPath);

      console.log(`Installing dependencies under ${autoinstallerFullPath}...\n`);

      Utilities.executeCommand({
        command: this._rushConfiguration.packageManagerToolFilename,
        args: ['install', '--frozen-lockfile'],
        workingDirectory: autoinstallerFullPath,
        keepEnvironment: true
      });

      // Create file: ../common/autoinstallers/my-task/.rush/temp/last-install.flag
      lastInstallFlag.create();

      console.log('Auto install completed successfully\n');
    } else {
      console.log('Autoinstaller folder is already up to date\n');
    }

    lock.release();
  }

  public update(): void {
    const autoinstallerPackageJsonPath: string = path.join(this.folderFullPath, 'package.json');

    if (!FileSystem.exists(autoinstallerPackageJsonPath)) {
      throw new Error(`The specified autoinstaller path does not exist: ` + autoinstallerPackageJsonPath);
    }

    console.log(`Updating autoinstaller package: ${autoinstallerPackageJsonPath}`);

    let oldFileContents: string = '';

    if (FileSystem.exists(this.shrinkwrapFilePath)) {
      oldFileContents = FileSystem.readFile(this.shrinkwrapFilePath, { convertLineEndings: NewlineKind.Lf });
      console.log('Deleting ' + this.shrinkwrapFilePath);
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

    console.log();

    Utilities.syncNpmrc(this._rushConfiguration.commonRushConfigFolder, this.folderFullPath);

    Utilities.executeCommand({
      command: this._rushConfiguration.packageManagerToolFilename,
      args: ['install'],
      workingDirectory: this.folderFullPath,
      keepEnvironment: true
    });

    console.log();

    if (this._rushConfiguration.packageManager === 'npm') {
      console.log(colors.bold('Running "npm shrinkwrap"...'));
      Utilities.executeCommand({
        command: this._rushConfiguration.packageManagerToolFilename,
        args: ['shrinkwrap'],
        workingDirectory: this.folderFullPath,
        keepEnvironment: true
      });
      console.log('"npm shrinkwrap" completed');
      console.log();
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
      console.log(
        colors.green('The shrinkwrap file has been updated.') + '  Please commit the updated file:'
      );
      console.log(`\n  ${this.shrinkwrapFilePath}`);
    } else {
      console.log(colors.green('Already up to date.'));
    }
  }
}
