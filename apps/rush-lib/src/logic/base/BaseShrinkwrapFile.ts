// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as semver from 'semver';
import { PackageName, FileSystem } from '@microsoft/node-core-library';

import { RushConstants } from '../../logic/RushConstants';
import { DependencySpecifier } from '../DependencySpecifier';

/**
 * This class is a parser for both npm's npm-shrinkwrap.json and pnpm's pnpm-lock.yaml file formats.
 */
export abstract class BaseShrinkwrapFile {
  protected _alreadyWarnedSpecs: Set<string> = new Set<string>();

  protected static tryGetValue<T>(dictionary: { [key2: string]: T }, key: string): T | undefined {
    if (dictionary.hasOwnProperty(key)) {
      return dictionary[key];
    }
    return undefined;
  }

  /**
   * Serializes and saves the shrinkwrap file to specified location
   */
  public save(filePath: string): void {
    FileSystem.writeFile(filePath, this.serialize());
  }

  /**
   * Returns true if the shrinkwrap file includes a top-level package that would satisfy the specified
   * package name and SemVer version range
   *
   * @virtual
   */
  public hasCompatibleTopLevelDependency(dependencySpecifier: DependencySpecifier): boolean {
    const shrinkwrapDependency: DependencySpecifier | undefined
      = this.getTopLevelDependencyVersion(dependencySpecifier.packageName);
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
  public tryEnsureCompatibleDependency(dependencySpecifier: DependencySpecifier, tempProjectName: string): boolean {
    const shrinkwrapDependency: DependencySpecifier | undefined =
      this.tryEnsureDependencyVersion(dependencySpecifier, tempProjectName);
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
  protected abstract tryEnsureDependencyVersion(dependencySpecifier: DependencySpecifier,
    tempProjectName: string): DependencySpecifier | undefined;

  /** @virtual */
  protected abstract getTopLevelDependencyVersion(dependencyName: string): DependencySpecifier | undefined;

  /** @virtual */
  protected abstract serialize(): string;

  protected _getTempProjectNames(dependencies: { [key: string]: {} } ): ReadonlyArray<string> {
    const result: string[] = [];
    for (const key of Object.keys(dependencies)) {
      // If it starts with @rush-temp, then include it:
      if (PackageName.getScope(key) === RushConstants.rushTempNpmScope) {
        result.push(key);
      }
    }
    result.sort();  // make the result deterministic
    return result;
  }

  private _checkDependencyVersion(projectDependency: DependencySpecifier,
    shrinkwrapDependency: DependencySpecifier): boolean {

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
    if (projectDependency.specifierType === 'alias') {
      // Does the shrinkwrap install it as an alias?
      if (shrinkwrapDependency.specifierType === 'alias') {
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
      case 'version':
      case 'range':
        return semver.satisfies(normalizedShrinkwrapDependency.versionSpecifier,
          normalizedProjectDependency.versionSpecifier);
      default:
        // For other version specifier types like "file:./blah.tgz" or "git://github.com/npm/cli.git#v1.0.27"
        // we allow the installation to continue but issue a warning.  The "rush install" checks will not work
        // correctly.

        // Only warn once for each versionSpecifier
        if (!this._alreadyWarnedSpecs.has(projectDependency.versionSpecifier)) {
          this._alreadyWarnedSpecs.add(projectDependency.versionSpecifier);
          console.log(colors.yellow(`WARNING: Not validating ${projectDependency.specifierType}-based`
            + ` specifier: "${projectDependency.versionSpecifier}"`));
        }
        return true;
    }
  }
}
