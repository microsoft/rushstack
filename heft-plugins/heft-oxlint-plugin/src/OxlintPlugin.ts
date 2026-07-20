// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type { ChildProcess } from 'node:child_process';

import type { HeftConfiguration, IHeftTaskSession, IHeftTaskPlugin, IScopedLogger } from '@rushstack/heft';
import type {
  TypeScriptPluginName,
  IChangedFilesHookOptions,
  ITypeScriptPluginAccessor
} from '@rushstack/heft-typescript-plugin';
import {
  AlreadyReportedError,
  Executable,
  FileSystem,
  Import,
  JsonFile,
  type IWaitForExitResult
} from '@rushstack/node-core-library';

import {
  buildCommonArgs,
  buildFixArgs,
  resolveLintPaths,
  filterChangedFilePaths,
  createFileErrorForDiagnostic,
  type IOxlintPluginOptions,
  type IOxlintJsonOutput
} from './OxlintHelpers';

export type {
  IOxlintPluginOptions,
  IOxlintDiagnostic,
  IOxlintDiagnosticLabel,
  IOxlintDiagnosticSpan,
  IOxlintJsonOutput
} from './OxlintHelpers';

const PLUGIN_NAME: 'oxlint-plugin' = 'oxlint-plugin';
const TYPESCRIPT_PLUGIN_PACKAGE_NAME: '@rushstack/heft-typescript-plugin' =
  '@rushstack/heft-typescript-plugin';
const TYPESCRIPT_PLUGIN_NAME: typeof TypeScriptPluginName = 'typescript-plugin';
const FIX_PARAMETER_NAME: string = '--fix';

interface IOxlintInvocation {
  binPath: string;
  buildFolderPath: string;
  args: string[];
  logger: IScopedLogger;
}

function checkFix(taskSession: IHeftTaskSession, pluginOptions?: IOxlintPluginOptions): boolean {
  let fix: boolean =
    !!pluginOptions?.alwaysFix || taskSession.parameters.getFlagParameter(FIX_PARAMETER_NAME).value;
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

export default class OxlintPlugin implements IHeftTaskPlugin<IOxlintPluginOptions> {
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions?: IOxlintPluginOptions
  ): void {
    // Disable linting in watch mode. Some lint rules require the context of multiple files, which
    // may not be available in watch mode.
    if (taskSession.parameters.watch) {
      let warningPrinted: boolean = false;
      taskSession.hooks.run.tapPromise(PLUGIN_NAME, async () => {
        if (warningPrinted) {
          return;
        }
        taskSession.logger.terminal.writeWarningLine("Linting isn't currently supported in watch mode");
        warningPrinted = true;
      });
      return;
    }

    // Mirror the behavior of the ESLint plugin: when running alongside the TypeScript plugin, only
    // lint the files that TypeScript reports as changed so that incremental builds stay fast. When
    // run standalone (no TypeScript phase), fall back to linting the configured paths.
    let inTypeScriptPhase: boolean = false;
    let lintEverything: boolean = false;
    const changedFilePaths: Set<string> = new Set();

    taskSession.requestAccessToPluginByName(
      TYPESCRIPT_PLUGIN_PACKAGE_NAME,
      TYPESCRIPT_PLUGIN_NAME,
      (accessor: ITypeScriptPluginAccessor) => {
        inTypeScriptPhase = true;
        accessor.onChangedFilesHook.tap(PLUGIN_NAME, (options: IChangedFilesHookOptions) => {
          if (options.changedFiles) {
            for (const changedFile of options.changedFiles) {
              changedFilePaths.add(changedFile.fileName);
            }
          } else {
            // An undefined "changedFiles" set indicates a full (non-incremental) build, so lint
            // the configured paths in their entirety.
            lintEverything = true;
          }
        });
      }
    );

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async () => {
      let lintPaths: ReadonlyArray<string>;
      if (inTypeScriptPhase && !lintEverything) {
        lintPaths = filterChangedFilePaths(changedFilePaths, heftConfiguration.buildFolderPath);
        if (lintPaths.length === 0) {
          taskSession.logger.terminal.writeVerboseLine('No changed files to lint');
          return;
        }
      } else {
        lintPaths = resolveLintPaths(pluginOptions);
      }

      await this._runOxlintAsync(taskSession, heftConfiguration, pluginOptions, lintPaths);
    });
  }

  private async _runOxlintAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IOxlintPluginOptions | undefined,
    lintPaths: ReadonlyArray<string>
  ): Promise<void> {
    const logger: IScopedLogger = taskSession.logger;
    const buildFolderPath: string = heftConfiguration.buildFolderPath;

    const binPath: string = await this._getOxlintBinPathAsync(buildFolderPath, logger);

    const fix: boolean = checkFix(taskSession, pluginOptions);
    const commonArgs: string[] = buildCommonArgs(pluginOptions);
    const fixArgs: string[] = buildFixArgs(fix, pluginOptions);

    // Run oxlint with JSON output so that diagnostics can be parsed and surfaced through the Heft logger.
    const jsonArgs: string[] = [...commonArgs, ...fixArgs, '--format=json', ...lintPaths];
    const jsonResult: IWaitForExitResult<string> = await this._spawnOxlintAsync({
      binPath,
      buildFolderPath,
      args: jsonArgs,
      logger
    });

    this._reportDiagnostics(jsonResult, buildFolderPath, logger);

    // If requested, run oxlint a second time to produce a SARIF log file. oxlint can emit SARIF to
    // stdout but does not support writing directly to a file.
    if (pluginOptions?.sarifLogPath) {
      await this._writeSarifLogAsync({
        binPath,
        buildFolderPath,
        commonArgs,
        lintPaths,
        sarifLogPath: pluginOptions.sarifLogPath,
        logger
      });
    }

    // We rely on the diagnostics reported above to emit errors to the logger. If they did, we throw an
    // AlreadyReportedError to indicate that the task failed without re-reporting the errors.
    if (logger.hasErrors) {
      throw new AlreadyReportedError();
    }
  }

  private async _getOxlintBinPathAsync(buildFolderPath: string, logger: IScopedLogger): Promise<string> {
    // Resolve the oxlint package relative to the project being linted, then read its "bin" entry.
    const packageJsonPath: string = Import.resolveModule({
      modulePath: 'oxlint/package.json',
      baseFolderPath: buildFolderPath
    });
    const packageFolder: string = path.dirname(packageJsonPath);
    const packageJson: { bin?: string | Record<string, string> } = await JsonFile.loadAsync(packageJsonPath);

    let relativeBinPath: string | undefined;
    if (typeof packageJson.bin === 'string') {
      relativeBinPath = packageJson.bin;
    } else if (packageJson.bin) {
      relativeBinPath = packageJson.bin.oxlint;
    }

    if (!relativeBinPath) {
      throw new Error('Unable to determine the oxlint binary path from its package.json "bin" field.');
    }

    const binPath: string = path.resolve(packageFolder, relativeBinPath);
    logger.terminal.writeVerboseLine(`Resolved oxlint binary: ${binPath}`);
    return binPath;
  }

  private async _spawnOxlintAsync(invocation: IOxlintInvocation): Promise<IWaitForExitResult<string>> {
    const { binPath, buildFolderPath, args, logger } = invocation;

    // The oxlint "bin" launcher is an ESM Node script, so it must be invoked via Node directly.
    logger.terminal.writeVerboseLine(`Running oxlint: node ${binPath} ${args.join(' ')}`);
    const childProcess: ChildProcess = Executable.spawn(process.execPath, [binPath, ...args], {
      currentWorkingDirectory: buildFolderPath,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    return await Executable.waitForExitAsync(childProcess, { encoding: 'utf8' });
  }

  private _reportDiagnostics(
    result: IWaitForExitResult<string>,
    buildFolderPath: string,
    logger: IScopedLogger
  ): void {
    const stdout: string = (result.stdout ?? '').trim();

    if (!stdout) {
      // oxlint produced no JSON payload. If it also failed, surface stderr to aid debugging.
      if (result.exitCode !== 0 && result.stderr) {
        logger.emitError(new Error(`oxlint failed:\n${result.stderr.trim()}`));
      }
      return;
    }

    let parsed: IOxlintJsonOutput;
    try {
      parsed = JSON.parse(stdout) as IOxlintJsonOutput;
    } catch (error) {
      logger.emitError(new Error(`Unable to parse oxlint JSON output: ${(error as Error).message}`));
      if (result.stderr) {
        logger.terminal.writeVerboseLine(result.stderr.trim());
      }
      return;
    }

    for (const diagnostic of parsed.diagnostics ?? []) {
      const fileError: ReturnType<typeof createFileErrorForDiagnostic> = createFileErrorForDiagnostic(
        diagnostic,
        buildFolderPath
      );
      if (diagnostic.severity === 'error') {
        logger.emitError(fileError);
      } else {
        logger.emitWarning(fileError);
      }
    }
  }

  private async _writeSarifLogAsync(options: {
    binPath: string;
    buildFolderPath: string;
    commonArgs: string[];
    lintPaths: ReadonlyArray<string>;
    sarifLogPath: string;
    logger: IScopedLogger;
  }): Promise<void> {
    const { binPath, buildFolderPath, commonArgs, lintPaths, sarifLogPath, logger } = options;

    const sarifArgs: string[] = [...commonArgs, '--format=sarif', ...lintPaths];
    const sarifResult: IWaitForExitResult<string> = await this._spawnOxlintAsync({
      binPath,
      buildFolderPath,
      args: sarifArgs,
      logger
    });

    const absoluteSarifLogPath: string = path.resolve(buildFolderPath, sarifLogPath);
    await FileSystem.writeFileAsync(absoluteSarifLogPath, sarifResult.stdout ?? '', {
      ensureFolderExists: true
    });
    logger.terminal.writeVerboseLine(`Wrote oxlint SARIF log to: ${absoluteSarifLogPath}`);
  }
}
