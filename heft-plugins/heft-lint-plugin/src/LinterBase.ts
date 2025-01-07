// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { performance } from 'perf_hooks';
import { createHash, type Hash } from 'crypto';
import { FileSystem, JsonFile, Path } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import type { IScopedLogger } from '@rushstack/heft';

import type { IExtendedProgram, IExtendedSourceFile } from './internalTypings/TypeScriptInternals';

export interface ILinterBaseOptions {
  scopedLogger: IScopedLogger;
  buildFolderPath: string;
  /**
   * The path where the linter state will be written to.
   */
  buildMetadataFolderPath: string;
  linterToolPath: string;
  linterConfigFilePath: string;
  tsProgram: IExtendedProgram;
  fix?: boolean;
  sarifLogPath?: string;
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
  changedFiles: ReadonlySet<IExtendedSourceFile>;
}

interface ILinterCacheData {
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
  protected readonly _fix: boolean;

  protected _fixesPossible: boolean = false;

  private readonly _linterName: string;

  protected constructor(linterName: string, options: ILinterBaseOptions) {
    this._scopedLogger = options.scopedLogger;
    this._terminal = this._scopedLogger.terminal;
    this._buildFolderPath = options.buildFolderPath;
    this._buildMetadataFolderPath = options.buildMetadataFolderPath;
    this._linterConfigFilePath = options.linterConfigFilePath;
    this._linterName = linterName;
    this._fix = options.fix || false;
  }

  public abstract printVersionHeader(): void;

  public async performLintingAsync(options: IRunLinterOptions): Promise<void> {
    const startTime: number = performance.now();
    let fileCount: number = 0;

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

    const linterCacheVersion: string = await this.getCacheVersionAsync();
    const linterCacheFilePath: string = path.resolve(
      this._buildMetadataFolderPath,
      `_${this._linterName}-${hashSuffix}.json`
    );

    let linterCacheData: ILinterCacheData | undefined;
    try {
      const cacheFileContent: string = await FileSystem.readFileAsync(linterCacheFilePath);
      if (cacheFileContent) {
        // Using JSON.parse instead of JsonFile because it is faster for plain JSON
        // This is safe because it is a machine-generated file that will not be edited by a human.
        // Also so that we can check for empty file first.
        linterCacheData = JSON.parse(cacheFileContent);
      }
    } catch (e) {
      if (FileSystem.isNotExistError(e as Error)) {
        linterCacheData = undefined;
      } else if (e instanceof SyntaxError) {
        this._terminal.writeVerboseLine(`Error parsing ${linterCacheFilePath}: ${e}; ignoring cached data.`);
        linterCacheData = undefined;
      } else {
        throw e;
      }
    }

    const cachedNoFailureFileVersions: Map<string, string> = new Map<string, string>(
      linterCacheData?.cacheVersion === linterCacheVersion ? linterCacheData.fileVersions : []
    );

    const newNoFailureFileVersions: Map<string, string> = new Map<string, string>();

    //#region Code from TSLint
    // Some of this code comes from here:
    // https://github.com/palantir/tslint/blob/24d29e421828348f616bf761adb3892bcdf51662/src/linter.ts#L161-L179
    // Modified to only lint files that have changed and that we care about
    const lintResults: TLintResult[] = [];
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
        fileCount++;
        const results: TLintResult[] = await this.lintFileAsync(sourceFile);
        if (results.length === 0) {
          newNoFailureFileVersions.set(relative, version);
        } else {
          for (const result of results) {
            lintResults.push(result);
          }
        }
      } else {
        newNoFailureFileVersions.set(relative, version);
      }
    }
    //#endregion

    await this.lintingFinishedAsync(lintResults);

    if (!this._fix && this._fixesPossible) {
      this._terminal.writeWarningLine(
        'The linter reported that fixes are possible. To apply fixes, run Heft with the "--fix" option.'
      );
    }

    const updatedTslintCacheData: ILinterCacheData = {
      cacheVersion: linterCacheVersion,
      fileVersions: Array.from(newNoFailureFileVersions)
    };
    await JsonFile.saveAsync(updatedTslintCacheData, linterCacheFilePath, { ensureFolderExists: true });

    const duration: number = performance.now() - startTime;

    this._terminal.writeVerboseLine(`Lint: ${duration}ms (${fileCount} files)`);
  }

  protected abstract getCacheVersionAsync(): Promise<string>;

  protected abstract lintFileAsync(sourceFile: IExtendedSourceFile): Promise<TLintResult[]>;

  protected abstract lintingFinishedAsync(lintFailures: TLintResult[]): Promise<void>;

  protected abstract isFileExcludedAsync(filePath: string): Promise<boolean>;
}
