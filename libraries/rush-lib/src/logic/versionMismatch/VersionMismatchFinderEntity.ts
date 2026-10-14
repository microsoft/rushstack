// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { PackageJsonDependency, DependencyType } from '../../api/PackageJsonEditor';
import type { PnpmCatalogs } from '../pnpm/EffectivePnpmOptions';

export interface IVersionMismatchFinderEntityOptions {
  friendlyName: string;
  decoupledLocalDependencies: Set<string>;
  skipRushCheck?: boolean;
  /**
   * The PNPM catalogs that resolve the entity's catalog references (such as `catalog:`), as returned by
   * `getEffectivePnpmCatalogs()` for the subspace of the project.
   */
  pnpmCatalogs?: PnpmCatalogs;
}

export abstract class VersionMismatchFinderEntity {
  public readonly friendlyName: string;
  public readonly decoupledLocalDependencies: Set<string>;
  public readonly skipRushCheck: boolean | undefined;
  public readonly pnpmCatalogs: PnpmCatalogs | undefined;

  public constructor(options: IVersionMismatchFinderEntityOptions) {
    const { friendlyName, decoupledLocalDependencies, skipRushCheck, pnpmCatalogs } = options;
    this.friendlyName = friendlyName;
    this.decoupledLocalDependencies = decoupledLocalDependencies;
    this.skipRushCheck = skipRushCheck;
    this.pnpmCatalogs = pnpmCatalogs;
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
