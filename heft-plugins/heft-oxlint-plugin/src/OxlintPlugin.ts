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
  extractDiagnosticsFromSarif,
  batchLintPaths,
  mergeSarifLogs,
  type IOxlintPluginOptions,
  type IOxlintJsonOutput,
  type IOxlintSarifLog,
  type IOxlintDiagnostic
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

// oxlint delegates type-aware rules (--type-aware / --type-check) to the native "tsgolint" binary
// from the "oxlint-tsgolint" package. It honors OXLINT_TSGOLINT_PATH, letting us point it at a copy
// resolved via the rig package resolver (installed in the project or a shared rig).
const TSGOLINT_PACKAGE_NAME: 'oxlint-tsgolint' = 'oxlint-tsgolint';
const TSGOLINT_NATIVE_PACKAGE_SCOPE: '@oxlint-tsgolint' = '@oxlint-tsgolint';
const OXLINT_TSGOLINT_PATH_ENV_VARIABLE_NAME: 'OXLINT_TSGOLINT_PATH' = 'OXLINT_TSGOLINT_PATH';

interface IOxlintInvocation {
  binPath: string;
  buildFolderPath: string;
  args: string[];
  logger: IScopedLogger;
  environment?: NodeJS.ProcessEnv;
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

      await this.#runOxlintAsync(taskSession, heftConfiguration, pluginOptions, lintPaths);
    });
  }

  async #runOxlintAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IOxlintPluginOptions | undefined,
    lintPaths: ReadonlyArray<string>
  ): Promise<void> {
    const logger: IScopedLogger = taskSession.logger;
    const buildFolderPath: string = heftConfiguration.buildFolderPath;

    const binPath: string = await this.#getOxlintBinPathAsync(heftConfiguration, logger);

    const fix: boolean = checkFix(taskSession, pluginOptions);
    const commonArgs: string[] = buildCommonArgs(pluginOptions);
    const fixArgs: string[] = buildFixArgs(fix, pluginOptions);
    const sarifLogPath: string | undefined = pluginOptions?.sarifLogPath;

    // Type-aware rules require the external tsgolint binary. Like the ESLint plugin, resolve it from
    // the project (or its rig) rather than bundling it, and point oxlint at it via an environment
    // variable so the tooling can live in a shared rig.
    let environment: NodeJS.ProcessEnv | undefined;
    if (pluginOptions?.typeAware || pluginOptions?.typeCheck) {
      const tsgolintBinaryPath: string = await this.#getTsgolintBinaryPathAsync(heftConfiguration, logger);
      environment = {
        ...process.env,
        [OXLINT_TSGOLINT_PATH_ENV_VARIABLE_NAME]: tsgolintBinaryPath
      };
    }

    // When a SARIF log is requested, run oxlint with SARIF output. The SARIF payload contains all of
    // the diagnostics we need, so we extract them from it rather than paying the full lint cost a
    // second time. Otherwise, use JSON output, which is a more compact format for diagnostic
    // reporting.
    const format: string = sarifLogPath ? 'sarif' : 'json';
    const fixedArgs: string[] = [...commonArgs, ...fixArgs, `--format=${format}`];

    // Split the lint paths into batches so that a project with a very large number of changed files
    // does not exceed the operating system's command-line length limit (notably ~32 KiB on Windows).
    // In the common case this yields a single batch and behaves exactly like a single oxlint run.
    const batches: string[][] = batchLintPaths([process.execPath, binPath, ...fixedArgs], lintPaths);
    if (batches.length > 1) {
      logger.terminal.writeVerboseLine(
        `Linting ${lintPaths.length} paths across ${batches.length} oxlint invocations to stay ` +
          'within the command-line length limit'
      );
    }

    const diagnostics: IOxlintDiagnostic[] = [];
    const sarifBatchOutputs: string[] = [];

    for (const batch of batches) {
      const result: IWaitForExitResult<string> = await this.#spawnOxlintAsync({
        binPath,
        buildFolderPath,
        args: [...fixedArgs, ...batch],
        logger,
        environment
      });

      const stdout: string = (result.stdout ?? '').trim();
      if (!stdout) {
        // oxlint produced no payload. If it also failed, surface stderr to aid debugging.
        if (result.exitCode !== 0 && result.stderr) {
          logger.emitError(new Error(`oxlint failed:\n${result.stderr.trim()}`));
        }
        continue;
      }

      if (sarifLogPath) {
        const parsed: IOxlintSarifLog | undefined = this.#parseOxlintOutput<IOxlintSarifLog>(
          stdout,
          'SARIF',
          result.stderr,
          logger
        );
        if (parsed) {
          sarifBatchOutputs.push(stdout);
          diagnostics.push(...extractDiagnosticsFromSarif(parsed));
        }
      } else {
        const parsed: IOxlintJsonOutput | undefined = this.#parseOxlintOutput<IOxlintJsonOutput>(
          stdout,
          'JSON',
          result.stderr,
          logger
        );
        if (parsed) {
          diagnostics.push(...(parsed.diagnostics ?? []));
        }
      }
    }

    this.#emitDiagnostics(diagnostics, buildFolderPath, logger);

    // oxlint can emit SARIF to stdout but does not support writing directly to a file, so persist the
    // captured output (merged across batches when necessary) ourselves.
    if (sarifLogPath && sarifBatchOutputs.length > 0) {
      const absoluteSarifLogPath: string = path.resolve(buildFolderPath, sarifLogPath);
      await FileSystem.writeFileAsync(absoluteSarifLogPath, mergeSarifLogs(sarifBatchOutputs), {
        ensureFolderExists: true
      });
      logger.terminal.writeVerboseLine(`Wrote oxlint SARIF log to: ${absoluteSarifLogPath}`);
    }

    // We rely on the diagnostics reported above to emit errors to the logger. If they did, we throw an
    // AlreadyReportedError to indicate that the task failed without re-reporting the errors.
    if (logger.hasErrors) {
      throw new AlreadyReportedError();
    }
  }

  async #getOxlintBinPathAsync(heftConfiguration: HeftConfiguration, logger: IScopedLogger): Promise<string> {
    // Resolve the oxlint package using the rig package resolver, which allows the linter to be
    // installed in the project's rig rather than directly in the project, then read its "bin" entry.
    const packageFolder: string = await heftConfiguration.rigPackageResolver.resolvePackageAsync(
      'oxlint',
      logger.terminal
    );
    const packageJsonPath: string = path.join(packageFolder, 'package.json');
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

  async #getTsgolintBinaryPathAsync(
    heftConfiguration: HeftConfiguration,
    logger: IScopedLogger
  ): Promise<string> {
    // Resolve "oxlint-tsgolint" via the rig package resolver (project or rig). It provides the native
    // binary through optional dependencies named "@oxlint-tsgolint/<os>-<arch>".
    const packageFolder: string = await heftConfiguration.rigPackageResolver.resolvePackageAsync(
      TSGOLINT_PACKAGE_NAME,
      logger.terminal
    );

    const nativePackageName: string = `${TSGOLINT_NATIVE_PACKAGE_SCOPE}/${process.platform}-${process.arch}`;
    const binaryName: string = process.platform === 'win32' ? 'tsgolint.exe' : 'tsgolint';

    let nativePackageJsonPath: string;
    try {
      // Resolve the native package's "package.json" (the binary itself is extensionless and not a
      // resolvable module) and derive the binary path from its folder.
      nativePackageJsonPath = await Import.resolveModuleAsync({
        modulePath: `${nativePackageName}/package.json`,
        baseFolderPath: packageFolder
      });
    } catch (error) {
      throw new Error(
        `Unable to resolve the tsgolint native binary package "${nativePackageName}" from ` +
          `"${packageFolder}". Ensure the "${TSGOLINT_PACKAGE_NAME}" package is installed for this ` +
          `platform so that type-aware linting can run. (${(error as Error).message})`
      );
    }

    const binaryPath: string = path.join(path.dirname(nativePackageJsonPath), binaryName);
    if (!(await FileSystem.existsAsync(binaryPath))) {
      throw new Error(
        `The tsgolint native binary was not found at the expected location "${binaryPath}". Ensure the ` +
          `"${TSGOLINT_PACKAGE_NAME}" package is correctly installed for this platform.`
      );
    }

    logger.terminal.writeVerboseLine(`Resolved tsgolint binary: ${binaryPath}`);
    return binaryPath;
  }

  async #spawnOxlintAsync(invocation: IOxlintInvocation): Promise<IWaitForExitResult<string>> {
    const { binPath, buildFolderPath, args, logger, environment } = invocation;

    // The oxlint "bin" launcher is an ESM Node script, so it must be invoked via Node directly.
    logger.terminal.writeVerboseLine(`Running oxlint: node ${binPath} ${args.join(' ')}`);
    const childProcess: ChildProcess = Executable.spawn(process.execPath, [binPath, ...args], {
      currentWorkingDirectory: buildFolderPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      environment
    });

    return await Executable.waitForExitAsync(childProcess, { encoding: 'utf8' });
  }

  #parseOxlintOutput<T>(
    stdout: string,
    formatLabel: string,
    stderr: string | undefined,
    logger: IScopedLogger
  ): T | undefined {
    try {
      return JSON.parse(stdout) as T;
    } catch (error) {
      logger.emitError(
        new Error(`Unable to parse oxlint ${formatLabel} output: ${(error as Error).message}`)
      );
      if (stderr) {
        logger.terminal.writeVerboseLine(stderr.trim());
      }
      return undefined;
    }
  }

  #emitDiagnostics(
    diagnostics: ReadonlyArray<IOxlintDiagnostic>,
    buildFolderPath: string,
    logger: IScopedLogger
  ): void {
    for (const diagnostic of diagnostics) {
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
}
