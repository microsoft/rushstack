// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Path, FileSystem, FileSystemStats } from '@rushstack/node-core-library';
import { InitialOptionsWithRootDir } from '@jest/types/build/Config';
import { TransformedSource } from '@jest/transform';

import { JestTypeScriptDataFile, IJestTypeScriptDataFileJson } from './JestTypeScriptDataFile';

// This caches jest-typescript-data.json file contents.
// Map from jestOptions.rootDir --> IJestTypeScriptDataFileJson
const dataFileJsonCache: Map<string, IJestTypeScriptDataFileJson> = new Map();

// Synchronous delay that doesn't burn CPU cycles
function delayMs(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * This Jest transformer maps TS files under a 'src' folder to their compiled equivalent under 'lib'
 */
export function process(
  src: string,
  filename: string,
  jestOptions: InitialOptionsWithRootDir
): TransformedSource {
  let jestTypeScriptDataFile: IJestTypeScriptDataFileJson | undefined = dataFileJsonCache.get(
    jestOptions.rootDir
  );
  if (jestTypeScriptDataFile === undefined) {
    // Read jest-typescript-data.json, which is created by Heft's TypeScript plugin.  It tells us
    // which emitted output folder to use for Jest.
    jestTypeScriptDataFile = JestTypeScriptDataFile.loadForProject(jestOptions.rootDir);
    dataFileJsonCache.set(jestOptions.rootDir, jestTypeScriptDataFile);
  }

  // Is the input file under the "src" folder?
  const srcFolder: string = path.join(jestOptions.rootDir, 'src');

  if (Path.isUnder(filename, srcFolder)) {
    const srcFilePath: string = filename;

    // Example: /path/to/project/src/folder1/folder2/Example.ts
    const parsedFilename: path.ParsedPath = path.parse(srcFilePath);

    // Example: folder1/folder2
    const srcRelativeFolderPath: string = path.relative(srcFolder, parsedFilename.dir);

    // Example: /path/to/project/lib/folder1/folder2/Example.js
    const libFilePath: string = path.join(
      jestOptions.rootDir,
      jestTypeScriptDataFile.emitFolderPathForJest,
      srcRelativeFolderPath,
      `${parsedFilename.name}.js`
    );

    const startOfLoopMs: number = new Date().getTime();
    let stalled: boolean = false;

    for (;;) {
      let srcFileStatistics: FileSystemStats;
      try {
        srcFileStatistics = FileSystem.getStatistics(srcFilePath);
      } catch {
        // If the source file was deleted, then fall through and allow readFile() to fail
        break;
      }
      let libFileStatistics: FileSystemStats | undefined = undefined;
      try {
        libFileStatistics = FileSystem.getStatistics(libFilePath);
      } catch {
        // ignore errors
      }

      const nowMs: number = new Date().getTime();
      if (libFileStatistics) {
        // The lib/*.js timestamp must not be older than the src/*.ts timestamp, otherwise the transpiler
        // is not done writing its outputs.
        if (libFileStatistics.ctimeMs + 15 - srcFileStatistics.ctimeMs > 0) {
          // allow 100ms of slop for clock issues
          // Also, the lib/*.js timestamp must not be too recent, otherwise the transpiler may not have
          // finished flushing its output to disk.
          if (nowMs > libFileStatistics.ctimeMs + 500) {
            // The .js file is newer than the .ts file, and is old enough to have been flushed
            break;
          }
        }
      }

      if (nowMs - startOfLoopMs > 4000) {
        // Something is wrong -- why hasn't the compiler updated the .js file?
        if (libFileStatistics) {
          throw new Error(
            'jest-build-transform: Gave up waiting for the transpiler to update its output file:\n' +
              libFilePath
          );
        } else {
          throw new Error(
            'jest-build-transform: Gave up waiting for the transpiler to write its output file:\n' +
              libFilePath
          );
        }
      }

      // Jest's transforms are synchronous, so our only option here is to sleep synchronously. Bad Jest. :-(
      // TODO: The better solution is to change how Jest's watch loop is notified.
      stalled = true;
      delayMs(100);
    }
    if (stalled) {
      const nowMs: number = new Date().getTime();
      console.log(`Waited ${nowMs - startOfLoopMs} ms for .js file`);
    }

    let code: string;
    try {
      code = FileSystem.readFile(libFilePath);
    } catch (error) {
      if (FileSystem.isNotExistError(error)) {
        throw new Error(
          'jest-build-transform: The expected transpiler output file does not exist:\n' + libFilePath
        );
      } else {
        throw error;
      }
    }

    const sourceMapFilename: string = libFilePath + '.map';

    let sourceMap: string;
    try {
      sourceMap = FileSystem.readFile(sourceMapFilename);
    } catch (error) {
      if (FileSystem.isNotExistError(error)) {
        throw new Error(
          'jest-build-transform: The source map file is missing -- check your tsconfig.json settings:\n' +
            sourceMapFilename
        );
      } else {
        throw error;
      }
    }

    return {
      code: code,
      map: sourceMap
    };
  } else {
    throw new Error('jest-build-transform: The input path is not under the "src" folder:\n' + filename);
  }
}
