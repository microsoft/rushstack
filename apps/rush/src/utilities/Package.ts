// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import readPackageTree = require('read-package-tree');
import { JsonFile } from '@microsoft/node-core-library';
import { IPackageJson } from '@microsoft/rush-lib';

/**
 * Represents a "@rush-temp" scoped package, which has our additional custom field
 * for tracking the dependency graph.
 */
export interface IRushTempPackageJson extends IPackageJson {
  /**
   * An extra setting written into package.json for temp packages, to track
   * references to locally built projects.
   */
  rushDependencies?: { [key: string]: string };
}

/**
 * Represents an NPM package being processed by the "rush link" algorithm.
 */
export default class Package {
  /**
   * The "name" field from package.json
   */
  public name: string;

  /**
   * The "version" field from package.json
   */
  public version: string;

  /**
   * The absolute path to the folder that contains package.json.
   */
  public folderPath: string;

  public packageJson: IRushTempPackageJson;

  /**
   * If this is a local path that we are planning to symlink to a target folder,
   * then symlinkTargetFolderPath keeps track of the intended target.
   */
  public symlinkTargetFolderPath: string = undefined;

  /**
   * Used by "npm link" when creating a Package object that represents symbolic links to be created.
   */
  public static createLinkedPackage(name: string,
    version: string,
    folderPath: string,
    packageJson?: IRushTempPackageJson): Package {
    return new Package(name, version, folderPath, packageJson);
  }

  /**
   * Used by "npm link" to simulate a temp project that is missing from the common/node_modules
   * folder (e.g. because it was added after the shrinkwrap file was regenerated).
   * @param packageJsonFilename - Filename of the source package.json
   *        Example: c:\MyRepo\common\temp\projects\project1\package.json
   * @param targetFolderName - Filename where it should have been installed
   *        Example: c:\MyRepo\common\temp\node_modules\@rush-temp\project1
   */
  public static createVirtualTempPackage(packageJsonFilename: string, installFolderName: string): Package {
    const packageJson: IRushTempPackageJson = JsonFile.load(packageJsonFilename);
    return Package.createLinkedPackage(name, packageJson.version, installFolderName, packageJson);
  }

  public get nameAndVersion(): string {
    let result: string = '';

    if (this.name) {
      result += this.name;
    } else {
      result += '(missing name)';
    }
    result += '@';
    if (this.version) {
      result += this.version;
    } else {
      result += '(missing version)';
    }
    return result;
  }

  private constructor(name: string,
    version: string,
    folderPath: string,
    packageJson: IRushTempPackageJson) {

    this.name = name;
    this.packageJson = packageJson;
    this.version = packageJson.version;
    this.folderPath = folderPath;
  }
}
