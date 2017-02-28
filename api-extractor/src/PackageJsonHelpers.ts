/* tslint:disable:no-constant-condition */

import * as fsx from 'fs-extra';
import * as path from 'path';

/**
 * Represents a package.json file.
 */
export interface IPackageJson {
  name: string;
}

/**
 * Utilities for navigating packages.
 */
export default class PackageJsonHelpers {

  /**
   * Finds the path to the package folder of a given currentPath, by probing 
   * upwards from the currentPath until a package.json file is found. 
   * If no package.json can be found, an error is raised.
   * 
   * @param currentPath - a path (relative or absolute) of the current location
   * @returns a relative path to the package folder
   */
  public static findPackagePathUpwards(currentPath: string): string {
    let packageFolder: string = '';

    // no-constant-condition
    while (true) {
      const folder: string = path.dirname(currentPath);
      if (folder === currentPath || !folder) {
        throw new Error('Unable to determine package folder for entryPointFile');
      }
      currentPath = folder;
      if (fsx.existsSync(path.join(currentPath, 'package.json'))) {
        packageFolder = path.normalize(currentPath);
        break;
      }
    }
    return packageFolder;
  }

  /**
   * Loads the package.json file and returns the name of the package.
   * 
   * @param packageJsonPath - an absolute path to the folder containing the 
   * package.json file, it does not include the 'package.json' suffix.
   * @returns the name of the package (E.g. @microsoft/api-extractor)
   */
  public static getPackageName(packageJsonPath: string): string {
    const packageJson: IPackageJson = require(path.join(packageJsonPath, 'package.json'));
    return packageJson.name;
  }
}
