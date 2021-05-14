// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This is taken from rush-lib. If we use RushConfiguration from rush-lib
 * to get the rush common/temp folder, we cause a whole bunch of unnecessary
 * filesystem accesses.
 */
import * as path from 'path';
import { FileSystem } from '@rushstack/node-core-library';

function _findRushJsonFolder(): string {
  let currentFolder: string = process.cwd();

  for (let i: number = 0; i < 10; ++i) {
    const rushJsonFilename: string = path.join(currentFolder, 'rush.json');

    if (FileSystem.exists(rushJsonFilename)) {
      return currentFolder;
    }

    const parentFolder: string = path.dirname(currentFolder);
    if (parentFolder === currentFolder) {
      break;
    }
    currentFolder = parentFolder;
  }
  throw new Error('Unable to find rush.json configuration file');
}

let _cachedRushJsonFolder: string;
export function findRushJsonFolder(): string {
  return _cachedRushJsonFolder || (_cachedRushJsonFolder = _findRushJsonFolder());
}

export function getRushCommonTempFolder(): string {
  const rushJsonFolder: string = findRushJsonFolder();
  return path.join(rushJsonFolder, 'common', 'temp');
}

export function getRushConfigFolder(): string {
  const rushJsonFolder: string = findRushJsonFolder();
  return path.join(rushJsonFolder, 'common', 'config');
}
