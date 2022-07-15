// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import { FileSystem } from '@rushstack/node-core-library';
import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions,
  IScopedLogger
} from '@rushstack/heft';
import type {
  IChangedFilesHookOptions,
  IExtendedProgram,
  IExtendedSourceFile,
  ITypeScriptPluginAccessor
} from '@rushstack/heft-typescript-plugin';

import { Eslint } from './Eslint';
import { Tslint } from './Tslint';
import type { LinterBase } from './LinterBase';

const PLUGIN_NAME: string = 'LintPlugin';
const ESLINTRC_JS_FILENAME: string = '.eslintrc.js';
const ESLINTRC_CJS_FILENAME: string = '.eslintrc.cjs';

export default class LintPlugin implements IHeftTaskPlugin {
  private readonly _lintingPromises: Promise<LinterBase<unknown>[]>[] = [];

  // These are initliazed by _initAsync
  private _initPromise!: Promise<void>;
  private _eslintToolPath: string | undefined;
  private _eslintConfigFilePath: string | undefined;
  private _tslintToolPath: string | undefined;
  private _tslintConfigFilePath: string | undefined;

  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    // Use the changed files hook to kick off linting asynchronously
    taskSession.requestAccessToPluginByName(
      '@rushstack/heft-typescript-plugin',
      'TypeScriptPlugin',
      (accessor: ITypeScriptPluginAccessor) => {
        // Hook into the changed files hook to kick off linting, which will be awaited in the run hook
        accessor.onChangedFilesHook?.tap(PLUGIN_NAME, (changedFilesHookOptions: IChangedFilesHookOptions) => {
          this._lintingPromises.push(
            this._lintAsync(
              taskSession,
              heftConfiguration,
              changedFilesHookOptions.program,
              changedFilesHookOptions.changedFiles
            )
          );
        });
      }
    );

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (options: IHeftTaskRunHookOptions) => {
      // Run init again. Since we are intentionally swallowing init errors in the linting promises,
      // we will await the init here in order to ensure that init errors bubble up.
      await this._initAsync(taskSession, heftConfiguration);

      // Linter wasn't requested to run, exit early
      if (!this._lintingPromises.length) {
        return;
      }

      const lintingResults: LinterBase<unknown>[][] = await Promise.all(this._lintingPromises);

      // Log out errors from the gathered linters
      for (const lintingResult of lintingResults) {
        for (const linter of lintingResult) {
          linter.reportFailures();
        }
      }
    });
  }

  private async _initAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    // Make sure that we only ever init once by memoizing the init promise
    if (!this._initPromise) {
      this._initPromise = this._initInnerAsync(heftConfiguration, taskSession.logger);
    }
    await this._initPromise;
  }

  private async _initInnerAsync(heftConfiguration: HeftConfiguration, logger: IScopedLogger): Promise<void> {
    // Locate the tslint linter if enabled
    this._tslintConfigFilePath = await this._resolveTslintConfigFilePathAsync(heftConfiguration);
    if (this._tslintConfigFilePath) {
      this._tslintToolPath = await heftConfiguration.rigToolResolver.resolvePackageAsync(
        'tslint',
        logger.terminal
      );
    }

    // Locate the eslint linter if enabled
    this._eslintConfigFilePath = await this._resolveEslintConfigFilePathAsync(heftConfiguration);
    if (this._eslintConfigFilePath) {
      this._eslintToolPath = await heftConfiguration.rigToolResolver.resolvePackageAsync(
        'eslint',
        logger.terminal
      );
    }
  }

  private async _lintAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    tsProgram: IExtendedProgram,
    changedFiles?: Set<IExtendedSourceFile>
  ): Promise<LinterBase<unknown>[]> {
    try {
      await this._initAsync(taskSession, heftConfiguration);
    } catch {
      // Initialization failures are handled in the run hook. For now, just return
      return [];
    }

    // Now that we know we have initialized properly, run the linter(s)
    const lintingPromises: Promise<LinterBase<unknown>>[] = [];
    if (this._eslintToolPath) {
      lintingPromises.push(
        this._runEslintAsync(
          taskSession,
          heftConfiguration,
          this._eslintToolPath,
          this._eslintConfigFilePath!,
          tsProgram,
          changedFiles
        )
      );
    }
    if (this._tslintToolPath) {
      lintingPromises.push(
        this._runTslintAsync(
          taskSession,
          heftConfiguration,
          this._tslintToolPath,
          this._tslintConfigFilePath!,
          tsProgram,
          changedFiles
        )
      );
    }

    return await Promise.all(lintingPromises);
  }

  private async _runEslintAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    eslintToolPath: string,
    eslintConfigFilePath: string,
    tsProgram: IExtendedProgram,
    changedFiles?: Set<IExtendedSourceFile> | undefined
  ): Promise<Eslint> {
    const eslint: Eslint = new Eslint({
      scopedLogger: taskSession.logger,
      eslintPackagePath: eslintToolPath,
      linterConfigFilePath: eslintConfigFilePath,
      buildFolderPath: heftConfiguration.buildFolder,
      buildMetadataFolderPath: taskSession.cacheFolder
    });

    eslint.printVersionHeader();

    const typeScriptFilenames: Set<string> = new Set(tsProgram.getRootFileNames());
    await eslint.performLintingAsync({
      tsProgram,
      typeScriptFilenames,
      changedFiles: changedFiles || new Set(tsProgram.getSourceFiles())
    });

    return eslint;
  }

  private async _runTslintAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    tslintToolPath: string,
    tslintConfigFilePath: string,
    tsProgram: IExtendedProgram,
    changedFiles?: Set<IExtendedSourceFile> | undefined
  ): Promise<Tslint> {
    const tslint: Tslint = new Tslint({
      scopedLogger: taskSession.logger,
      tslintPackagePath: tslintToolPath,
      linterConfigFilePath: tslintConfigFilePath,
      buildFolderPath: heftConfiguration.buildFolder,
      buildMetadataFolderPath: taskSession.cacheFolder
    });

    tslint.printVersionHeader();

    const typeScriptFilenames: Set<string> = new Set(tsProgram.getRootFileNames());
    await tslint.performLintingAsync({
      tsProgram,
      typeScriptFilenames,
      changedFiles: changedFiles || new Set(tsProgram.getSourceFiles())
    });

    return tslint;
  }

  private async _resolveTslintConfigFilePathAsync(
    heftConfiguration: HeftConfiguration
  ): Promise<string | undefined> {
    const tslintConfigFilePath: string = `${heftConfiguration.buildFolder}/tslint.json`;
    const tslintConfigFileExists: boolean = await FileSystem.existsAsync(tslintConfigFilePath);
    return tslintConfigFileExists ? tslintConfigFilePath : undefined;
  }

  private async _resolveEslintConfigFilePathAsync(
    heftConfiguration: HeftConfiguration
  ): Promise<string | undefined> {
    // When project is configured with "type": "module" in package.json, the config file must have a .cjs extension
    // so use it if it exists
    const defaultPath: string = `${heftConfiguration.buildFolder}/${ESLINTRC_JS_FILENAME}`;
    const alternativePath: string = `${heftConfiguration.buildFolder}/${ESLINTRC_CJS_FILENAME}`;
    const [alternativePathExists, defaultPathExists] = await Promise.all([
      FileSystem.existsAsync(alternativePath),
      FileSystem.existsAsync(defaultPath)
    ]);

    if (alternativePathExists && defaultPathExists) {
      throw new Error(
        `Project contains both "${ESLINTRC_JS_FILENAME}" and "${ESLINTRC_CJS_FILENAME}". Ensure that only ` +
          'one of these files is present in the project.'
      );
    } else if (alternativePathExists) {
      return alternativePath;
    } else if (defaultPathExists) {
      return defaultPath;
    } else {
      return undefined;
    }
  }
}
