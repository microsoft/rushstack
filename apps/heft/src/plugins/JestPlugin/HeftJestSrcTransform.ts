// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Path, FileSystem } from '@rushstack/node-core-library';
import { InitialOptionsWithRootDir } from '@jest/types/build/Config';

/**
 * This Jest transformer maps TS files under a 'src' folder to their compiled equivalent under 'lib'
 */
export function process(src: string, filename: string, jestOptions: InitialOptionsWithRootDir): string {
  const srcFolder: string = path.join(jestOptions.rootDir, 'src');
  if (Path.isUnder(filename, srcFolder)) {
    const fileBasename: string = path.basename(filename, path.extname(filename));
    const srcRelativeFolderPath: string = path.dirname(path.relative(srcFolder, filename));
    const libFilename: string = path.join(
      jestOptions.rootDir,
      'lib',
      srcRelativeFolderPath,
      `${fileBasename}.js`
    );

    try {
      return FileSystem.readFile(libFilename);
    } catch (error) {
      if (!FileSystem.isNotExistError(error)) {
        throw error;
      }
    }
  }

  return src;
}
