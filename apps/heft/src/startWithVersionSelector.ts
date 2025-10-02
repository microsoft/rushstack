// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable no-console */

// NOTE: Since startWithVersionSelector.ts is loaded in the same process as start.ts, any dependencies that
// we import here may become side-by-side versions.  We want to minimize any dependencies.
import * as path from 'node:path';
import * as fs from 'node:fs';

import type { IPackageJson } from '@rushstack/node-core-library';

import { getToolParameterNamesFromArgs } from './utilities/CliUtilities';
import { Constants } from './utilities/Constants';

// Excerpted from PackageJsonLookup.tryGetPackageFolderFor()
function tryGetPackageFolderFor(resolvedFileOrFolderPath: string): string | undefined {
  // Two lookups are required, because get() cannot distinguish the undefined value
  // versus a missing key.
  // if (this._packageFolderCache.has(resolvedFileOrFolderPath)) {
  //   return this._packageFolderCache.get(resolvedFileOrFolderPath);
  // }

  // Is resolvedFileOrFolderPath itself a folder with a package.json file?  If so, return it.
  if (fs.existsSync(path.join(resolvedFileOrFolderPath, 'package.json'))) {
    // this._packageFolderCache.set(resolvedFileOrFolderPath, resolvedFileOrFolderPath);
    return resolvedFileOrFolderPath;
  }

  // Otherwise go up one level
  const parentFolder: string | undefined = path.dirname(resolvedFileOrFolderPath);
  if (!parentFolder || parentFolder === resolvedFileOrFolderPath) {
    // We reached the root directory without finding a package.json file,
    // so cache the negative result
    // this._packageFolderCache.set(resolvedFileOrFolderPath, undefined);
    return undefined; // no match
  }

  // Recurse upwards, caching every step along the way
  const parentResult: string | undefined = tryGetPackageFolderFor(parentFolder);
  // Cache the parent's answer as well
  // this._packageFolderCache.set(resolvedFileOrFolderPath, parentResult);

  return parentResult;
}

/**
 * When Heft is invoked via the shell path, we examine the project's package.json dependencies and try to load
 * the locally installed version of Heft. This avoids accidentally building using the wrong version of Heft.
 * Use "heft --unmanaged" to bypass this feature.
 */
function tryStartLocalHeft(): boolean {
  const toolParameters: Set<string> = getToolParameterNamesFromArgs();
  if (toolParameters.has(Constants.unmanagedParameterLongName)) {
    console.log(
      `Bypassing the Heft version selector because ${JSON.stringify(Constants.unmanagedParameterLongName)} ` +
        'was specified.'
    );
    console.log();
    return false;
  } else if (toolParameters.has(Constants.debugParameterLongName)) {
    // The unmanaged flag could be undiscoverable if it's not in their locally installed version
    console.log(
      'Searching for a locally installed version of Heft. Use the ' +
        `${JSON.stringify(Constants.unmanagedParameterLongName)} flag if you want to avoid this.`
    );
  }

  // Find the package.json file that governs the current folder location
  const projectFolder: string | undefined = tryGetPackageFolderFor(process.cwd());
  if (projectFolder) {
    let heftEntryPoint: string;
    try {
      const packageJsonPath: string = path.join(projectFolder, 'package.json');
      const packageJsonContent: string = fs.readFileSync(packageJsonPath).toString();
      let packageJson: IPackageJson;
      try {
        packageJson = JSON.parse(packageJsonContent);
      } catch (error) {
        throw new Error(`Error parsing ${packageJsonPath}:` + (error as Error).message);
      }

      // Does package.json have a dependency on Heft?
      if (
        !(packageJson.dependencies && packageJson.dependencies[Constants.heftPackageName]) &&
        !(packageJson.devDependencies && packageJson.devDependencies[Constants.heftPackageName])
      ) {
        // No explicit dependency on Heft
        return false;
      }

      // To avoid a loading the "resolve" NPM package, let's assume that the Heft dependency must be
      // installed as "<projectFolder>/node_modules/@rushstack/heft".
      const heftFolder: string = path.join(projectFolder, 'node_modules', Constants.heftPackageName);

      heftEntryPoint = path.join(heftFolder, 'lib', 'start.js');
      if (!fs.existsSync(heftEntryPoint)) {
        throw new Error('Unable to find Heft entry point: ' + heftEntryPoint);
      }
    } catch (error) {
      throw new Error('Error probing for local Heft version: ' + (error as Error).message);
    }

    require(heftEntryPoint);

    // We found and successfully invoked the local Heft
    return true;
  }

  // We couldn't find the package folder
  return false;
}

if (!tryStartLocalHeft()) {
  // A project Heft dependency was not found, so launch the unmanaged version.
  require('./start.js');
}
