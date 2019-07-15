// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConstants } from '../RushConstants';
import { PackageJsonDependency, DependencyType } from '../../api/PackageJsonEditor';
import { CommonVersionsConfiguration } from '../../api/CommonVersionsConfiguration';
import { VersionMismatchFinderEntity } from './VersionMismatchFinderEntity';

export class VersionMismatchFinderCommonVersions extends VersionMismatchFinderEntity {
  private fileManager: CommonVersionsConfiguration;

  constructor(commonVersionsConfiguration: CommonVersionsConfiguration) {
    super({
      friendlyName: `preferred versions from ${RushConstants.commonVersionsFilename}`,
      cyclicDependencyProjects: new Set<string>()
    });

    this.fileManager = commonVersionsConfiguration;
  }

  public get filePath(): string {
    return this.fileManager.filePath;
  }

  public get allDependencies(): ReadonlyArray<PackageJsonDependency> {
    const dependencies: PackageJsonDependency[] = [];

    this.fileManager.getAllPreferredVersions().forEach((version, dependencyName) => {
      dependencies.push(this._getPackageJsonDependency(dependencyName, version));
    });

    return dependencies;
  }

  public tryGetDependency(packageName: string): PackageJsonDependency | undefined {
    const version: string | undefined = this.fileManager.getAllPreferredVersions().get(packageName);
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

    if (this.fileManager.xstitchPreferredVersions.has(packageName)) {
      this.fileManager.xstitchPreferredVersions.set(packageName, newVersion);
    } else {
      this.fileManager.preferredVersions.set(packageName, newVersion);
    }
  }

  public saveIfModified(): boolean {
    return this.fileManager.save();
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
