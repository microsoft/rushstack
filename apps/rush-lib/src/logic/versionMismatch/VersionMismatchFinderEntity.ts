// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  PackageJsonDependency,
  DependencyType
} from '../../api/PackageJsonEditor';

export interface IVersionMismatchFinderEntityOptions {
  friendlyName: string;
  cyclicDependencyProjects: Set<string>;
  skipRushCheck?: boolean;
}

export abstract class VersionMismatchFinderEntity {
  public readonly friendlyName: string;
  public readonly cyclicDependencyProjects: Set<string>;
  public readonly skipRushCheck: boolean | undefined;

  public abstract filePath: string;
  public abstract allDependencies: ReadonlyArray<PackageJsonDependency>;

  constructor(options: IVersionMismatchFinderEntityOptions) {
    this.friendlyName = options.friendlyName;
    this.cyclicDependencyProjects = options.cyclicDependencyProjects;
    this.skipRushCheck = options.skipRushCheck;
  }

  public abstract tryGetDependency(packageName: string): PackageJsonDependency | undefined;
  public abstract tryGetDevDependency(packageName: string): PackageJsonDependency | undefined;
  public abstract addOrUpdateDependency(packageName: string, newVersion: string, dependencyType: DependencyType): void;
  public abstract saveIfModified(): boolean;
}