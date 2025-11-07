// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import type * as TTypescript from 'typescript';

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
import { AlreadyReportedError } from '@rushstack/node-core-library';

import type { LinterBase } from './LinterBase';
import { Eslint } from './Eslint';
import { Tslint } from './Tslint';
import type { IExtendedProgram, IExtendedSourceFile } from './internalTypings/TypeScriptInternals';

const PLUGIN_NAME: 'lint-plugin' = 'lint-plugin';
const TYPESCRIPT_PLUGIN_PACKAGE_NAME: '@rushstack/heft-typescript-plugin' =
  '@rushstack/heft-typescript-plugin';
const TYPESCRIPT_PLUGIN_NAME: typeof TypeScriptPluginName = 'typescript-plugin';
const FIX_PARAMETER_NAME: string = '--fix';

interface ILintPluginOptions {
  alwaysFix?: boolean;
  sarifLogPath?: string;
}

interface ILintOptions {
  taskSession: IHeftTaskSession;
  heftConfiguration: HeftConfiguration;
  tsProgram: IExtendedProgram;
  tsconfigFilePath: string;
  fix?: boolean;
  sarifLogPath?: string;
  changedFiles?: ReadonlySet<IExtendedSourceFile>;
}

function checkFix(taskSession: IHeftTaskSession, pluginOptions?: ILintPluginOptions): boolean {
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
  return fix;
}

function getSarifLogPath(
  heftConfiguration: HeftConfiguration,
  pluginOptions?: ILintPluginOptions
): string | undefined {
  const relativeSarifLogPath: string | undefined = pluginOptions?.sarifLogPath;
  const sarifLogPath: string | undefined =
    relativeSarifLogPath && path.resolve(heftConfiguration.buildFolderPath, relativeSarifLogPath);
  return sarifLogPath;
}

export default class LintPlugin implements IHeftTaskPlugin<ILintPluginOptions> {
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
    if (taskSession.parameters.watch) {
      let warningPrinted: boolean = false;
      taskSession.hooks.run.tapPromise(PLUGIN_NAME, async () => {
        if (warningPrinted) {
          return;
        }

        // Warn since don't run the linters when in watch mode.
        taskSession.logger.terminal.writeWarningLine("Linting isn't currently supported in watch mode");
        warningPrinted = true;
      });
      return;
    }

    const fix: boolean = checkFix(taskSession, pluginOptions);
    const sarifLogPath: string | undefined = getSarifLogPath(heftConfiguration, pluginOptions);

    // To support standalone linting, track if we have hooked to the typescript plugin
    let inTypescriptPhase: boolean = false;

    // Use the changed files hook to collect the files and programs from TypeScript
    // Also track the tsconfig path for cache file naming
    let typescriptChangedFiles: [IExtendedProgram, ReadonlySet<IExtendedSourceFile>, string][] = [];
    taskSession.requestAccessToPluginByName(
      TYPESCRIPT_PLUGIN_PACKAGE_NAME,
      TYPESCRIPT_PLUGIN_NAME,
      (accessor: ITypeScriptPluginAccessor) => {
        // Set the flag to indicate that we are in the typescript phase
        inTypescriptPhase = true;

        // Hook into the changed files hook to collect the changed files and their programs
        accessor.onChangedFilesHook.tap(PLUGIN_NAME, (changedFilesHookOptions: IChangedFilesHookOptions) => {
          // When using the TypeScript plugin, we need to determine the tsconfig path
          // The default tsconfig path is used when not explicitly specified
          const tsconfigPath: string = path.resolve(heftConfiguration.buildFolderPath, 'tsconfig.json');
          typescriptChangedFiles.push([
            changedFilesHookOptions.program as IExtendedProgram,
            changedFilesHookOptions.changedFiles as ReadonlySet<IExtendedSourceFile>,
            tsconfigPath
          ]);
        });
      }
    );

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (options: IHeftTaskRunHookOptions) => {
      // If we are not in the typescript phase, we need to create a typescript program
      // from the tsconfig file
      if (!inTypescriptPhase) {
        const tsconfigPath: string = path.resolve(heftConfiguration.buildFolderPath, 'tsconfig.json');
        const tsProgram: IExtendedProgram = await this._createTypescriptProgramAsync(
          heftConfiguration,
          taskSession
        );
        typescriptChangedFiles.push([tsProgram, new Set(tsProgram.getSourceFiles()), tsconfigPath]);
      }

      // Run the linters to completion. Linters emit errors and warnings to the logger.
      for (const [tsProgram, changedFiles, tsconfigFilePath] of typescriptChangedFiles) {
        try {
          await this._lintAsync({
            taskSession,
            heftConfiguration,
            tsProgram,
            tsconfigFilePath,
            changedFiles,
            fix,
            sarifLogPath
          });
        } catch (error) {
          if (!(error instanceof AlreadyReportedError)) {
            taskSession.logger.emitError(error as Error);
          }
        }
      }

      // Clear the changed files so that we don't lint them again if the task is executed again
      typescriptChangedFiles = [];

      // We rely on the linters to emit errors and warnings to the logger. If they do, we throw an
      // AlreadyReportedError to indicate that the task failed, but we don't want to throw an error
      // if the linter has already reported it.
      if (taskSession.logger.hasErrors) {
        throw new AlreadyReportedError();
      }
    });
  }

  private async _createTypescriptProgramAsync(
    heftConfiguration: HeftConfiguration,
    taskSession: IHeftTaskSession
  ): Promise<IExtendedProgram> {
    const typescriptPath: string = await heftConfiguration.rigPackageResolver.resolvePackageAsync(
      'typescript',
      taskSession.logger.terminal
    );
    const ts: typeof TTypescript = await import(typescriptPath);
    // Create a typescript program from the tsconfig file
    const tsconfigPath: string = path.resolve(heftConfiguration.buildFolderPath, 'tsconfig.json');
    const parsed: TTypescript.ParsedCommandLine = ts.parseJsonConfigFileContent(
      ts.readConfigFile(tsconfigPath, ts.sys.readFile).config,
      ts.sys,
      path.dirname(tsconfigPath)
    );
    const program: IExtendedProgram = ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options
    }) as IExtendedProgram;

    return program;
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
    this._tslintConfigFilePath = await Tslint.resolveTslintConfigFilePathAsync(heftConfiguration);
    if (this._tslintConfigFilePath) {
      this._tslintToolPath = await heftConfiguration.rigPackageResolver.resolvePackageAsync(
        'tslint',
        logger.terminal
      );
    }

    // Locate the eslint linter if enabled
    this._eslintConfigFilePath = await Eslint.resolveEslintConfigFilePathAsync(heftConfiguration);
    if (this._eslintConfigFilePath) {
      logger.terminal.writeVerboseLine(`ESLint config file path: ${this._eslintConfigFilePath}`);
      this._eslintToolPath = await heftConfiguration.rigPackageResolver.resolvePackageAsync(
        'eslint',
        logger.terminal
      );
    } else {
      logger.terminal.writeVerboseLine('No ESLint config file found');
    }
  }

  private async _lintAsync(options: ILintOptions): Promise<void> {
    const { taskSession, heftConfiguration, tsProgram, tsconfigFilePath, changedFiles, fix, sarifLogPath } =
      options;

    // Ensure that we have initialized. This promise is cached, so calling init
    // multiple times will only init once.
    await this._ensureInitializedAsync(taskSession, heftConfiguration);

    const linters: LinterBase<unknown>[] = [];
    if (this._eslintConfigFilePath && this._eslintToolPath) {
      const eslintLinter: Eslint = await Eslint.initializeAsync({
        tsProgram,
        tsconfigFilePath,
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
        tsconfigFilePath,
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
}
