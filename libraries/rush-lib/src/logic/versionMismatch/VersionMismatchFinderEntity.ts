// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { PackageJsonDependency, DependencyType } from '../../api/PackageJsonEditor';

export interface IVersionMismatchFinderEntityOptions {
  friendlyName: string;
  decoupledLocalDependencies: Set<string>;
  skipRushCheck?: boolean;
}

export abstract class VersionMismatchFinderEntity {
  public readonly friendlyName: string;
  public readonly decoupledLocalDependencies: Set<string>;
  public readonly skipRushCheck: boolean | undefined;

  public constructor(options: IVersionMismatchFinderEntityOptions) {
    const { friendlyName, decoupledLocalDependencies, skipRushCheck } = options;
    this.friendlyName = friendlyName;
    this.decoupledLocalDependencies = decoupledLocalDependencies;
    this.skipRushCheck = skipRushCheck;
  }

  public abstract get filePath(): string;
  public abstract get allDependencies(): ReadonlyArray<PackageJsonDependency>;

  public abstract tryGetDependency(packageName: string): PackageJsonDependency | undefined;
  public abstract tryGetDevDependency(packageName: string): PackageJsonDependency | undefined;
  public abstract addOrUpdateDependency(
    packageName: string,
    newVersion: string,
    dependencyType: DependencyType
  ): void;
  public abstract removeDependency(packageName: string, dependencyType: DependencyType): void;
  public abstract saveIfModifiedAsync(): Promise<boolean>;
}
