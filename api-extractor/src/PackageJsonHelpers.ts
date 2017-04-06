/* tslint:disable:no-constant-condition */

import * as fsx from 'fs-extra';
import * as path from 'path';
import JsonFile from './JsonFile';

/**
 * Represents a package.json file.
 */
interface IPackageJson {
  name: string;
}

/**
 * Utilities for navigating packages.
 */
export default class PackageJsonHelpers {

  /**
   * Finds the path to the package folder of a given currentPath, by probing 
   * upwards from the currentPath until a package.json file is found. 
   * If no package.json can be found, undefined is returned.
   * 
   * @param currentPath - a path (relative or absolute) of the current location
   * @returns a relative path to the package folder
   */
  public static tryFindPackagePathUpwards(currentPath: string): string {
    let packageFolder: string = '';

    // no-constant-condition
    while (true) {
      const folder: string = path.dirname(currentPath);
      if (!folder || folder === currentPath) {
        return undefined;
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
  public static readPackageName(packageJsonPath: string): string {
    const packageJson: IPackageJson = JsonFile.loadJsonFile(path.join(packageJsonPath, 'package.json')) as IPackageJson;
    return packageJson.name;
  }
}
