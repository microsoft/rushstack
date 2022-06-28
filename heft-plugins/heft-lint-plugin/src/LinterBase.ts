// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { performance } from 'perf_hooks';
import { createHash, Hash } from 'crypto';
import { type ITerminal, FileSystem, JsonFile, Path } from '@rushstack/node-core-library';
import type { IScopedLogger } from '@rushstack/heft';
import type {
  IExtendedSourceFile,
  IExtendedProgram,
  IExtendedTypeScript
} from '@rushstack/heft-typescript-plugin';

export interface ILinterBaseOptions {
  ts: IExtendedTypeScript;
  scopedLogger: IScopedLogger;
  buildFolderPath: string;
  /**
   * The path where the linter state will be written to.
   */
  buildMetadataFolderPath: string;
  linterConfigFilePath: string;
}

export interface IRunLinterOptions {
  tsProgram: IExtendedProgram;

  /**
   * All of the files that the TypeScript compiler processed.
   */
  typeScriptFilenames: Set<string>;

  /**
   * The set of files that TypeScript has compiled since the last compilation.
   */
  changedFiles: Set<IExtendedSourceFile>;
}

interface ITsLintCacheData {
  /**
   * The TSLint version and a hash of the TSLint config files. If either changes,
   * the cache is invalidated.
   */
  cacheVersion: string;

  /**
   * This is the result of `Array.from(Map<string, string>)`. The first element of
   * each array item is the file's path and the second element is the file's hash.
   */
  fileVersions: [string, string][];
}

export abstract class LinterBase<TLintResult> {
  protected readonly _scopedLogger: IScopedLogger;
  protected readonly _terminal: ITerminal;
  protected readonly _buildFolderPath: string;
  protected readonly _buildMetadataFolderPath: string;
  protected readonly _linterConfigFilePath: string;

  private readonly _linterName: string;

  protected constructor(linterName: string, options: ILinterBaseOptions) {
    this._scopedLogger = options.scopedLogger;
    this._terminal = this._scopedLogger.terminal;
    this._buildFolderPath = options.buildFolderPath;
    this._buildMetadataFolderPath = options.buildMetadataFolderPath;
    this._linterConfigFilePath = options.linterConfigFilePath;
    this._linterName = linterName;
  }

  public abstract printVersionHeader(): void;

  public async performLintingAsync(options: IRunLinterOptions): Promise<void> {
    const startTime: number = performance.now();
    let hitCount: number = 0;

    await this.initializeAsync(options.tsProgram);

    const commonDirectory: string = options.tsProgram.getCommonSourceDirectory();

    const relativePaths: Map<string, string> = new Map();

    const fileHash: Hash = createHash('md5');
    for (const file of options.typeScriptFilenames) {
      // Need to use relative paths to ensure portability.
      const relative: string = Path.convertToSlashes(path.relative(commonDirectory, file));
      relativePaths.set(file, relative);
      fileHash.update(relative);
    }
    const hashSuffix: string = fileHash.digest('base64').replace(/\+/g, '-').replace(/\//g, '_').slice(0, 8);

    const tslintConfigVersion: string = await this.getCacheVersionAsync();
    const cacheFilePath: string = path.resolve(
      this._buildMetadataFolderPath,
      `_${this._linterName}-${hashSuffix}.json`
    );

    let tslintCacheData: ITsLintCacheData | undefined;
    try {
      tslintCacheData = await JsonFile.loadAsync(cacheFilePath);
    } catch (e) {
      if (FileSystem.isNotExistError(e as Error)) {
        tslintCacheData = undefined;
      } else {
        throw e;
      }
    }

    const cachedNoFailureFileVersions: Map<string, string> = new Map<string, string>(
      tslintCacheData?.cacheVersion === tslintConfigVersion ? tslintCacheData.fileVersions : []
    );

    const newNoFailureFileVersions: Map<string, string> = new Map<string, string>();

    //#region Code from TSLint
    // Some of this code comes from here:
    // https://github.com/palantir/tslint/blob/24d29e421828348f616bf761adb3892bcdf51662/src/linter.ts#L161-L179
    // Modified to only lint files that have changed and that we care about
    const lintFailures: TLintResult[] = [];
    for (const sourceFile of options.tsProgram.getSourceFiles()) {
      const filePath: string = sourceFile.fileName;
      const relative: string | undefined = relativePaths.get(filePath);

      if (relative === undefined || (await this.isFileExcludedAsync(filePath))) {
        continue;
      }

      // Compute the version from the source file content
      const version: string = sourceFile.version || '';
      const cachedVersion: string = cachedNoFailureFileVersions.get(relative) || '';
      if (
        cachedVersion === '' ||
        version === '' ||
        cachedVersion !== version ||
        options.changedFiles.has(sourceFile)
      ) {
        hitCount++;
        const failures: TLintResult[] = await this.lintFileAsync(sourceFile);
        if (failures.length === 0) {
          newNoFailureFileVersions.set(relative, version);
        } else {
          lintFailures.push(...failures);
        }
      } else {
        newNoFailureFileVersions.set(relative, version);
      }
    }
    //#endregion

    this.lintingFinished(lintFailures);

    const updatedTslintCacheData: ITsLintCacheData = {
      cacheVersion: tslintConfigVersion,
      fileVersions: Array.from(newNoFailureFileVersions)
    };
    await JsonFile.saveAsync(updatedTslintCacheData, cacheFilePath, { ensureFolderExists: true });

    const duration: number = performance.now() - startTime;

    this._terminal.writeVerboseLine(`Lint: ${duration}ms (${hitCount} files)`);
  }

  public abstract reportFailures(): void;

  protected abstract getCacheVersionAsync(): Promise<string>;

  protected abstract initializeAsync(tsProgram: IExtendedProgram): Promise<void>;

  protected abstract lintFileAsync(sourceFile: IExtendedSourceFile): Promise<TLintResult[]>;

  protected abstract lintingFinished(lintFailures: TLintResult[]): void;

  protected abstract isFileExcludedAsync(filePath: string): Promise<boolean>;
}
