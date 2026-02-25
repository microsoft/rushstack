// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConstants } from '../RushConstants.ts';
import { PackageJsonDependency, DependencyType } from '../../api/PackageJsonEditor.ts';
import type { CommonVersionsConfiguration } from '../../api/CommonVersionsConfiguration.ts';
import { VersionMismatchFinderEntity } from './VersionMismatchFinderEntity.ts';

export class VersionMismatchFinderCommonVersions extends VersionMismatchFinderEntity {
  private _fileManager: CommonVersionsConfiguration;

  public constructor(commonVersionsConfiguration: CommonVersionsConfiguration) {
    super({
      friendlyName: `preferred versions from ${RushConstants.commonVersionsFilename}`,
      decoupledLocalDependencies: new Set<string>()
    });

    this._fileManager = commonVersionsConfiguration;
  }

  public get filePath(): string {
    return this._fileManager.filePath;
  }

  public get allDependencies(): ReadonlyArray<PackageJsonDependency> {
    const dependencies: PackageJsonDependency[] = [];

    this._fileManager.getAllPreferredVersions().forEach((version, dependencyName) => {
      dependencies.push(this._getPackageJsonDependency(dependencyName, version));
    });

    return dependencies;
  }

  public tryGetDependency(packageName: string): PackageJsonDependency | undefined {
    const version: string | undefined = this._fileManager.getAllPreferredVersions().get(packageName);
    if (!version) {
      return undefined;
    } else {
      return this._getPackageJsonDependency(packageName, version);
    }
  }

  public tryGetDevDependency(packageName: string): PackageJsonDependency | undefined {
    return undefined; // common-versions.json doesn't have a distinction between dev and non-dev dependencies
  }

  public addOrUpdateDependency(
    packageName: string,
    newVersion: string,
    dependencyType: DependencyType
  ): void {
    if (dependencyType !== DependencyType.Regular) {
      throw new Error(
        `${RushConstants.commonVersionsFilename} only accepts "${DependencyType.Regular}" dependencies`
      );
    }

    this._fileManager.preferredVersions.set(packageName, newVersion);
  }

  public removeDependency(packageName: string): void {
    throw new Error('Not supported.');
  }

  public saveIfModified(): boolean {
    return this._fileManager.save();
  }

  private _getPackageJsonDependency(dependencyName: string, version: string): PackageJsonDependency {
    return new PackageJsonDependency(dependencyName, version, DependencyType.Regular, () =>
      this.addOrUpdateDependency(dependencyName, version, DependencyType.Regular)
    );
  }
}
