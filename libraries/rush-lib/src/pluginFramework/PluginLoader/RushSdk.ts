// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

type RushLibModuleType = Record<string, unknown>;
declare const global: typeof globalThis & {
  ___rush___rushLibModule?: RushLibModuleType;
};

let _initialized: boolean = false;

export class RushSdk {
  public static ensureInitialized(): void {
    if (!_initialized) {
      const rushLibModule: RushLibModuleType = require('../../index');

      // The "@rushstack/rush-sdk" shim will look for this global variable to obtain
      // Rush's instance of "@microsoft/rush-lib".
      global.___rush___rushLibModule = rushLibModule;

      _initialized = true;
    }
  }
}
