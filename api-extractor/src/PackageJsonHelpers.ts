/* tslint:disable:no-constant-condition */

import * as fsx from 'fs-extra';
import * as path from 'path';

/**
 * Utilities for navigating packages.
 */
export default class PackageJsonHelpers {

  /**
   * Finds the path to the package folder of a given currentPath, by probing 
   * upwards from the currentPath until a package.json file is found. 
   * If no package.json can be found, an error is raised.
   * 
   * @param currentPath - an absolute path of the current location
   * @returns an absolute path to the package folder
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
}
