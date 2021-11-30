// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Import, IPackageJson, PackageJsonLookup } from '@rushstack/node-core-library';

const RUSH_LIB_NAME: string = '@microsoft/rush-lib';

type RushLibModuleType = Record<string, unknown>;
declare const global: NodeJS.Global &
  typeof globalThis & {
    ___rush___rushLibModule?: RushLibModuleType;
  };

// SCENARIO 1:  Rush's PluginManager has initialized "rush-sdk" with Rush's own instance of rush-lib.
// The Rush host process will assign "global.___rush___rushLibModule" before loading the plugin.
let rushLibModule: RushLibModuleType | undefined = global.___rush___rushLibModule;

// SCENARIO 2:  The project importing "rush-sdk" has installed its own instance of "rush-lib"
// as a package.json dependency.  For example, this is used by the Jest tests for Rush plugins.
if (rushLibModule === undefined) {
  const importingPath: string | undefined = module?.parent?.filename;
  if (importingPath !== undefined) {
    const callerPackageFolder: string | undefined =
      PackageJsonLookup.instance.tryGetPackageFolderFor(importingPath);

    if (callerPackageFolder !== undefined) {
      const callerPackageJson: IPackageJson = require(path.join(callerPackageFolder, 'package.json'));

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
            modulePath: RUSH_LIB_NAME,
            baseFolderPath: callerPackageFolder
          });

          rushLibModule = require(rushLibModulePath);
        } catch (error) {
          // If we fail to resolve it, ignore the error
        }

        // If two different libraries invoke `rush-sdk`, and one of them provides "rush-lib"
        // then the first version to be loaded wins.  We do not support side-by-side instances of "rush-lib".
        if (rushLibModule !== undefined) {
          // TODO: When we implement Scenario 3, we should also add some diagnostic state
          // to track which scenario is active and how it got initialized.
          global.___rush___rushLibModule = rushLibModule;
        }
      }
    }
  }
}

// SCENARIO 3:  A tool or script depends on "rush-sdk", and is meant to be used inside a monorepo folder.
// In this case, we can use install-run-rush.js to obtain the appropriate rush-lib version for the monorepo.
//
// NOT IMPLEMENTED YET
if (rushLibModule === undefined) {
  // This error indicates that a project is trying to import "@rushstack/rush-sdk", but the Rush engine
  // instance cannot be found.  If you are writing Jest tests for a Rush plugin, add "@microsoft/rush-lib"
  // to the devDependencies for your project.
  throw new Error('The "@rushstack/rush-sdk" package context has not been initialized.');
}

// Based on TypeScript's __exportStar()
for (const property in rushLibModule) {
  if (property !== 'default' && !exports.hasOwnProperty(property)) {
    const rushLibModuleForClosure: RushLibModuleType = rushLibModule;

    // Based on TypeScript's __createBinding()
    Object.defineProperty(exports, property, {
      enumerable: true,
      get: function () {
        return rushLibModuleForClosure[property];
      }
    });
  }
}
