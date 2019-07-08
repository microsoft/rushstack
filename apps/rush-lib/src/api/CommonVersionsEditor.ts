// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IDependencyFileEditor, PackageJsonDependency, DependencyType } from './PackageJsonEditor';
import { CommonVersionsConfiguration } from './CommonVersionsConfiguration';
import { RushConstants } from '../logic/RushConstants';

export class CommonVersionsEditor implements IDependencyFileEditor {
  private _commonVersionsConfiguration: CommonVersionsConfiguration;

  public constructor(commonVersionsConfiguration: CommonVersionsConfiguration) {
    this._commonVersionsConfiguration = commonVersionsConfiguration;
  }

  public get filePath(): string {
    return this._commonVersionsConfiguration.filePath;
  }

  public get allDependencies(): ReadonlyArray<PackageJsonDependency> {
    const dependencies: PackageJsonDependency[] = [];

    this._commonVersionsConfiguration.getAllPreferredVersions().forEach((version, dependencyName) => {
      dependencies.push(this._getPackageJsonDependency(dependencyName, version));
    });

    return dependencies;
  }

  public tryGetDependency(packageName: string): PackageJsonDependency | undefined {
    const version: string | undefined = this._commonVersionsConfiguration.getAllPreferredVersions().get(packageName);
    if (!version) {
      return undefined;
    } else {
      return this._getPackageJsonDependency(packageName, version);
    }
  }

  public tryGetDevDependency(packageName: string): PackageJsonDependency | undefined {
    return undefined; // common-versions.json doesn't have a distinction between dev and non-dev dependencies
  }

  public addOrUpdateDependency(packageName: string, newVersion: string, dependencyType: DependencyType): void {
    if (dependencyType !== DependencyType.Regular) {
      throw new Error(`${RushConstants.commonVersionsFilename} only accepts "${DependencyType.Regular}" dependencies`);
    }

    if (this._commonVersionsConfiguration.xstitchPreferredVersions.has(packageName)) {
      this._commonVersionsConfiguration.xstitchPreferredVersions.set(packageName, newVersion);
    } else {
      this._commonVersionsConfiguration.preferredVersions.set(packageName, newVersion);
    }
  }

  public saveIfModified(): boolean {
    return this._commonVersionsConfiguration.save();
  }

  private _getPackageJsonDependency(dependencyName: string, version: string): PackageJsonDependency {
    return new PackageJsonDependency(
      dependencyName,
      version,
      DependencyType.Regular,
      () => this.addOrUpdateDependency(dependencyName, version, DependencyType.Regular)
    );
  }
}
