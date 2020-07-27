// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as path from 'path';

import { FileSystem, NewlineKind } from '@rushstack/node-core-library';
import { Utilities } from '../utilities/Utilities';

import { PackageName, IParsedPackageNameOrError } from '@rushstack/node-core-library';
import { RushConfiguration } from '../api/RushConfiguration';
import { PackageJsonEditor } from '../api/PackageJsonEditor';

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

    Utilities.executeCommand({
      command: this._rushConfiguration.packageManagerToolFilename,
      args: ['install'],
      workingDirectory: this.folderFullPath,
      keepEnvironment: true
    });

    console.log();

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
