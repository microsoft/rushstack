// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem } from '@rushstack/node-core-library';

import { RushConstants } from '../logic/RushConstants';
import type { ITryFindRushJsonLocationOptions } from './RushConfiguration';

/**
 * Implements `RushConfiguration.tryFindRushJsonLocation` without loading the rest of the Rush engine,
 * for callers such as the standalone client that only need the location.
 */
export function tryFindRushJsonLocation(options?: ITryFindRushJsonLocationOptions): string | undefined {
  const optionsIn: ITryFindRushJsonLocationOptions = options || {};
  const verbose: boolean = optionsIn.showVerbose || false;
  let currentFolder: string = optionsIn.startingFolder || process.cwd();
  let parentFolder: string = path.dirname(currentFolder);

  // look upwards at parent folders until we find a folder containing rush.json,
  // or we reach the root directory without finding a rush.json file
  while (parentFolder && parentFolder !== currentFolder) {
    const rushJsonFilename: string = path.join(currentFolder, RushConstants.rushJsonFilename);
    if (FileSystem.exists(rushJsonFilename)) {
      if (currentFolder !== optionsIn.startingFolder && verbose) {
        // eslint-disable-next-line no-console
        console.log('Found configuration in ' + rushJsonFilename);
      }

      if (verbose) {
        // eslint-disable-next-line no-console
        console.log('');
      }

      return rushJsonFilename;
    }
    currentFolder = parentFolder;
    parentFolder = path.dirname(currentFolder);
  }

  // no match
  return undefined;
}
