// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as semver from 'semver';
import npmPackageArg = require('npm-package-arg');
import { PackageName, FileSystem } from '@microsoft/node-core-library';

import { RushConstants } from '../../logic/RushConstants';

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
  public hasCompatibleTopLevelDependency(dependencyName: string, versionRange: string): boolean {
    const dependencyVersion: string | undefined = this.getTopLevelDependencyVersion(dependencyName);
    if (!dependencyVersion) {
      return false;
    }

    return this._checkDependencyVerson(dependencyName, versionRange, dependencyVersion);
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
  public tryEnsureCompatibleDependency(dependencyName: string, versionRange: string, tempProjectName: string): boolean {
    const dependencyVersion: string | undefined =
      this.tryEnsureDependencyVersion(dependencyName, tempProjectName, versionRange);
    if (!dependencyVersion) {
      return false;
    }

    return this._checkDependencyVerson(dependencyName, versionRange, dependencyVersion);
  }

  /**
   * Returns the list of temp projects defined in this file.
   * Example: [ '@rush-temp/project1', '@rush-temp/project2' ]
   */
  public abstract getTempProjectNames(): ReadonlyArray<string>;

  protected abstract getTopLevelDependencyVersion(dependencyName: string): string | undefined;

  protected abstract tryEnsureDependencyVersion(dependencyName: string,
    tempProjectName: string, versionRange: string): string | undefined;
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

  protected checkValidVersionRange(dependencyVersion: string, versionRange: string): boolean {
    // If it's a SemVer pattern, then require that the shrinkwrapped version must be compatible
    return semver.satisfies(dependencyVersion, versionRange);
  }

  private _checkDependencyVerson(dependencyName: string, versionRange: string, dependencyVersion: string): boolean {
    const result: npmPackageArg.IResult = npmPackageArg.resolve(dependencyName, versionRange);
    switch (result.type) {
      case 'version':
      case 'range':
        return this.checkValidVersionRange(dependencyVersion, versionRange);
      default:
        // Only warn once for each spec
        if (!this._alreadyWarnedSpecs.has(result.rawSpec)) {
          this._alreadyWarnedSpecs.add(result.rawSpec);
          console.log(colors.yellow(`WARNING: Not validating ${result.type}-based specifier: "${result.rawSpec}"`));
        }
        return true;
    }
  }
}
