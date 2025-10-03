// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  FileSystem,
  type IPackageJson,
  JsonFile,
  LockFile,
  NewlineKind,
  PackageName,
  type IParsedPackageNameOrError
} from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';

import { Utilities } from '../utilities/Utilities';
import type { RushConfiguration } from '../api/RushConfiguration';
import { PackageJsonEditor } from '../api/PackageJsonEditor';
import { InstallHelpers } from './installManager/InstallHelpers';
import type { RushGlobalFolder } from '../api/RushGlobalFolder';
import { RushConstants } from './RushConstants';
import { LastInstallFlag } from '../api/LastInstallFlag';
import { RushCommandLineParser } from '../cli/RushCommandLineParser';
import type { PnpmPackageManager } from '../api/packageManager/PnpmPackageManager';

export interface IAutoinstallerOptions {
  autoinstallerName: string;
  rushConfiguration: RushConfiguration;
  rushGlobalFolder: RushGlobalFolder;
  restrictConsoleOutput?: boolean;
}

export class Autoinstaller {
  public readonly name: string;

  private readonly _rushConfiguration: RushConfiguration;
  private readonly _rushGlobalFolder: RushGlobalFolder;
  private readonly _restrictConsoleOutput: boolean;

  public constructor(options: IAutoinstallerOptions) {
    this.name = options.autoinstallerName;
    this._rushConfiguration = options.rushConfiguration;
    this._rushGlobalFolder = options.rushGlobalFolder;
    this._restrictConsoleOutput =
      options.restrictConsoleOutput ?? RushCommandLineParser.shouldRestrictConsoleOutput();

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

    await InstallHelpers.ensureLocalPackageManagerAsync(
      this._rushConfiguration,
      this._rushGlobalFolder,
      RushConstants.defaultMaxInstallAttempts,
      this._restrictConsoleOutput
    );

    // Example: common/autoinstallers/my-task/package.json
    const relativePathForLogs: string = path.relative(
      this._rushConfiguration.rushJsonFolder,
      autoinstallerFullPath
    );

    this._logIfConsoleOutputIsNotRestricted(`Acquiring lock for "${relativePathForLogs}" folder...`);

    const lock: LockFile = await LockFile.acquireAsync(autoinstallerFullPath, 'autoinstaller');

    try {
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
      const nodeModulesFolder: string = `${autoinstallerFullPath}/${RushConstants.nodeModulesFolderName}`;
      const flagPath: string = `${nodeModulesFolder}/rush-autoinstaller.flag`;
      const isLastInstallFlagDirty: boolean =
        !(await lastInstallFlag.isValidAsync()) || !FileSystem.exists(flagPath);

      if (isLastInstallFlagDirty || lock.dirtyWhenAcquired) {
        if (FileSystem.exists(nodeModulesFolder)) {
          this._logIfConsoleOutputIsNotRestricted('Deleting old files from ' + nodeModulesFolder);
          FileSystem.ensureEmptyFolder(nodeModulesFolder);
        }

        // Copy: .../common/autoinstallers/my-task/.npmrc
        Utilities.syncNpmrc({
          sourceNpmrcFolder: this._rushConfiguration.commonRushConfigFolder,
          targetNpmrcFolder: autoinstallerFullPath,
          supportEnvVarFallbackSyntax: this._rushConfiguration.isPnpm
        });

        this._logIfConsoleOutputIsNotRestricted(
          `Installing dependencies under ${autoinstallerFullPath}...\n`
        );

        await Utilities.executeCommandAsync({
          command: this._rushConfiguration.packageManagerToolFilename,
          args: ['install', '--frozen-lockfile'],
          workingDirectory: autoinstallerFullPath,
          keepEnvironment: true
        });

        // Create file: ../common/autoinstallers/my-task/.rush/temp/last-install.flag
        await lastInstallFlag.createAsync();

        FileSystem.writeFile(
          flagPath,
          'If this file is deleted, Rush will assume that the node_modules folder has been cleaned and will reinstall it.'
        );

        this._logIfConsoleOutputIsNotRestricted('Auto install completed successfully\n');
      } else {
        this._logIfConsoleOutputIsNotRestricted('Autoinstaller folder is already up to date\n');
      }
    } finally {
      // Ensure the lockfile is released when we are finished.
      lock.release();
    }
  }

  public async updateAsync(): Promise<void> {
    await InstallHelpers.ensureLocalPackageManagerAsync(
      this._rushConfiguration,
      this._rushGlobalFolder,
      RushConstants.defaultMaxInstallAttempts,
      this._restrictConsoleOutput
    );

    const autoinstallerPackageJsonPath: string = path.join(this.folderFullPath, 'package.json');

    if (!(await FileSystem.existsAsync(autoinstallerPackageJsonPath))) {
      throw new Error(`The specified autoinstaller path does not exist: ` + autoinstallerPackageJsonPath);
    }

    this._logIfConsoleOutputIsNotRestricted(
      `Updating autoinstaller package: ${autoinstallerPackageJsonPath}`
    );

    let oldFileContents: string = '';

    if (await FileSystem.existsAsync(this.shrinkwrapFilePath)) {
      oldFileContents = FileSystem.readFile(this.shrinkwrapFilePath, { convertLineEndings: NewlineKind.Lf });
      this._logIfConsoleOutputIsNotRestricted('Deleting ' + this.shrinkwrapFilePath);
      await FileSystem.deleteFileAsync(this.shrinkwrapFilePath);
      if (this._rushConfiguration.isPnpm) {
        // Workaround for https://github.com/pnpm/pnpm/issues/1890
        //
        // When "rush update-autoinstaller" is run, Rush deletes "common/autoinstallers/my-task/pnpm-lock.yaml"
        // so that a new lockfile will be generated. However "pnpm install" by design will try to recover
        // "pnpm-lock.yaml" from "my-task/node_modules/.pnpm/lock.yaml", which may prevent a full upgrade.
        // Deleting both files ensures that a new lockfile will always be generated.
        const pnpmPackageManager: PnpmPackageManager = this._rushConfiguration
          .packageManagerWrapper as PnpmPackageManager;
        await FileSystem.deleteFileAsync(
          path.join(this.folderFullPath, pnpmPackageManager.internalShrinkwrapRelativePath)
        );
      }
    }

    // Detect a common mistake where PNPM prints "Already up-to-date" without creating a shrinkwrap file
    const packageJsonEditor: PackageJsonEditor = PackageJsonEditor.load(this.packageJsonPath);
    if (packageJsonEditor.dependencyList.length === 0) {
      throw new Error(
        'You must add at least one dependency to the autoinstaller package' +
          ' before invoking this command:\n' +
          this.packageJsonPath
      );
    }

    this._logIfConsoleOutputIsNotRestricted();

    Utilities.syncNpmrc({
      sourceNpmrcFolder: this._rushConfiguration.commonRushConfigFolder,
      targetNpmrcFolder: this.folderFullPath,
      supportEnvVarFallbackSyntax: this._rushConfiguration.isPnpm
    });

    await Utilities.executeCommandAsync({
      command: this._rushConfiguration.packageManagerToolFilename,
      args: ['install'],
      workingDirectory: this.folderFullPath,
      keepEnvironment: true
    });

    this._logIfConsoleOutputIsNotRestricted();

    if (this._rushConfiguration.packageManager === 'npm') {
      this._logIfConsoleOutputIsNotRestricted(Colorize.bold('Running "npm shrinkwrap"...'));
      await Utilities.executeCommandAsync({
        command: this._rushConfiguration.packageManagerToolFilename,
        args: ['shrinkwrap'],
        workingDirectory: this.folderFullPath,
        keepEnvironment: true
      });
      this._logIfConsoleOutputIsNotRestricted('"npm shrinkwrap" completed');
      this._logIfConsoleOutputIsNotRestricted();
    }

    if (!(await FileSystem.existsAsync(this.shrinkwrapFilePath))) {
      throw new Error(
        'The package manager did not create the expected shrinkwrap file: ' + this.shrinkwrapFilePath
      );
    }

    const newFileContents: string = await FileSystem.readFileAsync(this.shrinkwrapFilePath, {
      convertLineEndings: NewlineKind.Lf
    });
    if (oldFileContents !== newFileContents) {
      this._logIfConsoleOutputIsNotRestricted(
        Colorize.green('The shrinkwrap file has been updated.') + '  Please commit the updated file:'
      );
      this._logIfConsoleOutputIsNotRestricted(`\n  ${this.shrinkwrapFilePath}`);
    } else {
      this._logIfConsoleOutputIsNotRestricted(Colorize.green('Already up to date.'));
    }
  }

  private _logIfConsoleOutputIsNotRestricted(message?: string): void {
    if (!this._restrictConsoleOutput) {
      // eslint-disable-next-line no-console
      console.log(message ?? '');
    }
  }
}
