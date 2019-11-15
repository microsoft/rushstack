// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { GulpTask } from './GulpTask';
import gulpType = require('gulp');
import * as path from 'path';
import * as semver from 'semver';
import { FileConstants } from '@microsoft/node-core-library';

interface IShrinkwrapDep {
  [name: string]: { version: string }
};

interface IPackageDep {
  [name: string]: string
};

/**
 * Partial representation of the contents of a `package.json` file
 */
interface INpmPackage {
  dependencies: IPackageDep;
  devDependencies: IPackageDep;
}

/**
 * Partial representation of the contents of an `npm-shrinkwrap.json` file
 */
interface INpmShrinkwrap {
  dependencies: IShrinkwrapDep;
}

/**
 * This task attempts to detect if package.json file has been updated without the
 * shrinkwrap file being regenerated.
 *
 * It does this by checking that every dependency and dev dependency exists in the
 * shrinkwrap file and that the version in the shrinkwrap file satisfies what is
 * defined in the package.json file.
 * @public
 */
export class ValidateShrinkwrapTask extends GulpTask<void> {
  /**
   * Instantiates an instance of the ValidateShrinkwrap task
   */
  public constructor() {
    super('validate-shrinkwrap');
  }

  /**
   * Iterates through dependencies listed in a project's package.json and ensures that they are all
   * resolvable in the npm-shrinkwrap file.
   */
  public executeTask(gulp: gulpType.Gulp, completeCallback: (error: string) => void): NodeJS.ReadWriteStream | void {
    const pathToPackageJson: string = path.join(this.buildConfig.rootPath, FileConstants.PackageJson);
    const pathToShrinkwrap: string = path.join(this.buildConfig.rootPath, 'npm-shrinkwrap.json');

    if (!this.fileExists(pathToPackageJson)) {
      this.logError('Failed to find package.json at ' + pathToPackageJson);
      return;
    } else if (!this.fileExists(pathToShrinkwrap)) {
      this.logError('Failed to find package.json at ' + pathToShrinkwrap);
      return;
    }

    // eslint-disable-next-line
    const packageJson: INpmPackage = require(pathToPackageJson);
    // eslint-disable-next-line
    const shrinkwrapJson: INpmShrinkwrap = require(pathToShrinkwrap);

    this._validate(packageJson.dependencies, shrinkwrapJson.dependencies);
    this._validate(packageJson.devDependencies, shrinkwrapJson.dependencies);

    return;
  }

  private _validate(packageDep: IPackageDep, shrinkwrapDep: IShrinkwrapDep): void {
    for (const pkg in packageDep) {
      if (!shrinkwrapDep.hasOwnProperty(pkg)) {
        this.logError(`Failed to find package ${pkg} in shrinkwrap file`);
      } else if (!semver.satisfies(shrinkwrapDep[pkg].version, packageDep[pkg])) {
        this.logError(`Shrinkwrap version for ${pkg} (${shrinkwrapDep[pkg].version}) does not
          satisfy package.json version of ${packageDep[pkg]}.`);
      }
    }
  }
}
