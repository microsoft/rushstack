// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Import, IPackageJson, PackageJsonLookup } from '@rushstack/node-core-library';

// eslint-disable-next-line
let rushLibModule: any = (global as any).___rush___rushLibModule;

if (rushLibModule === undefined) {
  const importingPath: string | undefined = module?.parent?.filename;
  if (importingPath !== undefined) {
    const callerPackageFolder: string | undefined =
      PackageJsonLookup.instance.tryGetPackageFolderFor(importingPath);

    if (callerPackageFolder !== undefined) {
      const callerPackageJson: IPackageJson = require(path.join(callerPackageFolder, 'package.json'));

      const RUSH_LIB_NAME: string = '@microsoft/rush-lib';

      // Does the caller properly declare a dependency on rush-lib?
      if (
        (callerPackageJson.dependencies && callerPackageJson.dependencies[RUSH_LIB_NAME] !== undefined) ||
        (callerPackageJson.devDependencies &&
          callerPackageJson.devDependencies[RUSH_LIB_NAME] !== undefined) ||
        (callerPackageJson.peerDependencies &&
          callerPackageJson.peerDependencies[RUSH_LIB_NAME] !== undefined)
      ) {
        // Try to resolve rush-lib from the caller's folder
        try {
          const rushLibModulePath: string = Import.resolveModule({
            modulePath: '@microsoft/rush-lib',
            baseFolderPath: callerPackageFolder
          });

          rushLibModule = require(rushLibModulePath);
        } catch (error) {
          // If we fail to resolve it, ignore the error
        }
      }
    }
  }
}

if (rushLibModule === undefined) {
  throw new Error('The "@rushstack/rush-sdk" package context has not been initialized.');
}

// Based on TypeScript's __exportStar()
for (const property in rushLibModule) {
  if (property !== 'default' && !exports.hasOwnProperty(property)) {
    // Based on TypeScript's __createBinding()
    Object.defineProperty(exports, property, {
      enumerable: true,
      get: function () {
        return rushLibModule[property];
      }
    });
  }
}
