// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { _RushLibModuleType as RushLibModuleType, RushSdkLoader } from './RushSdkLoader';

const rushLibModule: RushLibModuleType | undefined = RushSdkLoader._rushLibModule;
if (rushLibModule === undefined) {
  if (RushSdkLoader._rushLibModuleHasBeenInstalled) {
    throw new Error(
      "@rushstack/rush-sdk has not been initialized. You must call require('rush-sdk/loader').install()."
    );
  } else {
    throw new Error('The @rushstack/rush-sdk package was not able to load the Rush engine.');
  }
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
