// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConstants } from '../RushConstants';
import { PackageJsonDependency, DependencyType } from '../../api/PackageJsonEditor';
import type { CommonVersionsConfiguration } from '../../api/CommonVersionsConfiguration';
import { VersionMismatchFinderEntity } from './VersionMismatchFinderEntity';

export class VersionMismatchFinderCommonVersions extends VersionMismatchFinderEntity {
  #fileManager: CommonVersionsConfiguration;

  public constructor(commonVersionsConfiguration: CommonVersionsConfiguration) {
    super({
      friendlyName: `preferred versions from ${RushConstants.commonVersionsFilename}`,
      decoupledLocalDependencies: new Set<string>()
    });

    this.#fileManager = commonVersionsConfiguration;
  }

  public get filePath(): string {
    return this.#fileManager.filePath;
  }

  public get allDependencies(): ReadonlyArray<PackageJsonDependency> {
    const dependencies: PackageJsonDependency[] = [];

    this.#fileManager.getAllPreferredVersions().forEach((version, dependencyName) => {
      dependencies.push(this.#getPackageJsonDependency(dependencyName, version));
    });

    return dependencies;
  }

  public tryGetDependency(packageName: string): PackageJsonDependency | undefined {
    const version: string | undefined = this.#fileManager.getAllPreferredVersions().get(packageName);
    if (!version) {
      return undefined;
    } else {
      return this.#getPackageJsonDependency(packageName, version);
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

    this.#fileManager.preferredVersions.set(packageName, newVersion);
  }

  public removeDependency(packageName: string): void {
    throw new Error('Not supported.');
  }

  public async saveIfModifiedAsync(): Promise<boolean> {
    return await this.#fileManager.saveAsync();
  }

  #getPackageJsonDependency(dependencyName: string, version: string): PackageJsonDependency {
    return new PackageJsonDependency(dependencyName, version, DependencyType.Regular, () =>
      this.addOrUpdateDependency(dependencyName, version, DependencyType.Regular)
    );
  }
}
