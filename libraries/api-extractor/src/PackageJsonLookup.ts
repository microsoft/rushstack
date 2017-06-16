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
 * This class provides methods for finding the nearest "package.json" for a folder
 * and retrieving the name of the package.  The results are cached.
 */
export default class PackageJsonLookup {
  private _tryFindPackagePathUpwardsCache: Map<string, string | undefined>;
  private _readPackageNameCache: Map<string, string>;

  constructor() {
    this._tryFindPackagePathUpwardsCache = new Map<string, string>();
    this._readPackageNameCache = new Map<string, string>();
  }

  /**
   * Finds the path to the package folder of a given currentPath, by probing
   * upwards from the currentPath until a package.json file is found.
   * If no package.json can be found, undefined is returned.
   *
   * @param currentPath - a path (relative or absolute) of the current location
   * @returns a relative path to the package folder
   */
  public tryFindPackagePathUpwards(currentPath: string): string | undefined {
    // Two lookups are required, because get() cannot distinguish the undefined value
    // versus a missing key.
    if (this._tryFindPackagePathUpwardsCache.has(currentPath)) {
      return this._tryFindPackagePathUpwardsCache.get(currentPath);
    }

    let result: string | undefined;

    const parentFolder: string = path.dirname(currentPath);
    if (!parentFolder || parentFolder === currentPath) {
      result = undefined;
    } else if (fsx.existsSync(path.join(parentFolder, 'package.json'))) {
      result = path.normalize(parentFolder);
    } else {
      result = this.tryFindPackagePathUpwards(parentFolder);
    }

    this._tryFindPackagePathUpwardsCache.set(currentPath, result);
    return result;
  }

  /**
   * Loads the package.json file and returns the name of the package.
   *
   * @param packageJsonPath - an absolute path to the folder containing the
   * package.json file, it does not include the 'package.json' suffix.
   * @returns the name of the package (E.g. @microsoft/api-extractor)
   */
  public readPackageName(packageJsonPath: string): string {
    let result: string = this._readPackageNameCache.get(packageJsonPath);
    if (result !== undefined) {
      return result;
    }

    const packageJson: IPackageJson = JsonFile.loadJsonFile(path.join(packageJsonPath, 'package.json')) as IPackageJson;
    result = packageJson.name;

    this._readPackageNameCache.set(packageJsonPath, result);
    return result;
  }
}
