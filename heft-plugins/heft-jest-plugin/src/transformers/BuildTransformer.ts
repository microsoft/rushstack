// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Path, FileSystem, FileSystemStats, JsonObject } from '@rushstack/node-core-library';
import type { AsyncTransformer, SyncTransformer, TransformedSource, TransformOptions } from '@jest/transform';
import type { Config } from '@jest/types';

import { HeftJestDataFile, IHeftJestDataFileJson } from '../HeftJestDataFile';
import { GetCacheKeyFunction, createCacheKeyFunction, createCacheKeyFunctionAsync } from '../JestUtils';

// This caches heft-jest-data.json file contents.
// Map from jestOptions.rootDir --> IHeftJestDataFileJson
const dataFileJsonCache: Map<string, IHeftJestDataFileJson> = new Map();

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
 * This Jest transformer maps TS files under a 'src' folder to their compiled equivalent under 'lib'.
 *
 * @privateRemarks
 * Implements SyncTransformer interface instead of AsyncTransformer since async is only supported
 * in ESM, which is still considered experimental:
 * https://github.com/facebook/jest/issues/11226#issuecomment-804449688
 */
export class BuildTransformer implements AsyncTransformer, SyncTransformer {
  /**
   * Synchronous delay using Atomics that doesn't burn CPU cycles
   */
  private static _delayMs(milliseconds: number): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  }

  /**
   * Async delay using setTimeout.
   */
  private static async _delayMsAsync(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve: () => void): void => {
      setTimeout(resolve, milliseconds);
    });
  }

  /**
   * Read heft-jest-data.json, which is created by the JestPlugin.  It tells us
   * which emitted output folder to use for Jest.
   */
  private static _getHeftJestDataFileJson(rootDir: string): IHeftJestDataFileJson {
    let heftJestDataFile: IHeftJestDataFileJson | undefined = dataFileJsonCache.get(rootDir);
    if (heftJestDataFile === undefined) {
      heftJestDataFile = HeftJestDataFile.loadForProject(rootDir);
      dataFileJsonCache.set(rootDir, heftJestDataFile);
    }
    return heftJestDataFile;
  }

  /**
   * Read heft-jest-data.json, which is created by the JestPlugin.  It tells us
   * which emitted output folder to use for Jest.
   */
  private static async _getHeftJestDataFileJsonAsync(rootDir: string): Promise<IHeftJestDataFileJson> {
    let heftJestDataFile: IHeftJestDataFileJson | undefined = dataFileJsonCache.get(rootDir);
    if (heftJestDataFile === undefined) {
      heftJestDataFile = await HeftJestDataFile.loadForProjectAsync(rootDir);
      dataFileJsonCache.set(rootDir, heftJestDataFile);
    }
    return heftJestDataFile;
  }

  private static _getSourceMapText(sourceMapPath: string): string {
    try {
      return FileSystem.readFile(sourceMapPath);
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        throw new Error(
          'jest-build-transform: The source map file is missing -- check your tsconfig.json settings:\n' +
            sourceMapPath
        );
      } else {
        throw error;
      }
    }
  }

  private static async _getSourceMapTextAsync(sourceMapPath: string): Promise<string> {
    try {
      return await FileSystem.readFileAsync(sourceMapPath);
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        throw new Error(
          'jest-build-transform: The source map file is missing -- check your tsconfig.json settings:\n' +
            sourceMapPath
        );
      } else {
        throw error;
      }
    }
  }

  private static _getTranspiledText(transpiledPath: string): string {
    try {
      return FileSystem.readFile(transpiledPath);
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        throw new Error(
          'jest-build-transform: The expected transpiler output file does not exist:\n' + transpiledPath
        );
      } else {
        throw error;
      }
    }
  }

  private static async _getTranspiledTextAsync(transpiledPath: string): Promise<string> {
    try {
      return await FileSystem.readFileAsync(transpiledPath);
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        throw new Error(
          'jest-build-transform: The expected transpiler output file does not exist:\n' + transpiledPath
        );
      } else {
        throw error;
      }
    }
  }

  /**
   * Transform the transpiled text and source map to reference the correct source file content.
   */
  private static _transform(
    sourceText: string,
    sourcePath: string,
    transpiledText: string,
    sourceMap: string,
    sourceMapPath: string
  ): TransformedSource {
    // Fix up the source map, since Jest will present the .ts file path to VS Code as the executing script
    const parsedSourceMap: JsonObject = JSON.parse(sourceMap);
    if (parsedSourceMap.version !== 3) {
      throw new Error('jest-build-transform: Unsupported source map file version: ' + sourceMapPath);
    }
    parsedSourceMap.file = sourcePath;
    parsedSourceMap.sources = [sourcePath];
    parsedSourceMap.sourcesContent = [sourceText];
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

    const sourceMappingUrlToken: string = 'sourceMappingURL=';
    const sourceMappingCommentIndex: number = transpiledText.lastIndexOf(sourceMappingUrlToken);
    let transpiledTextWithSourceMap: string;
    if (sourceMappingCommentIndex !== -1) {
      transpiledTextWithSourceMap =
        transpiledText.slice(0, sourceMappingCommentIndex + sourceMappingUrlToken.length) + encodedSourceMap;
    } else {
      // If there isn't a sourceMappingURL comment, inject one
      const sourceMapComment: string =
        (transpiledText.endsWith('\n') ? '' : '\n') + `//# ${sourceMappingUrlToken}${encodedSourceMap}`;
      transpiledTextWithSourceMap = transpiledText + sourceMapComment;
    }

    return transpiledTextWithSourceMap;
  }

  private static _waitForTranspiledFile(sourcePath: string, transpiledPath: string): void {
    let stalled: boolean = false;
    const startMs: number = new Date().getTime();

    for (;;) {
      let sourceFileStatistics: FileSystemStats;
      try {
        sourceFileStatistics = FileSystem.getStatistics(sourcePath);
      } catch {
        // If the source file was deleted, then fall through and allow readFile() to fail
        break;
      }
      let transpiledFileStatistics: FileSystemStats | undefined = undefined;
      try {
        transpiledFileStatistics = FileSystem.getStatistics(transpiledPath);
      } catch {
        // ignore errors
      }

      const nowMs: number = new Date().getTime();
      if (transpiledFileStatistics) {
        // The lib/*.js timestamp must not be older than the src/*.ts timestamp, otherwise the transpiler
        // is not done writing its outputs.
        if (transpiledFileStatistics.ctimeMs + TIMESTAMP_TOLERANCE_MS > sourceFileStatistics.ctimeMs) {
          // Also, the lib/*.js timestamp must not be too recent, otherwise the transpiler may not have
          // finished flushing its output to disk.
          if (nowMs > transpiledFileStatistics.ctimeMs + FLUSH_TIME_MS) {
            // The .js file is newer than the .ts file, and is old enough to have been flushed
            break;
          }
        }
      }

      if (nowMs - startMs > MAX_WAIT_MS) {
        // Something is wrong -- why hasn't the compiler updated the .js file?
        if (transpiledFileStatistics) {
          throw new Error(
            `jest-build-transform: Gave up waiting for the transpiler to update its output file:\n${transpiledPath}`
          );
        } else {
          throw new Error(
            `jest-build-transform: Gave up waiting for the transpiler to write its output file:\n${transpiledPath}`
          );
        }
      }

      // Jest's transforms are synchronous, so our only option here is to sleep synchronously. Bad Jest. :-(
      stalled = true;
      BuildTransformer._delayMs(POLLING_INTERVAL_MS);
    }

    if (stalled && DEBUG_TRANSFORM) {
      const nowMs: number = new Date().getTime();
      const elapsedMs: number = nowMs - startMs;
      if (elapsedMs > POLLING_INTERVAL_MS) {
        console.log(`Waited ${elapsedMs} ms for .js file`);
      }
      BuildTransformer._delayMs(2000);
    }
  }

  private static async _waitForTranspiledFileAsync(
    sourcePath: string,
    transpiledPath: string
  ): Promise<void> {
    let stalled: boolean = false;
    const startMs: number = new Date().getTime();

    for (;;) {
      let sourceFileStatistics: FileSystemStats;
      try {
        sourceFileStatistics = await FileSystem.getStatisticsAsync(sourcePath);
      } catch {
        // If the source file was deleted, then fall through and allow readFileAsync() to fail
        break;
      }
      let transpiledFileStatistics: FileSystemStats | undefined = undefined;
      try {
        transpiledFileStatistics = await FileSystem.getStatisticsAsync(transpiledPath);
      } catch {
        // ignore errors
      }

      const nowMs: number = new Date().getTime();
      if (transpiledFileStatistics) {
        // The lib/*.js timestamp must not be older than the src/*.ts timestamp, otherwise the transpiler
        // is not done writing its outputs.
        if (transpiledFileStatistics.ctimeMs + TIMESTAMP_TOLERANCE_MS > sourceFileStatistics.ctimeMs) {
          // Also, the lib/*.js timestamp must not be too recent, otherwise the transpiler may not have
          // finished flushing its output to disk.
          if (nowMs > transpiledFileStatistics.ctimeMs + FLUSH_TIME_MS) {
            // The .js file is newer than the .ts file, and is old enough to have been flushed
            break;
          }
        }
      }

      if (nowMs - startMs > MAX_WAIT_MS) {
        // Something is wrong -- why hasn't the compiler updated the .js file?
        if (transpiledFileStatistics) {
          throw new Error(
            `jest-build-transform: Gave up waiting for the transpiler to update its output file:\n${transpiledPath}`
          );
        } else {
          throw new Error(
            `jest-build-transform: Gave up waiting for the transpiler to write its output file:\n${transpiledPath}`
          );
        }
      }

      stalled = true;
      await BuildTransformer._delayMsAsync(POLLING_INTERVAL_MS);
    }

    if (stalled && DEBUG_TRANSFORM) {
      const nowMs: number = new Date().getTime();
      const elapsedMs: number = nowMs - startMs;
      if (elapsedMs > POLLING_INTERVAL_MS) {
        console.log(`Waited ${elapsedMs} ms for .js file`);
      }
      await BuildTransformer._delayMsAsync(POLLING_INTERVAL_MS);
    }
  }

  /**
   * @override
   */
  public getCacheKey(sourceText: string, sourcePath: Config.Path, options: TransformOptions): string {
    const heftJestDataFile: IHeftJestDataFileJson = BuildTransformer._getHeftJestDataFileJson(
      options.config.rootDir
    );
    const cacheKeyFunction: GetCacheKeyFunction = createCacheKeyFunction(
      /* files: */ [__filename],
      /* values: */ [heftJestDataFile.emitFolderNameForTests, heftJestDataFile.extensionForTests]
    );
    return cacheKeyFunction(sourceText, sourcePath, options);
  }

  /**
   * @override
   */
  public async getCacheKeyAsync(
    sourceText: string,
    sourcePath: Config.Path,
    options: TransformOptions
  ): Promise<string> {
    const heftJestDataFile: IHeftJestDataFileJson = await BuildTransformer._getHeftJestDataFileJsonAsync(
      options.config.rootDir
    );
    const cacheKeyFunction: GetCacheKeyFunction = await createCacheKeyFunctionAsync(
      /* files: */ [__filename],
      /* values: */ [heftJestDataFile.emitFolderNameForTests, heftJestDataFile.extensionForTests]
    );
    return cacheKeyFunction(sourceText, sourcePath, options);
  }

  /**
   * @override
   */
  public process(sourceText: string, sourcePath: Config.Path, options: TransformOptions): TransformedSource {
    const jestOptions: Config.ProjectConfig = options.config;
    const heftJestDataFile: IHeftJestDataFileJson = BuildTransformer._getHeftJestDataFileJson(
      jestOptions.rootDir
    );

    // Is the input file under the "src" folder?
    const srcFolder: string = path.join(jestOptions.rootDir, 'src');

    if (Path.isUnder(sourcePath, srcFolder)) {
      // Example: /path/to/project/src/folder1/folder2/Example.ts
      const parsedFilename: path.ParsedPath = path.parse(sourcePath);

      // Example: folder1/folder2
      const srcRelativeFolderPath: string = path.relative(srcFolder, parsedFilename.dir);

      // Example: /path/to/project/lib/folder1/folder2/Example.js
      const transpiledPath: string = path.join(
        jestOptions.rootDir,
        heftJestDataFile.emitFolderNameForTests,
        srcRelativeFolderPath,
        `${parsedFilename.name}${heftJestDataFile.extensionForTests}`
      );

      // Example: /path/to/project/lib/folder1/folder2/Example.js.map
      const sourceMapPath: string = `${transpiledPath}.map`;

      if (!heftJestDataFile.skipTimestampCheck) {
        BuildTransformer._waitForTranspiledFile(sourcePath, transpiledPath);
      }

      const transpiledText: string = BuildTransformer._getTranspiledText(transpiledPath);
      const sourceMapText: string = BuildTransformer._getSourceMapText(sourceMapPath);

      return BuildTransformer._transform(
        sourceText,
        sourcePath,
        transpiledText,
        sourceMapText,
        sourceMapPath
      );
    } else {
      throw new Error(`jest-build-transform: The input path is not under the "src" folder:\n${sourcePath}`);
    }
  }

  /**
   * @override
   */
  public async processAsync(
    sourceText: string,
    sourcePath: Config.Path,
    options: TransformOptions
  ): Promise<TransformedSource> {
    const jestOptions: Config.ProjectConfig = options.config;
    const heftJestDataFile: IHeftJestDataFileJson = await BuildTransformer._getHeftJestDataFileJsonAsync(
      jestOptions.rootDir
    );

    // Is the input file under the "src" folder?
    const srcFolder: string = path.join(jestOptions.rootDir, 'src');

    if (Path.isUnder(sourcePath, srcFolder)) {
      // Example: /path/to/project/src/folder1/folder2/Example.ts
      const parsedFilename: path.ParsedPath = path.parse(sourcePath);

      // Example: folder1/folder2
      const srcRelativeFolderPath: string = path.relative(srcFolder, parsedFilename.dir);

      // Example: /path/to/project/lib/folder1/folder2/Example.js
      const transpiledPath: string = path.join(
        jestOptions.rootDir,
        heftJestDataFile.emitFolderNameForTests,
        srcRelativeFolderPath,
        `${parsedFilename.name}${heftJestDataFile.extensionForTests}`
      );

      // Example: /path/to/project/lib/folder1/folder2/Example.js.map
      const sourceMapPath: string = `${transpiledPath}.map`;

      if (!heftJestDataFile.skipTimestampCheck) {
        await BuildTransformer._waitForTranspiledFileAsync(sourcePath, transpiledPath);
      }

      const [transpiledText, sourceMapText] = await Promise.all([
        BuildTransformer._getTranspiledTextAsync(transpiledPath),
        BuildTransformer._getSourceMapTextAsync(sourceMapPath)
      ]);

      return BuildTransformer._transform(
        sourceText,
        sourcePath,
        transpiledText,
        sourceMapText,
        sourceMapPath
      );
    } else {
      throw new Error(`jest-build-transform: The input path is not under the "src" folder:\n${sourcePath}`);
    }
  }
}
