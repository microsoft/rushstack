// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';

import { Colorize, type ITerminal } from '@rushstack/terminal';

import { RushConstants } from '../RushConstants';
import { type DependencySpecifier, DependencySpecifierType } from '../DependencySpecifier';
import type { IShrinkwrapFilePolicyValidatorOptions } from '../policy/ShrinkwrapFilePolicy';
import type { RushConfiguration } from '../../api/RushConfiguration';
import { PackageNameParsers } from '../../api/PackageNameParsers';
import type { IExperimentsJson } from '../../api/ExperimentsConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { BaseProjectShrinkwrapFile } from './BaseProjectShrinkwrapFile';
import type { PackageManagerOptionsConfigurationBase } from './BasePackageManagerOptionsConfiguration';
import type { Subspace } from '../../api/Subspace';

/**
 * This class is a parser for both npm's npm-shrinkwrap.json and pnpm's pnpm-lock.yaml file formats.
 */
export abstract class BaseShrinkwrapFile {
  public abstract readonly isWorkspaceCompatible: boolean;
  protected _alreadyWarnedSpecs: Set<string> = new Set<string>();

  protected static tryGetValue<T>(dictionary: { [key2: string]: T }, key: string): T | undefined {
    if (dictionary.hasOwnProperty(key)) {
      return dictionary[key];
    }
    return undefined;
  }

  /**
   * Determine whether `pnpm-lock.yaml` complies with the rules specified in `common/config/rush/pnpm-config.schema.json`.
   *
   * @virtual
   */
  public validateShrinkwrapAfterUpdateAsync(
    rushConfiguration: RushConfiguration,
    subspace: Subspace,
    terminal: ITerminal
  ): void {}

  /**
   * Validate the shrinkwrap using the provided policy options.
   *
   * @virtual
   */
  public validate(
    packageManagerOptionsConfig: PackageManagerOptionsConfigurationBase,
    policyOptions: IShrinkwrapFilePolicyValidatorOptions,
    experimentsConfig?: IExperimentsJson
  ): void {}

  /**
   * Returns true if the shrinkwrap file includes a top-level package that would satisfy the specified
   * package name and SemVer version range
   *
   * @virtual
   */
  public async hasCompatibleTopLevelDependencyAsync(
    dependencySpecifier: DependencySpecifier
  ): Promise<boolean> {
    const shrinkwrapDependency: DependencySpecifier | undefined =
      await this.getTopLevelDependencyVersionAsync(dependencySpecifier.packageName);
    if (!shrinkwrapDependency) {
      return false;
    }

    return this._checkDependencyVersion(dependencySpecifier, shrinkwrapDependency);
  }

  /**
   * Returns true if the shrinkwrap file includes a package that would satisfying the specified
   * package name and SemVer version range.  By default, the dependencies are resolved by looking
   * at the root of the node_modules folder described by the shrinkwrap file.  However, if
   * tempProjectName is specified, then the resolution will start in that subfolder.
   *
   * Consider this example:
   *
   * - node_modules\
   *   - temp-project\
   *     - lib-a@1.2.3
   *     - lib-b@1.0.0
   *   - lib-b@2.0.0
   *
   * In this example, hasCompatibleDependency("lib-b", ">= 1.1.0", "temp-project") would fail
   * because it finds lib-b@1.0.0 which does not satisfy the pattern ">= 1.1.0".
   *
   * @virtual
   */
  public async tryEnsureCompatibleDependencyAsync(
    dependencySpecifier: DependencySpecifier,
    tempProjectName: string
  ): Promise<boolean> {
    const shrinkwrapDependency: DependencySpecifier | undefined = await this.tryEnsureDependencyVersionAsync(
      dependencySpecifier,
      tempProjectName
    );
    if (!shrinkwrapDependency) {
      return false;
    }

    return this._checkDependencyVersion(dependencySpecifier, shrinkwrapDependency);
  }

  /**
   * Returns the list of temp projects defined in this file.
   * Example: [ '@rush-temp/project1', '@rush-temp/project2' ]
   *
   * @virtual
   */
  public abstract getTempProjectNames(): ReadonlyArray<string>;

  /** @virtual */
  protected abstract tryEnsureDependencyVersionAsync(
    dependencySpecifier: DependencySpecifier,
    tempProjectName: string
  ): Promise<DependencySpecifier | undefined>;

  /** @virtual */
  protected abstract getTopLevelDependencyVersionAsync(
    dependencyName: string
  ): Promise<DependencySpecifier | undefined>;

  /**
   * Check for projects that exist in the shrinkwrap file, but don't exist
   * in rush.json.  This might occur, e.g. if a project was recently deleted or renamed.
   *
   * @returns a list of orphaned projects.
   */
  public findOrphanedProjects(
    rushConfiguration: RushConfiguration,
    subspace: Subspace
  ): ReadonlyArray<string> {
    const orphanedProjectNames: string[] = [];
    // We can recognize temp projects because they are under the "@rush-temp" NPM scope.
    for (const tempProjectName of this.getTempProjectNames()) {
      if (!rushConfiguration.findProjectByTempName(tempProjectName)) {
        orphanedProjectNames.push(tempProjectName);
      }
    }
    return orphanedProjectNames;
  }

  /**
   * Returns a project shrinkwrap file for the specified project that contains all dependencies and transitive
   * dependencies.
   *
   * @virtual
   **/
  public abstract getProjectShrinkwrap(
    project: RushConfigurationProject
  ): BaseProjectShrinkwrapFile<BaseShrinkwrapFile> | undefined;

  /**
   * Returns whether or not the workspace specified by the shrinkwrap matches the state of
   * a given package.json. Returns true if any dependencies are not aligned with the shrinkwrap.
   *
   * @param project - the Rush project that is being validated against the shrinkwrap
   * @param variant - the variant that is being validated
   *
   * @virtual
   */
  public abstract isWorkspaceProjectModifiedAsync(
    project: RushConfigurationProject,
    subspace: Subspace,
    variant: string | undefined
  ): Promise<boolean>;

  /** @virtual */
  protected abstract serialize(): string;

  protected _getTempProjectNames(dependencies: { [key: string]: {} }): ReadonlyArray<string> {
    const result: string[] = [];
    for (const key of Object.keys(dependencies)) {
      // If it starts with @rush-temp, then include it:
      if (PackageNameParsers.permissive.getScope(key) === RushConstants.rushTempNpmScope) {
        result.push(key);
      }
    }
    result.sort(); // make the result deterministic
    return result;
  }

  private _checkDependencyVersion(
    projectDependency: DependencySpecifier,
    shrinkwrapDependency: DependencySpecifier
  ): boolean {
    let normalizedProjectDependency: DependencySpecifier = projectDependency;
    let normalizedShrinkwrapDependency: DependencySpecifier = shrinkwrapDependency;

    // Special handling for NPM package aliases such as this:
    //
    // "dependencies": {
    //   "alias-name": "npm:target-name@^1.2.3"
    // }
    //
    // In this case, the shrinkwrap file will have a key equivalent to "npm:target-name@1.2.5",
    // and so we need to unwrap the target and compare "1.2.5" with "^1.2.3".
    if (projectDependency.specifierType === DependencySpecifierType.Alias) {
      // Does the shrinkwrap install it as an alias?
      if (shrinkwrapDependency.specifierType === DependencySpecifierType.Alias) {
        // Does the shrinkwrap have the right package name?
        if (projectDependency.packageName === shrinkwrapDependency.packageName) {
          // Yes, the aliases match, so let's compare their targets in the logic below
          normalizedProjectDependency = projectDependency.aliasTarget!;
          normalizedShrinkwrapDependency = shrinkwrapDependency.aliasTarget!;
        } else {
          // If the names are different, then it's a mismatch
          return false;
        }
      } else {
        // A non-alias cannot satisfy an alias dependency; at least, let's avoid that idea
        return false;
      }
    }

    switch (normalizedProjectDependency.specifierType) {
      case DependencySpecifierType.Version:
      case DependencySpecifierType.Range:
        return semver.satisfies(
          normalizedShrinkwrapDependency.versionSpecifier,
          normalizedProjectDependency.versionSpecifier
        );
      default:
        // For other version specifier types like "file:./blah.tgz" or "git://github.com/npm/cli.git#v1.0.27"
        // we allow the installation to continue but issue a warning.  The "rush install" checks will not work
        // correctly.

        // Only warn once for each versionSpecifier
        if (!this._alreadyWarnedSpecs.has(projectDependency.versionSpecifier)) {
          this._alreadyWarnedSpecs.add(projectDependency.versionSpecifier);
          // eslint-disable-next-line no-console
          console.log(
            Colorize.yellow(
              `WARNING: Not validating ${projectDependency.specifierType}-based` +
                ` specifier: "${projectDependency.versionSpecifier}"`
            )
          );
        }
        return true;
    }
  }
}
