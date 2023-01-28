// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem } from '@rushstack/node-core-library';
import { trueCasePathSync } from 'true-case-path';

/**
 * This class provides global folders that are used for rush's internal install locations.
 *
 * @privateRemarks
 * Keep this in sync with `RushGlobalFolder` in rush.
 */
class RushGlobalFolder {
  public readonly path: string;
  public readonly nodeSpecificPath: string;

  public constructor() {
    // Because RushGlobalFolder is used by the front-end VersionSelector before EnvironmentConfiguration
    // is initialized, we need to read it using a special internal API.
    let rushGlobalFolderOverride: string | undefined = undefined;
    if (typeof process !== 'undefined') {
      rushGlobalFolderOverride = getRushGlobalFolderOverride(process.env);
    }
    if (rushGlobalFolderOverride !== undefined) {
      this.path = rushGlobalFolderOverride;
    } else {
      this.path = path.join(getHomeFolder(), '.rush');
    }

    const normalizedNodeVersion: string = process.version.match(/^[a-z0-9\-\.]+$/i)
      ? process.version
      : 'unknown-version';
    this.nodeSpecificPath = path.join(this.path, `node-${normalizedNodeVersion}`);
  }
}

/**
 * The front-end RushVersionSelector relies on `RUSH_GLOBAL_FOLDER`, so its value must be read before
 * `EnvironmentConfiguration` is initialized (and actually before the correct version of `EnvironmentConfiguration`
 * is even installed). Thus we need to read this environment variable differently from all the others.
 *
 * @privateRemarks
 * Keep this in sync with `EnvironmentConfiguration._getRushGlobalOverride` in rush.
 */
function getRushGlobalFolderOverride(processEnv: Record<string, string | undefined>): string | undefined {
  const value: string | undefined = processEnv.RUSH_GLOBAL_FOLDER;
  if (value) {
    const normalizedValue: string | undefined = normalizeDeepestParentFolderPath(value);
    return normalizedValue;
  }
}

/**
 * Given a path to a folder (that may or may not exist), normalize the path, including casing,
 * to the first existing parent folder in the path.
 *
 * If no existing path can be found (for example, if the root is a volume that doesn't exist),
 * this function returns undefined.
 *
 * @example
 * If the following path exists on disk: `C:\Folder1\folder2\`
 * _normalizeFirstExistingFolderPath('c:\\folder1\\folder2\\temp\\subfolder')
 * returns 'C:\\Folder1\\folder2\\temp\\subfolder'
 *
 * @privateRemarks
 * Keep this in sync with `EnvironmentConfiguration.normalizeDeepestParentFolderPath` in rush.
 */
function normalizeDeepestParentFolderPath(folderPath: string): string | undefined {
  folderPath = path.normalize(folderPath);
  const endsWithSlash: boolean = folderPath.charAt(folderPath.length - 1) === path.sep;
  const parsedPath: path.ParsedPath = path.parse(folderPath);
  const pathRoot: string = parsedPath.root;
  const pathWithoutRoot: string = parsedPath.dir.substr(pathRoot.length);
  const pathParts: string[] = [...pathWithoutRoot.split(path.sep), parsedPath.name].filter((part) => !!part);

  // Starting with all path sections, and eliminating one from the end during each loop iteration,
  // run trueCasePathSync. If trueCasePathSync returns without exception, we've found a subset
  // of the path that exists and we've now gotten the correct casing.
  //
  // Once we've found a parent folder that exists, append the path sections that didn't exist.
  for (let i: number = pathParts.length; i >= 0; i--) {
    const constructedPath: string = path.join(pathRoot, ...pathParts.slice(0, i));
    try {
      const normalizedConstructedPath: string = trueCasePathSync(constructedPath);
      const result: string = path.join(normalizedConstructedPath, ...pathParts.slice(i));
      if (endsWithSlash) {
        return `${result}${path.sep}`;
      } else {
        return result;
      }
    } catch (e) {
      // This path doesn't exist, continue to the next subpath
    }
  }

  return undefined;
}

/**
 * Get the user's home directory. On windows this looks something like "C:\users\username\" and on UNIX
 * this looks something like "/home/username/"
 *
 * @privateRemarks
 * Keep this in sync with `Utilities.getHomeFolder`.
 */
function getHomeFolder(): string {
  const unresolvedUserFolder: string | undefined =
    process.env[process.platform === 'win32' ? 'USERPROFILE' : 'HOME'];
  const dirError: string = "Unable to determine the current user's home directory";
  if (unresolvedUserFolder === undefined) {
    throw new Error(dirError);
  }
  const homeFolder: string = path.resolve(unresolvedUserFolder);
  if (!FileSystem.exists(homeFolder)) {
    throw new Error(dirError);
  }

  return homeFolder;
}

export { RushGlobalFolder };
