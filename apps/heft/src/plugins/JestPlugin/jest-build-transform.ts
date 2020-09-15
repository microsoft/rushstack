// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Path, FileSystem, FileSystemStats, JsonObject } from '@rushstack/node-core-library';
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

const DEBUG_TRANSFORM: boolean = false;

// Tolerate this much inaccuracy in the filesystem time stamps
const TIMESTAMP_TOLERANCE_MS: number = 15;

// Wait this long after a .js file's timestamp changes before starting to read it; this gives time
// for the contents to get flushed to disk.
const FLUSH_TIME_MS: number = 500;

// Wait this long for the .js file to be written before giving up.
const MAX_WAIT_MS: number = 7000;

// Shamefully sleep this long to avoid consuming CPU cycles
const POLLING_INTERVAL_MS: number = 50;

/**
 * This Jest transformer maps TS files under a 'src' folder to their compiled equivalent under 'lib'
 */
export function process(
  srcCode: string,
  srcFilePath: string,
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

  if (Path.isUnder(srcFilePath, srcFolder)) {
    // Example: /path/to/project/src/folder1/folder2/Example.ts
    const parsedFilename: path.ParsedPath = path.parse(srcFilePath);

    // Example: folder1/folder2
    const srcRelativeFolderPath: string = path.relative(srcFolder, parsedFilename.dir);

    // Example: /path/to/project/lib/folder1/folder2/Example.js
    const libFilePath: string = path.join(
      jestOptions.rootDir,
      jestTypeScriptDataFile.emitFolderNameForJest,
      srcRelativeFolderPath,
      `${parsedFilename.name}.js`
    );

    const startOfLoopMs: number = new Date().getTime();
    let stalled: boolean = false;

    if (!jestTypeScriptDataFile.skipTimestampCheck) {
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
          if (libFileStatistics.ctimeMs + TIMESTAMP_TOLERANCE_MS > srcFileStatistics.ctimeMs) {
            // Also, the lib/*.js timestamp must not be too recent, otherwise the transpiler may not have
            // finished flushing its output to disk.
            if (nowMs > libFileStatistics.ctimeMs + FLUSH_TIME_MS) {
              // The .js file is newer than the .ts file, and is old enough to have been flushed
              break;
            }
          }
        }

        if (nowMs - startOfLoopMs > MAX_WAIT_MS) {
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
        delayMs(POLLING_INTERVAL_MS);
      }
    }

    if (stalled && DEBUG_TRANSFORM) {
      const nowMs: number = new Date().getTime();
      console.log(`Waited ${nowMs - startOfLoopMs} ms for .js file`);
      delayMs(2000);
    }

    let libCode: string;
    try {
      libCode = FileSystem.readFile(libFilePath);
    } catch (error) {
      if (FileSystem.isNotExistError(error)) {
        throw new Error(
          'jest-build-transform: The expected transpiler output file does not exist:\n' + libFilePath
        );
      } else {
        throw error;
      }
    }

    const sourceMapFilePath: string = libFilePath + '.map';

    let originalSourceMap: string;
    try {
      originalSourceMap = FileSystem.readFile(sourceMapFilePath);
    } catch (error) {
      if (FileSystem.isNotExistError(error)) {
        throw new Error(
          'jest-build-transform: The source map file is missing -- check your tsconfig.json settings:\n' +
            sourceMapFilePath
        );
      } else {
        throw error;
      }
    }

    // Fix up the source map, since Jest will present the .ts file path to VS Code as the executing script
    const parsedSourceMap: JsonObject = JSON.parse(originalSourceMap);
    if (parsedSourceMap.version !== 3) {
      throw new Error('jest-build-transform: Unsupported source map file version: ' + sourceMapFilePath);
    }
    parsedSourceMap.file = srcFilePath;
    parsedSourceMap.sources = [srcFilePath];
    parsedSourceMap.sourcesContent = [srcCode];
    delete parsedSourceMap.sourceRoot;
    const correctedSourceMap: string = JSON.stringify(parsedSourceMap);

    // Embed the source map, since if we return the { code, map } object, then the debugger does not believe
    // it is the same file, and will show a separate view with the same file path.
    //
    // Note that if the Jest testEnvironment does not support vm.compileFunction (introduced with Node.js 10),
    // then the Jest module wrapper will inject text below the "//# sourceMappingURL=" line which breaks source maps.
    // See this PR for details: https://github.com/facebook/jest/pull/9252
    const encodedSourceMap: string =
      'data:application/json;charset=utf-8;base64,' +
      Buffer.from(correctedSourceMap, 'utf8').toString('base64');
    const stringToFind: string = 'sourceMappingURL=';
    const libCodeWithSourceMap: string =
      libCode.slice(0, libCode.lastIndexOf(stringToFind) + stringToFind.length) + encodedSourceMap;

    return libCodeWithSourceMap;
  } else {
    throw new Error('jest-build-transform: The input path is not under the "src" folder:\n' + srcFilePath);
  }
}
