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

const PLUGIN_NAME: 'lint-plugin' = 'lint-plugin';
const TYPESCRIPT_PLUGIN_NAME: typeof TypeScriptPluginName = 'typescript-plugin';
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
    // Disable linting in watch mode. Some lint rules require the context of multiple files, which
    // may not be available in watch mode.
    if (!taskSession.parameters.watch) {
      // Use the changed files hook to kick off linting asynchronously
      taskSession.requestAccessToPluginByName(
        '@rushstack/heft-typescript-plugin',
        TYPESCRIPT_PLUGIN_NAME,
        (accessor: ITypeScriptPluginAccessor) => {
          // Hook into the changed files hook to kick off linting, which will be awaited in the run hook
          accessor.onChangedFilesHook.tap(
            PLUGIN_NAME,
            (changedFilesHookOptions: IChangedFilesHookOptions) => {
              const lintingPromise: Promise<void> = this._lintAsync(
                taskSession,
                heftConfiguration,
                changedFilesHookOptions.program as IExtendedProgram,
                changedFilesHookOptions.changedFiles as ReadonlySet<IExtendedSourceFile>
              );
              lintingPromise.catch(() => {
                // Suppress unhandled promise rejection error
              });
              // Hold on to the original promise, which will throw in the run hook if it unexpectedly fails
              this._lintingPromises.push(lintingPromise);
            }
          );
        }
      );
    }

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (options: IHeftTaskRunHookOptions) => {
      // Run the linters to completion. Linters emit errors and warnings to the logger.
      if (taskSession.parameters.watch) {
        // Warn since don't run the linters when in watch mode.
        taskSession.logger.terminal.writeWarningLine("Linting isn't currently supported in watch mode.");
      } else {
        await Promise.all(this._lintingPromises);
      }
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
      this._tslintToolPath = await heftConfiguration.rigPackageResolver.resolvePackageAsync(
        'tslint',
        logger.terminal
      );
    }

    // Locate the eslint linter if enabled
    this._eslintConfigFilePath = await this._resolveEslintConfigFilePathAsync(heftConfiguration);
    if (this._eslintConfigFilePath) {
      this._eslintToolPath = await heftConfiguration.rigPackageResolver.resolvePackageAsync(
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
    // Ensure that we have initialized. This promise is cached, so calling init
    // multiple times will only init once.
    await this._ensureInitializedAsync(taskSession, heftConfiguration);

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
      buildFolderPath: heftConfiguration.buildFolderPath,
      buildMetadataFolderPath: taskSession.tempFolderPath
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
      buildFolderPath: heftConfiguration.buildFolderPath,
      buildMetadataFolderPath: taskSession.tempFolderPath
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
    const tslintConfigFilePath: string = `${heftConfiguration.buildFolderPath}/tslint.json`;
    const tslintConfigFileExists: boolean = await FileSystem.existsAsync(tslintConfigFilePath);
    return tslintConfigFileExists ? tslintConfigFilePath : undefined;
  }

  private async _resolveEslintConfigFilePathAsync(
    heftConfiguration: HeftConfiguration
  ): Promise<string | undefined> {
    // When project is configured with "type": "module" in package.json, the config file must have a .cjs extension
    // so use it if it exists
    const defaultPath: string = `${heftConfiguration.buildFolderPath}/${ESLINTRC_JS_FILENAME}`;
    const alternativePath: string = `${heftConfiguration.buildFolderPath}/${ESLINTRC_CJS_FILENAME}`;
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
