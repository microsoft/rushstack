// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

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

import type { LinterBase } from './LinterBase';
import { Eslint } from './Eslint';
import { Tslint } from './Tslint';
import type { IExtendedProgram, IExtendedSourceFile } from './internalTypings/TypeScriptInternals';

const PLUGIN_NAME: 'lint-plugin' = 'lint-plugin';
const TYPESCRIPT_PLUGIN_NAME: typeof TypeScriptPluginName = 'typescript-plugin';
const FIX_PARAMETER_NAME: string = '--fix';
const ESLINTRC_JS_FILENAME: string = '.eslintrc.js';
const ESLINTRC_CJS_FILENAME: string = '.eslintrc.cjs';

interface ILintPluginOptions {
  alwaysFix?: boolean;
  sarifLogPath?: string;
}

interface ILintOptions {
  taskSession: IHeftTaskSession;
  heftConfiguration: HeftConfiguration;
  tsProgram: IExtendedProgram;
  fix?: boolean;
  sarifLogPath?: string;
  changedFiles?: ReadonlySet<IExtendedSourceFile>;
}

export default class LintPlugin implements IHeftTaskPlugin<ILintPluginOptions> {
  private readonly _lintingPromises: Promise<void>[] = [];

  // These are initliazed by _initAsync
  private _initPromise!: Promise<void>;
  private _eslintToolPath: string | undefined;
  private _eslintConfigFilePath: string | undefined;
  private _tslintToolPath: string | undefined;
  private _tslintConfigFilePath: string | undefined;

  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions?: ILintPluginOptions
  ): void {
    // Disable linting in watch mode. Some lint rules require the context of multiple files, which
    // may not be available in watch mode.
    if (!taskSession.parameters.watch) {
      let fix: boolean =
        pluginOptions?.alwaysFix || taskSession.parameters.getFlagParameter(FIX_PARAMETER_NAME).value;
      if (fix && taskSession.parameters.production) {
        // Write this as a standard output message since we don't want to throw errors when running in
        // production mode and "alwaysFix" is specified in the plugin options
        taskSession.logger.terminal.writeLine(
          'Fix mode has been disabled since Heft is running in production mode'
        );
        fix = false;
      }

      const relativeSarifLogPath: string | undefined = pluginOptions?.sarifLogPath;
      const sarifLogPath: string | undefined =
        relativeSarifLogPath && path.resolve(heftConfiguration.buildFolderPath, relativeSarifLogPath);

      // Use the changed files hook to kick off linting asynchronously
      taskSession.requestAccessToPluginByName(
        '@rushstack/heft-typescript-plugin',
        TYPESCRIPT_PLUGIN_NAME,
        (accessor: ITypeScriptPluginAccessor) => {
          // Hook into the changed files hook to kick off linting, which will be awaited in the run hook
          accessor.onChangedFilesHook.tap(
            PLUGIN_NAME,
            (changedFilesHookOptions: IChangedFilesHookOptions) => {
              const lintingPromise: Promise<void> = this._lintAsync({
                taskSession,
                heftConfiguration,
                fix,
                sarifLogPath,
                tsProgram: changedFilesHookOptions.program as IExtendedProgram,
                changedFiles: changedFilesHookOptions.changedFiles as ReadonlySet<IExtendedSourceFile>
              });
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

    let warningPrinted: boolean = false;

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (options: IHeftTaskRunHookOptions) => {
      // Run the linters to completion. Linters emit errors and warnings to the logger.
      if (taskSession.parameters.watch) {
        if (warningPrinted) {
          return;
        }
        warningPrinted = true;

        // Warn since don't run the linters when in watch mode.
        taskSession.logger.terminal.writeWarningLine("Linting isn't currently supported in watch mode");
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

  private async _lintAsync(options: ILintOptions): Promise<void> {
    const { taskSession, heftConfiguration, tsProgram, changedFiles, fix, sarifLogPath } = options;

    // Ensure that we have initialized. This promise is cached, so calling init
    // multiple times will only init once.
    await this._ensureInitializedAsync(taskSession, heftConfiguration);

    const linters: LinterBase<unknown>[] = [];
    if (this._eslintConfigFilePath && this._eslintToolPath) {
      const eslintLinter: Eslint = await Eslint.initializeAsync({
        tsProgram,
        fix,
        sarifLogPath,
        scopedLogger: taskSession.logger,
        linterToolPath: this._eslintToolPath,
        linterConfigFilePath: this._eslintConfigFilePath,
        buildFolderPath: heftConfiguration.buildFolderPath,
        buildMetadataFolderPath: taskSession.tempFolderPath
      });
      linters.push(eslintLinter);
    }

    if (this._tslintConfigFilePath && this._tslintToolPath) {
      const tslintLinter: Tslint = await Tslint.initializeAsync({
        tsProgram,
        fix,
        scopedLogger: taskSession.logger,
        linterToolPath: this._tslintToolPath,
        linterConfigFilePath: this._tslintConfigFilePath,
        buildFolderPath: heftConfiguration.buildFolderPath,
        buildMetadataFolderPath: taskSession.tempFolderPath
      });
      linters.push(tslintLinter);
    }

    // Now that we know we have initialized properly, run the linter(s)
    await Promise.all(linters.map((linter) => this._runLinterAsync(linter, tsProgram, changedFiles)));
  }

  private async _runLinterAsync(
    linter: LinterBase<unknown>,
    tsProgram: IExtendedProgram,
    changedFiles?: ReadonlySet<IExtendedSourceFile> | undefined
  ): Promise<void> {
    linter.printVersionHeader();

    const typeScriptFilenames: Set<string> = new Set(tsProgram.getRootFileNames());
    await linter.performLintingAsync({
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
