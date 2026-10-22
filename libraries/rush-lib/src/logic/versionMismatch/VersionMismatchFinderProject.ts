// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { VersionMismatchFinderEntity } from './VersionMismatchFinderEntity';
import type { PackageJsonEditor, PackageJsonDependency, DependencyType } from '../../api/PackageJsonEditor';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { PnpmCatalogs } from '../pnpm/EffectivePnpmOptions';

export class VersionMismatchFinderProject extends VersionMismatchFinderEntity {
  public packageName: string;
  #fileManager: PackageJsonEditor;

  /**
   * @param pnpmCatalogs - the catalogs that are in effect for the project's subspace. If omitted, catalog
   * references (such as `catalog:`) are compared as unresolved references.
   */
  public constructor(project: RushConfigurationProject, pnpmCatalogs?: PnpmCatalogs) {
    super({
      friendlyName: project.packageName,
      decoupledLocalDependencies: project.decoupledLocalDependencies,
      skipRushCheck: project.skipRushCheck,
      pnpmCatalogs
    });

    this.#fileManager = project.packageJsonEditor;
    this.packageName = project.packageName;
  }

  public get filePath(): string {
    return this.#fileManager.filePath;
  }

  public get allDependencies(): ReadonlyArray<PackageJsonDependency> {
    return [...this.#fileManager.dependencyList, ...this.#fileManager.devDependencyList];
  }

  public tryGetDependency(packageName: string): PackageJsonDependency | undefined {
    return this.#fileManager.tryGetDependency(packageName);
  }

  public tryGetDevDependency(packageName: string): PackageJsonDependency | undefined {
    return this.#fileManager.tryGetDevDependency(packageName);
  }

  public addOrUpdateDependency(
    packageName: string,
    newVersion: string,
    dependencyType: DependencyType
  ): void {
    return this.#fileManager.addOrUpdateDependency(packageName, newVersion, dependencyType);
  }

  public removeDependency(packageName: string, dependencyType: DependencyType): void {
    return this.#fileManager.removeDependency(packageName, dependencyType);
  }

  public async saveIfModifiedAsync(): Promise<boolean> {
    return await this.#fileManager.saveIfModifiedAsync();
  }
}
