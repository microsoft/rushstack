// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { VersionMismatchFinderEntity } from './VersionMismatchFinderEntity.ts';
import type {
  PackageJsonEditor,
  PackageJsonDependency,
  DependencyType
} from '../../api/PackageJsonEditor.ts';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject.ts';

export class VersionMismatchFinderProject extends VersionMismatchFinderEntity {
  public packageName: string;
  private _fileManager: PackageJsonEditor;

  public constructor(project: RushConfigurationProject) {
    super({
      friendlyName: project.packageName,
      decoupledLocalDependencies: project.decoupledLocalDependencies,
      skipRushCheck: project.skipRushCheck
    });

    this._fileManager = project.packageJsonEditor;
    this.packageName = project.packageName;
  }

  public get filePath(): string {
    return this._fileManager.filePath;
  }

  public get allDependencies(): ReadonlyArray<PackageJsonDependency> {
    return [...this._fileManager.dependencyList, ...this._fileManager.devDependencyList];
  }

  public tryGetDependency(packageName: string): PackageJsonDependency | undefined {
    return this._fileManager.tryGetDependency(packageName);
  }

  public tryGetDevDependency(packageName: string): PackageJsonDependency | undefined {
    return this._fileManager.tryGetDevDependency(packageName);
  }

  public addOrUpdateDependency(
    packageName: string,
    newVersion: string,
    dependencyType: DependencyType
  ): void {
    return this._fileManager.addOrUpdateDependency(packageName, newVersion, dependencyType);
  }

  public removeDependency(packageName: string, dependencyType: DependencyType): void {
    return this._fileManager.removeDependency(packageName, dependencyType);
  }

  public saveIfModified(): boolean {
    return this._fileManager.saveIfModified();
  }
}
