// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as semver from 'semver';
import npmPackageArg = require('npm-package-arg');

/**
 * This class is a parser for NPM's npm-shrinkwrap.json file format.
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
   * Returns true if the shrinkwrap file includes a package that would satisfiying the specified
   * package name and SemVer version range.
   */
  public hasCompatibleDependency(dependencyName: string, versionRange: string, tempProjectName?: string): boolean {
    const dependencyVersion: string | undefined = this.getDependencyVersion(dependencyName, tempProjectName);
    if (!dependencyVersion) {
      return false;
    }

    const result: npmPackageArg.IResult = npmPackageArg.resolve(dependencyName, versionRange);
    switch (result.type) {
      case 'version':
      case 'range':
        // If it's a SemVer pattern, then require that the shrinkwrapped version must be compatible
        return semver.satisfies(dependencyVersion, versionRange);
      default:
        // Only warn once for each spec
        if (!this._alreadyWarnedSpecs.has(result.rawSpec)) {
          this._alreadyWarnedSpecs.add(result.rawSpec);
          console.log(colors.yellow(`WARNING: Not validating ${result.type}-based specifier: "${result.rawSpec}"`));
        }
        return true;
    }
  }

  /**
   * Returns the list of temp projects defined in this file.
   * Example: [ '@rush-temp/project1', '@rush-temp/project2' ]
   */
  public abstract getTempProjectNames(): ReadonlyArray<string>;

  protected abstract getDependencyVersion(dependencyName: string, tempProjectName?: string): string | undefined;
}
