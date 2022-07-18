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
  TypeScriptPluginName,
  IChangedFilesHookOptions,
  ITypeScriptPluginAccessor
} from '@rushstack/heft-typescript-plugin';

import { Eslint } from './Eslint';
import { Tslint } from './Tslint';
import type { IExtendedProgram, IExtendedSourceFile } from './internalTypings/TypeScriptInternals';

const PLUGIN_NAME: string = 'LintPlugin';
const TYPESCRIPT_PLUGIN_NAME: typeof TypeScriptPluginName = 'TypeScriptPlugin';
const ESLINTRC_JS_FILENAME: string = '.eslintrc.js';
const ESLINTRC_CJS_FILENAME: string = '.eslintrc.cjs';

export default class LintPlugin implements IHeftTaskPlugin {
  private readonly _lintingPromises: Promise<void>[] = [];

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
      TYPESCRIPT_PLUGIN_NAME,
      (accessor: ITypeScriptPluginAccessor) => {
        // Hook into the changed files hook to kick off linting, which will be awaited in the run hook
        accessor.onChangedFilesHook.tap(PLUGIN_NAME, (changedFilesHookOptions: IChangedFilesHookOptions) => {
          this._lintingPromises.push((async () => {
            // Ensure that we have initialized. This promise is cached, so calling init
            // multiple times will only init once.
            let linterInitialized: boolean = false;
            try {
              await this._ensureInitializedAsync(taskSession, heftConfiguration);
              linterInitialized = true;
            } catch (e) {
              // Swwallow the error, but avoid running the linter. The call to ensure the
              // linter is initialized returns a memoized promise. We also ensure that the
              // linters are initialized in the run hook. In this way, we can ensure that
              // the init error is thrown a single time in the run hook, instead of multiple
              // times in the changed files hook.
            }
            if (linterInitialized) {
              await this._lintAsync(
                taskSession,
                heftConfiguration,
                changedFilesHookOptions.program as IExtendedProgram,
                changedFilesHookOptions.changedFiles as ReadonlySet<IExtendedSourceFile>
              );
            }
          })());
        });
      }
    );

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (options: IHeftTaskRunHookOptions) => {
      // Ensure we are initialized. Since we are intentionally swallowing the init errors in
      // the onChangedFilesHook tap, we will call _ensureInitializedAsync again in the run hook.
      // This allows the errors to be surfaced during lint plugin execution instead of during
      // TypeScript plugin execution.
      await this._ensureInitializedAsync(taskSession, heftConfiguration);

      // Run the linters to completion. Linters emit errors and warnings to the logger.
      await Promise.all(this._lintingPromises);
    });
  }

  private async _ensureInitializedAsync(
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
    changedFiles?: ReadonlySet<IExtendedSourceFile>
  ): Promise<void> {
    // Now that we know we have initialized properly, run the linter(s)
    const lintingPromises: Promise<void>[] = [];
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

    await Promise.all(lintingPromises);
  }

  private async _runEslintAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    eslintToolPath: string,
    eslintConfigFilePath: string,
    tsProgram: IExtendedProgram,
    changedFiles?: ReadonlySet<IExtendedSourceFile> | undefined
  ): Promise<void> {
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
  }

  private async _runTslintAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    tslintToolPath: string,
    tslintConfigFilePath: string,
    tsProgram: IExtendedProgram,
    changedFiles?: ReadonlySet<IExtendedSourceFile> | undefined
  ): Promise<void> {
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
