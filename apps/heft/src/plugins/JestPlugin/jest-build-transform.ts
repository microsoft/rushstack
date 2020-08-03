// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Path, FileSystem } from '@rushstack/node-core-library';
import { InitialOptionsWithRootDir } from '@jest/types/build/Config';
import { JestTypeScriptDataFile, IJestTypeScriptDataFileJson } from './JestTypeScriptDataFile';

/**
 * This Jest transformer maps TS files under a 'src' folder to their compiled equivalent under 'lib'
 */
export function process(src: string, filename: string, jestOptions: InitialOptionsWithRootDir): string {
  // Read typescript-jest-config.json, which is created by Heft's TypeScript plugin.  It tells us
  // which emitted output folder to use for Jest.
  const jestTypeScriptConfig: IJestTypeScriptDataFileJson = JestTypeScriptDataFile.loadForProject(
    jestOptions.rootDir
  );

  // Is the input file under the "src" folder?
  const srcFolder: string = path.join(jestOptions.rootDir, 'src');

  if (Path.isUnder(filename, srcFolder)) {
    // Example: /path/to/project/src/folder1/folder2/Example.ts
    const parsedFilename: path.ParsedPath = path.parse(filename);

    // Example: folder1/folder2
    const srcRelativeFolderPath: string = path.relative(srcFolder, parsedFilename.dir);

    // Example: /path/to/project/lib/folder1/folder2/Example.js
    const libFilename: string = path.join(
      jestOptions.rootDir,
      jestTypeScriptConfig.emitFolderPathForJest,
      srcRelativeFolderPath,
      `${parsedFilename.name}.js`
    );

    try {
      return FileSystem.readFile(libFilename);
    } catch (error) {
      if (FileSystem.isNotExistError(error)) {
        throw new Error(
          'jest-build-transform: The expected transpiler output file does not exist:\n' + libFilename
        );
      } else {
        throw error;
      }
    }
  } else {
    throw new Error('jest-build-transform: The input path is not under the "src" folder:\n' + filename);
  }
}
