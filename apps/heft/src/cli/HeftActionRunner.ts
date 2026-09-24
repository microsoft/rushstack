// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { fstatSync, statSync, type Stats } from 'node:fs';
import { performance } from 'node:perf_hooks';
import type * as ReadlineModule from 'node:readline';
import os from 'node:os';

import { AlreadyReportedError, InternalError, type IPackageJson } from '@rushstack/node-core-library';
import { Colorize, ConsoleTerminalProvider, type ITerminal } from '@rushstack/terminal';
import type {
  IOperationExecutionOptions,
  IWatchLoopState,
  Operation,
  OperationGroupRecord,
  OperationRequestRunCallback,
  OperationStatus,
  WatchLoop
} from '@rushstack/operation-graph';
import type {
  CommandLineFlagParameter,
  CommandLineParameterProvider,
  CommandLineStringListParameter
} from '@rushstack/ts-command-line';
import type { IRigConfig } from '@rushstack/rig-package';

import type { InternalHeftSession } from '../pluginFramework/InternalHeftSession';
import { type HeftConfiguration, getRigConfigForConfigLoading } from '../configuration/HeftConfiguration';
import type { LoggingManager } from '../pluginFramework/logging/LoggingManager';
import type { HeftChildReporter } from '../pluginFramework/logging/HeftChildReporter';
import type { MetricsCollector } from '../metrics/MetricsCollector';
import { HeftParameterManager } from '../pluginFramework/HeftParameterManager';
import type { IHeftPhase } from '../pluginFramework/HeftPhase';
import type { IHeftAction, IHeftActionOptions } from './actions/IHeftAction';
import type {
  IHeftLifecycleCleanHookOptions,
  IHeftLifecycleSession,
  IHeftLifecycleToolFinishHookOptions,
  IHeftLifecycleToolStartHookOptions
} from '../pluginFramework/HeftLifecycleSession';
import type { HeftLifecycle } from '../pluginFramework/HeftLifecycle';
import type { IHeftTask } from '../pluginFramework/HeftTask';
import type { IDeleteOperation } from '../plugins/DeleteFilesPlugin';
import { Constants } from '../utilities/Constants';

export interface IHeftActionRunnerOptions extends IHeftActionOptions {
  action: IHeftAction;
}

/**
 * The part of the `OperationExecutionManager` API that is used to run the operation graph.
 */
interface IOperationExecutionManager {
  executeAsync(
    executionOptions: IOperationExecutionOptions<IHeftTaskOperationMetadata, IHeftPhaseOperationMetadata>
  ): Promise<OperationStatus>;
}

/**
 * Metadata for an operation that represents a task.
 * @public
 */
export interface IHeftTaskOperationMetadata {
  task: IHeftTask;
  phase: IHeftPhase;
}

/**
 * Metadata for an operation that represents a phase.
 * @public
 */
export interface IHeftPhaseOperationMetadata {
  phase: IHeftPhase;
}

export function initializeHeft(
  heftConfiguration: HeftConfiguration,
  terminal: ITerminal,
  isVerbose: boolean
): void {
  // Ensure that verbose is enabled on the terminal if requested. terminalProvider.verboseEnabled
  // should already be `true` if the `--debug` flag was provided. This is set in HeftCommandLineParser
  if (
    heftConfiguration.terminalProvider instanceof ConsoleTerminalProvider ||
    'verboseEnabled' in heftConfiguration.terminalProvider
  ) {
    const terminalProvider: ConsoleTerminalProvider | HeftChildReporter =
      heftConfiguration.terminalProvider as ConsoleTerminalProvider | HeftChildReporter;
    terminalProvider.verboseEnabled = terminalProvider.verboseEnabled || isVerbose;
  }

  // Log some information about the execution
  const projectPackageJson: IPackageJson = heftConfiguration.projectPackageJson;
  terminal.writeVerboseLine(`Project: ${projectPackageJson.name}@${projectPackageJson.version}`);
  terminal.writeVerboseLine(`Project build folder: ${heftConfiguration.buildFolderPath}`);
  // Same data as heftConfiguration.rigConfig, without loading @rushstack/rig-package
  const rigConfig: IRigConfig = getRigConfigForConfigLoading(heftConfiguration);
  if (rigConfig.rigFound) {
    terminal.writeVerboseLine(`Rig package: ${rigConfig.rigPackageName}`);
    terminal.writeVerboseLine(`Rig profile: ${rigConfig.rigProfile}`);
  }
  // Heft's own package.json is only needed for this line. A ConsoleTerminalProvider discards verbose
  // messages when verbose logging is disabled, so don't bother loading it in that case.
  const { terminalProvider } = heftConfiguration;
  if (!(terminalProvider instanceof ConsoleTerminalProvider) || terminalProvider.verboseEnabled) {
    terminal.writeVerboseLine(`Heft version: ${heftConfiguration.heftPackageJson.version}`);
  }
  terminal.writeVerboseLine(`Node version: ${process.version}`);
  terminal.writeVerboseLine('');
}

function getReadlineModule(): typeof ReadlineModule {
  // This module is loaded by every heft command, but node:readline is only needed once an action runs.
  // process.getBuiltinModule() is not available before Node.js 20.16.
  return typeof process.getBuiltinModule === 'function'
    ? process.getBuiltinModule('node:readline')
    : require('node:readline');
}

/**
 * Returns true if the process's standard input is the null device (for example when the parent process spawned
 * Heft with stdin set to "ignore", as Rush does for project commands).
 */
function isStdinNullDevice(): boolean {
  if (process.platform === 'win32') {
    return false;
  }
  try {
    const stdinStats: Stats = fstatSync(0);
    return stdinStats.isCharacterDevice() && stdinStats.rdev === statSync('/dev/null').rdev;
  } catch {
    return false;
  }
}

let _cliAbortSignal: AbortSignal | undefined;
export function ensureCliAbortSignal(terminal: ITerminal): AbortSignal {
  if (!_cliAbortSignal) {
    // Set up the ability to terminate the build via Ctrl+C and have it exit gracefully if pressed once,
    // less gracefully if pressed a second time.
    const cliAbortController: AbortController = new AbortController();
    _cliAbortSignal = cliAbortController.signal;

    // Reading the null device immediately yields EOF, upon which the readline interface closes itself, so it could
    // never receive a Ctrl+C keypress: Ctrl+C then reaches the process as a plain SIGINT either way. Skip creating
    // the stdin stream and the interface in that case.
    if (isStdinNullDevice()) {
      return _cliAbortSignal;
    }

    const cli: ReadlineModule.Interface = getReadlineModule().createInterface(
      process.stdin,
      undefined,
      undefined,
      true
    );
    let forceTerminate: boolean = false;
    cli.on('SIGINT', () => {
      cli.close();

      if (forceTerminate) {
        terminal.writeErrorLine(`Forcibly terminating.`);
        process.exit(1);
      } else {
        terminal.writeLine(
          Colorize.yellow(Colorize.bold(`Canceling... Press Ctrl+C again to forcibly terminate.`))
        );
      }

      forceTerminate = true;
      cliAbortController.abort();
    });
  }

  return _cliAbortSignal;
}

export async function runWithLoggingAsync(
  fn: () => Promise<OperationStatus>,
  action: IHeftAction,
  loggingManager: LoggingManager,
  terminal: ITerminal,
  metricsCollector: MetricsCollector,
  abortSignal: AbortSignal,
  throwOnFailure?: boolean
): Promise<OperationStatus> {
  // This module is loaded by every heft command, so only load operation-graph once an action runs.
  const { OperationStatus: OperationStatusEnum } = await import(
    '@rushstack/operation-graph/lib/OperationStatus'
  );

  const startTime: number = performance.now();
  loggingManager.resetScopedLoggerErrorsAndWarnings();

  let result: OperationStatus = OperationStatusEnum.Failure;

  // Execute the action operations
  let encounteredError: boolean = false;
  try {
    result = await fn();
    if (result === OperationStatusEnum.Failure) {
      encounteredError = true;
    }
  } catch (e) {
    encounteredError = true;
    throw e;
  } finally {
    const warningStrings: string[] = loggingManager.getWarningStrings();
    const errorStrings: string[] = loggingManager.getErrorStrings();

    const wasAborted: boolean = abortSignal.aborted;
    const encounteredWarnings: boolean = warningStrings.length > 0 || wasAborted;
    encounteredError = encounteredError || errorStrings.length > 0;

    await metricsCollector.recordAsync(
      action.actionName,
      {
        encounteredError
      },
      action.getParameterStringMap()
    );

    const finishedLoggingWord: string = encounteredError ? 'Failed' : wasAborted ? 'Aborted' : 'Finished';
    const duration: number = performance.now() - startTime;
    const durationSeconds: number = Math.round(duration) / 1000;
    const finishedLoggingLine: string = `-------------------- ${finishedLoggingWord} (${durationSeconds}s) --------------------`;
    terminal.writeLine(
      Colorize.bold(
        (encounteredError ? Colorize.red : encounteredWarnings ? Colorize.yellow : Colorize.green)(
          finishedLoggingLine
        )
      )
    );

    if (warningStrings.length > 0) {
      terminal.writeWarningLine(
        `Encountered ${warningStrings.length} warning${warningStrings.length === 1 ? '' : 's'}`
      );
      for (const warningString of warningStrings) {
        terminal.writeWarningLine(`  ${warningString}`);
      }
    }

    if (errorStrings.length > 0) {
      terminal.writeErrorLine(
        `Encountered ${errorStrings.length} error${errorStrings.length === 1 ? '' : 's'}`
      );
      for (const errorString of errorStrings) {
        terminal.writeErrorLine(`  ${errorString}`);
      }
    }
  }

  if (encounteredError && throwOnFailure) {
    throw new AlreadyReportedError();
  }

  return result;
}

export class HeftActionRunner {
  readonly #action: IHeftAction;
  readonly #terminal: ITerminal;
  readonly #internalHeftSession: InternalHeftSession;
  readonly #metricsCollector: MetricsCollector;
  readonly #loggingManager: LoggingManager;
  readonly #heftConfiguration: HeftConfiguration;
  #parameterManager: HeftParameterManager | undefined;
  readonly #parallelism: number;

  public constructor(options: IHeftActionRunnerOptions) {
    const { action, internalHeftSession, heftConfiguration, loggingManager, terminal, metricsCollector } =
      options;
    this.#action = action;
    this.#internalHeftSession = internalHeftSession;
    this.#heftConfiguration = heftConfiguration;
    this.#loggingManager = loggingManager;
    this.#terminal = terminal;
    this.#metricsCollector = metricsCollector;

    const numberOfCores: number = heftConfiguration.numberOfCores;

    // If an explicit parallelism number wasn't provided, then choose a sensible
    // default.
    if (os.platform() === 'win32') {
      // On desktop Windows, some people have complained that their system becomes
      // sluggish if Node is using all the CPU cores.  Leave one thread for
      // other operations. For CI environments, you can use the "max" argument to use all available cores.
      this.#parallelism = Math.max(numberOfCores - 1, 1);
    } else {
      // Unix-like operating systems have more balanced scheduling, so default
      // to the number of CPU cores
      this.#parallelism = numberOfCores;
    }
  }

  protected get parameterManager(): HeftParameterManager {
    if (!this.#parameterManager) {
      throw new InternalError(`HeftActionRunner.defineParameters() has not been called.`);
    }
    return this.#parameterManager;
  }

  public defineParameters(parameterProvider?: CommandLineParameterProvider | undefined): void {
    if (!this.#parameterManager) {
      // Use the provided parameter provider if one was provided. This is used by the RunAction
      // to allow for the Heft plugin parameters to be applied as scoped parameters.
      parameterProvider = parameterProvider || this.#action;
    } else {
      throw new InternalError(`HeftActionParameters.defineParameters() has already been called.`);
    }

    const verboseFlag: CommandLineFlagParameter = parameterProvider.defineFlagParameter({
      parameterLongName: Constants.verboseParameterLongName,
      parameterShortName: Constants.verboseParameterShortName,
      description: 'If specified, log information useful for debugging.'
    });
    const productionFlag: CommandLineFlagParameter = parameterProvider.defineFlagParameter({
      parameterLongName: Constants.productionParameterLongName,
      description: 'If specified, run Heft in production mode.'
    });
    const localesParameter: CommandLineStringListParameter = parameterProvider.defineStringListParameter({
      parameterLongName: Constants.localesParameterLongName,
      argumentName: 'LOCALE',
      description: 'Use the specified locale for this run, if applicable.'
    });

    let cleanFlagDescription: string =
      'If specified, clean the outputs at the beginning of the lifecycle and before running each phase.';
    if (this.#action.watch) {
      cleanFlagDescription =
        `${cleanFlagDescription} Cleaning will only be performed once for the lifecycle and each phase, ` +
        `and further incremental runs will not be cleaned for the duration of execution.`;
    }
    const cleanFlag: CommandLineFlagParameter = parameterProvider.defineFlagParameter({
      parameterLongName: Constants.cleanParameterLongName,
      description: cleanFlagDescription
    });

    const parameterManager: HeftParameterManager = new HeftParameterManager({
      getIsDebug: () => this.#internalHeftSession.debug,
      getIsVerbose: () => verboseFlag.value,
      getIsProduction: () => productionFlag.value,
      getIsWatch: () => this.#action.watch,
      getLocales: () => localesParameter.values,
      getIsClean: () => !!cleanFlag?.value
    });

    // Add all the lifecycle parameters for the action
    for (const lifecyclePluginDefinition of this.#internalHeftSession.lifecycle.pluginDefinitions) {
      parameterManager.addPluginParameters(lifecyclePluginDefinition);
    }

    // Add all the task parameters for the action
    for (const phase of this.#action.selectedPhases) {
      for (const task of phase.tasks) {
        parameterManager.addPluginParameters(task.pluginDefinition);
      }
    }

    // Finalize and apply to the CommandLineParameterProvider
    parameterManager.finalizeParameters(parameterProvider);
    this.#parameterManager = parameterManager;
  }

  public async executeAsync(): Promise<void> {
    const terminal: ITerminal = this.#terminal;
    // Set the parameter manager on the internal session, which is used to provide the selected
    // parameters to plugins. Set this in onExecute() since we now know that this action is being
    // executed, and the session should be populated with the executing parameters.
    this.#internalHeftSession.parameterManager = this.parameterManager;

    initializeHeft(this.#heftConfiguration, terminal, this.parameterManager.defaultParameters.verbose);

    // The operation graph machinery is only needed once an action actually executes
    const { generateOperations } = await import('../operations/generateOperations');

    const operations: ReadonlySet<Operation<IHeftTaskOperationMetadata, IHeftPhaseOperationMetadata>> =
      generateOperations({
        internalHeftSession: this.#internalHeftSession,
        selectedPhases: this.#action.selectedPhases,
        terminal
      });

    // Watch mode uses the execution manager from @rushstack/operation-graph as-is: the time it takes to
    // start rebuilding after a change is part of how watch mode's change detection behaves (e.g. watchers
    // are restarted relative to when a rebuild began reading its inputs), so it is kept unchanged. Single
    // runs use an equivalent execution manager that doesn't wait on a timer for every wave of ready
    // operations.
    const executionManager: IOperationExecutionManager = this.#action.watch
      ? new (await import('@rushstack/operation-graph')).OperationExecutionManager(operations)
      : new (await import('../operations/OperationExecutionManager')).OperationExecutionManager(operations);

    const cliAbortSignal: AbortSignal = ensureCliAbortSignal(this.#terminal);

    try {
      await _startLifecycleAsync(this.#internalHeftSession);

      if (this.#action.watch) {
        const watchLoop: WatchLoop = await this.#createWatchLoopAsync(executionManager);

        if (process.send) {
          await watchLoop.runIPCAsync();
        } else {
          await watchLoop.runUntilAbortedAsync(cliAbortSignal, () => {
            terminal.writeLine(Colorize.bold('Waiting for changes. Press CTRL + C to exit...'));
            terminal.writeLine('');
          });
        }
      } else {
        await this.#executeOnceAsync(executionManager, cliAbortSignal);
      }
    } finally {
      // Invoke this here both to ensure it always runs and that it does so after recordMetrics
      // This is treated as a finalizer for any assets created in lifecycle plugins.
      // It is the responsibility of the lifecycle plugin to ensure that finish gracefully handles
      // aborted runs.
      await _finishLifecycleAsync(this.#internalHeftSession);
    }
  }

  async #createWatchLoopAsync(executionManager: IOperationExecutionManager): Promise<WatchLoop> {
    const { WatchLoop: WatchLoopClass } = await import('@rushstack/operation-graph');
    const terminal: ITerminal = this.#terminal;
    const watchLoop: WatchLoop = new WatchLoopClass({
      onBeforeExecute: () => {
        // Write an empty line to the terminal for separation between iterations. We've already iterated
        // at this point, so log out that we're about to start a new run.
        terminal.writeLine('');
        terminal.writeLine(Colorize.bold('Starting incremental build...'));
      },
      executeAsync: (state: IWatchLoopState): Promise<OperationStatus> => {
        return this.#executeOnceAsync(executionManager, state.abortSignal, state.requestRun);
      },
      onRequestRun: (requestor?: string) => {
        terminal.writeLine(Colorize.bold(`New run requested by ${requestor || 'unknown task'}`));
      },
      onAbort: () => {
        terminal.writeLine(Colorize.bold(`Cancelling incremental build...`));
      }
    });
    return watchLoop;
  }

  async #executeOnceAsync(
    executionManager: IOperationExecutionManager,
    abortSignal: AbortSignal,
    requestRun?: OperationRequestRunCallback
  ): Promise<OperationStatus> {
    const { taskStart, taskFinish, phaseStart, phaseFinish } = this.#internalHeftSession.lifecycle.hooks;
    // Record this as the start of task execution.
    this.#metricsCollector.setStartTime();
    // Execute the action operations
    return await runWithLoggingAsync(
      () => {
        const operationExecutionManagerOptions: IOperationExecutionOptions<
          IHeftTaskOperationMetadata,
          IHeftPhaseOperationMetadata
        > = {
          terminal: this.#terminal,
          parallelism: this.#parallelism,
          abortSignal,
          requestRun,
          beforeExecuteOperation(
            operation: Operation<IHeftTaskOperationMetadata, IHeftPhaseOperationMetadata>
          ): void {
            if (taskStart.isUsed()) {
              taskStart.call({ operation });
            }
          },
          afterExecuteOperation(
            operation: Operation<IHeftTaskOperationMetadata, IHeftPhaseOperationMetadata>
          ): void {
            if (taskFinish.isUsed()) {
              taskFinish.call({ operation });
            }
          },
          beforeExecuteOperationGroup(
            operationGroup: OperationGroupRecord<IHeftPhaseOperationMetadata>
          ): void {
            if (operationGroup.metadata.phase && phaseStart.isUsed()) {
              phaseStart.call({ operation: operationGroup });
            }
          },
          afterExecuteOperationGroup(
            operationGroup: OperationGroupRecord<IHeftPhaseOperationMetadata>
          ): void {
            if (operationGroup.metadata.phase && phaseFinish.isUsed()) {
              phaseFinish.call({ operation: operationGroup });
            }
          }
        };

        return executionManager.executeAsync(operationExecutionManagerOptions);
      },
      this.#action,
      this.#loggingManager,
      this.#terminal,
      this.#metricsCollector,
      abortSignal,
      !requestRun
    );
  }
}

async function _startLifecycleAsync(this: void, internalHeftSession: InternalHeftSession): Promise<void> {
  const { clean } = internalHeftSession.parameterManager.defaultParameters;

  // Load and apply the lifecycle plugins
  const lifecycle: HeftLifecycle = internalHeftSession.lifecycle;
  const { lifecycleLogger } = lifecycle;
  await lifecycle.applyPluginsAsync(lifecycleLogger.terminal);

  if (lifecycleLogger.hasErrors) {
    throw new AlreadyReportedError();
  }

  if (clean) {
    const startTime: number = performance.now();
    lifecycleLogger.terminal.writeVerboseLine('Starting clean');

    // Grab the additional clean operations from the phase
    const deleteOperations: IDeleteOperation[] = [];

    // Delete all temp folders for tasks by default
    for (const pluginDefinition of lifecycle.pluginDefinitions) {
      const lifecycleSession: IHeftLifecycleSession =
        await lifecycle.getSessionForPluginDefinitionAsync(pluginDefinition);
      deleteOperations.push({ sourcePath: lifecycleSession.tempFolderPath });
    }

    // Create the options and provide a utility method to obtain paths to delete
    const cleanHookOptions: IHeftLifecycleCleanHookOptions = {
      addDeleteOperations: (...deleteOperationsToAdd: IDeleteOperation[]) =>
        deleteOperations.push(...deleteOperationsToAdd)
    };

    // Run the plugin clean hook
    if (lifecycle.hooks.clean.isUsed()) {
      try {
        await lifecycle.hooks.clean.promise(cleanHookOptions);
      } catch (e) {
        // Log out using the clean logger, and return an error status
        if (!(e instanceof AlreadyReportedError)) {
          lifecycleLogger.emitError(e as Error);
        }
        throw new AlreadyReportedError();
      }
    }

    // Delete the files if any were specified
    if (deleteOperations.length) {
      const rootFolderPath: string = internalHeftSession.heftConfiguration.buildFolderPath;
      const { deleteFilesAsync } = await import('../plugins/DeleteFilesPlugin');
      await deleteFilesAsync(rootFolderPath, deleteOperations, lifecycleLogger.terminal);
    }

    lifecycleLogger.terminal.writeVerboseLine(`Finished clean (${performance.now() - startTime}ms)`);

    if (lifecycleLogger.hasErrors) {
      throw new AlreadyReportedError();
    }
  }

  // Run the start hook
  if (lifecycle.hooks.toolStart.isUsed()) {
    const lifecycleToolStartHookOptions: IHeftLifecycleToolStartHookOptions = {};
    await lifecycle.hooks.toolStart.promise(lifecycleToolStartHookOptions);

    if (lifecycleLogger.hasErrors) {
      throw new AlreadyReportedError();
    }
  }
}

async function _finishLifecycleAsync(internalHeftSession: InternalHeftSession): Promise<void> {
  const lifecycleToolFinishHookOptions: IHeftLifecycleToolFinishHookOptions = {};
  await internalHeftSession.lifecycle.hooks.toolFinish.promise(lifecycleToolFinishHookOptions);
}
