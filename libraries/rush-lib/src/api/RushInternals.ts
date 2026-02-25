// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Rush } from './Rush.ts';

/**
 * Used by rush-sdk to access internals of rush-lib.
 * @internal
 */
export class RushInternals {
  /**
   * Used by rush-sdk to load an internal API specified by its module path.
   *
   * @param srcImportPath - The module path to load.  For example, to refer to `src/api/ChangeFile.ts`,
   * the `srcImportPath` would be `"api/ChangeFile"`.
   * @returns the module object as would be returned by `require()`
   */
  public static loadModule(srcImportPath: string): unknown {
    const libPath: string = `${Rush._rushLibPackageFolder}/lib-commonjs/${srcImportPath}`;
    try {
      return require(libPath);
    } catch (e) {
      throw new Error(
        `The specified internal API "src/${srcImportPath}" is not implemented by Rush ${Rush.version}`
      );
    }
  }
}
