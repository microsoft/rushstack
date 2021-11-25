// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export class RushSdk {
  private static _initialized: boolean = false;

  public static ensureInitialized(): void {
    if (!RushSdk._initialized) {
      const rushLibModule: unknown = require('../../index');

      // The "@rushstack/rush-sdk" shim will look for this global variable to obtain
      // Rush's instance of "@microsoft/rush-lib".
      // eslint-disable-next-line
      (global as any).___rush_rushLibModule = rushLibModule;

      RushSdk._initialized = true;
    }
  }
}
