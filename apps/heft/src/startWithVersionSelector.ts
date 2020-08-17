// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// NOTE: Since the version-selected entry point is loaded in the same process, we should minimize
// any dependencies loaded by startWithVersionSelector.ts, since they may be loaded as
// side-by-side versions.
import * as path from 'path';
import * as resolve from 'resolve';
import { PackageJsonLookup, IPackageJson, INodePackageJson, FileSystem } from '@rushstack/node-core-library';

const HEFT_PACKAGE_NAME: string = '@rushstack/heft';

/**
 * If Heft is installed globally or in some other system path, it will look in the project's package.json
 * file for a local dependency.  If found, Heft will launch that version instead.  This avoids accidentally
 * building using the wrong version of Heft.  Use "heft --unmanaged" to bypass this feature.
 */
function tryStartLocalHeft(): boolean {
  if (process.argv.indexOf('--unmanaged') >= 0) {
    console.log('(Bypassing the Heft version selector because "--unmanaged" was specified.)');
    console.log();
    return false;
  }

  const lookup: PackageJsonLookup = new PackageJsonLookup();
  const packageFolder: string | undefined = lookup.tryGetPackageFolderFor(process.cwd());
  if (packageFolder) {
    let heftEntryPoint: string;
    try {
      const packageJson: IPackageJson = lookup.loadPackageJson(path.join(packageFolder, 'package.json'));

      if (
        !(packageJson.dependencies && packageJson.dependencies[HEFT_PACKAGE_NAME]) &&
        !(packageJson.devDependencies && packageJson.devDependencies[HEFT_PACKAGE_NAME])
      ) {
        // No explicit dependency on Heft
        return false;
      }

      const heftPackageJsonPath: string = resolve.sync(HEFT_PACKAGE_NAME, {
        basedir: packageFolder,
        preserveSymlinks: false,
        packageFilter: (packageJson: INodePackageJson) => {
          return {
            ...packageJson,
            // ensure "main" points to a file in the package root folder
            main: 'package.json'
          };
        }
      });
      const heftFolder: string = path.dirname(heftPackageJsonPath);
      heftEntryPoint = path.join(heftFolder, 'lib', 'start.js');
      if (!FileSystem.exists(heftEntryPoint)) {
        throw new Error('Unable to find Heft entry point: ' + heftEntryPoint);
      }
      console.log(`Found local Heft in: ${heftFolder}`);
      console.log();
    } catch (error) {
      throw new Error('Error probing for local Heft version: ' + error.message);
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
