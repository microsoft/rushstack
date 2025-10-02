// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { Import, FileSystem } from '@rushstack/node-core-library';
import type { EnvironmentVariableNames } from '@microsoft/rush-lib';

export const RUSH_LIB_NAME: '@microsoft/rush-lib' = '@microsoft/rush-lib';
export const RUSH_LIB_PATH_ENV_VAR_NAME: typeof EnvironmentVariableNames._RUSH_LIB_PATH = '_RUSH_LIB_PATH';

export type RushLibModuleType = Record<string, unknown>;

export interface ISdkContext {
  rushLibModule: RushLibModuleType | undefined;
}

export const sdkContext: ISdkContext = {
  rushLibModule: undefined
};

/**
 * Find the rush.json location and return the path, or undefined if a rush.json can't be found.
 *
 * @privateRemarks
 * Keep this in sync with `RushConfiguration.tryFindRushJsonLocation`.
 */
export function tryFindRushJsonLocation(startingFolder: string): string | undefined {
  let currentFolder: string = startingFolder;

  // Look upwards at parent folders until we find a folder containing rush.json
  for (let i: number = 0; i < 10; ++i) {
    const rushJsonFilename: string = path.join(currentFolder, 'rush.json');

    if (FileSystem.exists(rushJsonFilename)) {
      return rushJsonFilename;
    }

    const parentFolder: string = path.dirname(currentFolder);
    if (parentFolder === currentFolder) {
      break;
    }

    currentFolder = parentFolder;
  }

  return undefined;
}

export function _require<TResult>(moduleName: string): TResult {
  if (typeof __non_webpack_require__ === 'function') {
    // If this library has been bundled with Webpack, we need to call the real `require` function
    // that doesn't get turned into a `__webpack_require__` statement.
    // `__non_webpack_require__` is a Webpack macro that gets turned into a `require` statement
    // during bundling.
    return __non_webpack_require__(moduleName);
  } else {
    return require(moduleName);
  }
}

/**
 * Require `@microsoft/rush-lib` under the specified folder path.
 */
export function requireRushLibUnderFolderPath(folderPath: string): RushLibModuleType {
  const rushLibModulePath: string = Import.resolveModule({
    modulePath: RUSH_LIB_NAME,
    baseFolderPath: folderPath
  });

  return _require(rushLibModulePath);
}
