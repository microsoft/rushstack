// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { performance } from 'perf_hooks';
import { createInterface, type Interface } from 'readline';
import os from 'os';

import {
  AlreadyReportedError,
  Colors,
  ConsoleTerminalProvider,
  InternalError,
  type ITerminal,
  type IPackageJson
} from '@rushstack/node-core-library';
import type {
  CommandLineFlagParameter,
  CommandLineParameterProvider,
  CommandLineStringListParameter
} from '@rushstack/ts-command-line';

import type { InternalHeftSession } from '../pluginFramework/InternalHeftSession';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { LoggingManager } from '../pluginFramework/logging/LoggingManager';
import type { MetricsCollector } from '../metrics/MetricsCollector';
import { HeftParameterManager } from '../pluginFramework/HeftParameterManager';
import {
  OperationExecutionManager,
  type IOperationExecutionOptions
} from '../operations/OperationExecutionManager';
import { Operation } from '../operations/Operation';
import { TaskOperationRunner } from '../operations/runners/TaskOperationRunner';
import { PhaseOperationRunner } from '../operations/runners/PhaseOperationRunner';
import { LifecycleOperationRunner } from '../operations/runners/LifecycleOperationRunner';
import type { HeftPhase } from '../pluginFramework/HeftPhase';
import type { IHeftAction, IHeftActionOptions } from '../cli/actions/IHeftAction';
import type { HeftTask } from '../pluginFramework/HeftTask';
import type { LifecycleOperationRunnerType } from '../operations/runners/LifecycleOperationRunner';
import { CancellationToken, CancellationTokenSource } from '../pluginFramework/CancellationToken';
import { Constants } from '../utilities/Constants';
import { OperationStatus } from '../operations/OperationStatus';

export interface IHeftActionRunnerOptions extends IHeftActionOptions {
  action: IHeftAction;
}

export function initializeHeft(
  heftConfiguration: HeftConfiguration,
  terminal: ITerminal,
  isVerbose: boolean
): void {
  // Ensure that verbose is enabled on the terminal if requested. terminalProvider.verboseEnabled
  // should already be `true` if the `--debug` flag was provided. This is set in HeftCommandLineParser
  if (heftConfiguration.terminalProvider instanceof ConsoleTerminalProvider) {
    heftConfiguration.terminalProvider.verboseEnabled =
      heftConfiguration.terminalProvider.verboseEnabled || isVerbose;
  }

  // Log some information about the execution
  const projectPackageJson: IPackageJson = heftConfiguration.projectPackageJson;
  terminal.writeVerboseLine(`Project: ${projectPackageJson.name}@${projectPackageJson.version}`);
  terminal.writeVerboseLine(`Project build folder: ${heftConfiguration.buildFolderPath}`);
  if (heftConfiguration.rigConfig.rigFound) {
    terminal.writeVerboseLine(`Rig package: ${heftConfiguration.rigConfig.rigPackageName}`);
    terminal.writeVerboseLine(`Rig profile: ${heftConfiguration.rigConfig.rigProfile}`);
  }
  terminal.writeVerboseLine(`Heft version: ${heftConfiguration.heftPackageJson.version}`);
  terminal.writeVerboseLine(`Node version: ${process.version}`);
  terminal.writeVerboseLine('');
}

export async function runWithLoggingAsync(
  fn: () => Promise<OperationStatus>,
  action: IHeftAction,
  loggingManager: LoggingManager,
  terminal: ITerminal,
  metricsCollector: MetricsCollector,
  cancellationToken: CancellationToken
): Promise<void> {
  const startTime: number = performance.now();
  loggingManager.resetScopedLoggerErrorsAndWarnings();

  // Execute the action operations
  let encounteredError: boolean = false;
  try {
    const result: OperationStatus = await fn();
    if (result === OperationStatus.Failure) {
      encounteredError = true;
    }
  } catch (e) {
    encounteredError = true;
    throw e;
  } finally {
    const warningStrings: string[] = loggingManager.getWarningStrings();
    const errorStrings: string[] = loggingManager.getErrorStrings();

    const wasCancelled: boolean = cancellationToken.isCancelled;
    const encounteredWarnings: boolean = warningStrings.length > 0 || wasCancelled;
    encounteredError = encounteredError || errorStrings.length > 0;

    await metricsCollector.recordAsync(
      action.actionName,
      {
        encounteredError
      },
      action.getParameterStringMap()
    );

    const finishedLoggingWord: string = encounteredError ? 'Failed' : wasCancelled ? 'Cancelled' : 'Finished';
    const duration: number = performance.now() - startTime;
    const durationSeconds: number = Math.round(duration) / 1000;
    const finishedLoggingLine: string = `-------------------- ${finishedLoggingWord} (${durationSeconds}s) --------------------`;
    terminal.writeLine(
      Colors.bold(
        (encounteredError ? Colors.red : encounteredWarnings ? Colors.yellow : Colors.green)(
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

  if (encounteredError) {
    throw new AlreadyReportedError();
  }
}

export class HeftActionRunner {
  private readonly _action: IHeftAction;
  private readonly _terminal: ITerminal;
  private readonly _internalHeftSession: InternalHeftSession;
  private readonly _metricsCollector: MetricsCollector;
  private readonly _loggingManager: LoggingManager;
  private readonly _heftConfiguration: HeftConfiguration;
  private _parameterManager: HeftParameterManager | undefined;
  private readonly _parallelism: number;

  public constructor(options: IHeftActionRunnerOptions) {
    this._action = options.action;
    this._internalHeftSession = options.internalHeftSession;
    this._heftConfiguration = options.heftConfiguration;
    this._loggingManager = options.loggingManager;
    this._terminal = options.terminal;
    this._metricsCollector = options.metricsCollector;

    const numberOfCores: number = os.cpus().length;

    // If an explicit parallelism number wasn't provided, then choose a sensible
    // default.
    if (os.platform() === 'win32') {
      // On desktop Windows, some people have complained that their system becomes
      // sluggish if Rush is using all the CPU cores.  Leave one thread for
      // other operations. For CI environments, you can use the "max" argument to use all available cores.
      this._parallelism = Math.max(numberOfCores - 1, 1);
    } else {
      // Unix-like operating systems have more balanced scheduling, so default
      // to the number of CPU cores
      this._parallelism = numberOfCores;
    }

    this._metricsCollector.setStartTime();
  }

  protected get parameterManager(): HeftParameterManager {
    if (!this._parameterManager) {
      throw new InternalError(`HeftActionRunner.defineParameters() has not been called.`);
    }
    return this._parameterManager;
  }

  public defineParameters(parameterProvider?: CommandLineParameterProvider | undefined): void {
    if (!this._parameterManager) {
      // Use the provided parameter provider if one was provided. This is used by the RunAction
      // to allow for the Heft plugin parameters to be applied as scoped parameters.
      parameterProvider = parameterProvider || this._action;
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

    let cleanFlag: CommandLineFlagParameter | undefined;
    let cleanCacheFlag: CommandLineFlagParameter | undefined;
    if (!this._action.watch) {
      // Only enable the clean flags in non-watch mode
      cleanFlag = parameterProvider.defineFlagParameter({
        parameterLongName: Constants.cleanParameterLongName,
        description: 'If specified, clean the outputs before running each phase.'
      });
      cleanCacheFlag = parameterProvider.defineFlagParameter({
        parameterLongName: Constants.cleanCacheParameterLongName,
        description:
          'If specified, clean the cache before running each phase. To use this flag, the ' +
          `${JSON.stringify(Constants.cleanParameterLongName)} flag must also be provided.`
      });
    }

    const parameterManager: HeftParameterManager = new HeftParameterManager({
      getIsDebug: () => this._internalHeftSession.debug,
      getIsVerbose: () => verboseFlag.value,
      getIsProduction: () => productionFlag.value,
      getIsWatch: () => this._action.watch,
      getLocales: () => localesParameter.values,
      getIsClean: () => !!cleanFlag?.value,
      getIsCleanCache: () => !!cleanCacheFlag?.value
    });

    // Add all the lifecycle parameters for the action
    for (const lifecyclePluginDefinition of this._internalHeftSession.lifecycle.pluginDefinitions) {
      parameterManager.addPluginParameters(lifecyclePluginDefinition);
    }

    // Add all the task parameters for the action
    for (const phase of this._action.selectedPhases) {
      for (const task of phase.tasks) {
        parameterManager.addPluginParameters(task.pluginDefinition);
      }
    }

    // Finalize and apply to the CommandLineParameterProvider
    parameterManager.finalizeParameters(parameterProvider);
    this._parameterManager = parameterManager;
  }

  public async executeAsync(): Promise<void> {
    const terminal: ITerminal = this._terminal;
    // Set the parameter manager on the internal session, which is used to provide the selected
    // parameters to plugins. Set this in onExecute() since we now know that this action is being
    // executed, and the session should be populated with the executing parameters.
    this._internalHeftSession.parameterManager = this.parameterManager;

    initializeHeft(this._heftConfiguration, terminal, this.parameterManager.defaultParameters.verbose);

    const operations: ReadonlySet<Operation> = this._generateOperations();

    const cliCancellationTokenSource: CancellationTokenSource = new CancellationTokenSource();
    const cliCancellationToken: CancellationToken = cliCancellationTokenSource.token;
    const cli: Interface = createInterface(process.stdin, undefined, undefined, true);
    let forceTerminate: boolean = false;
    cli.on('SIGINT', () => {
      cli.close();

      if (forceTerminate) {
        terminal.writeErrorLine(`Forcibly terminating.`);
        process.exit(1);
      }

      forceTerminate = true;
      cliCancellationTokenSource.cancel();
    });

    const executionManager: OperationExecutionManager = new OperationExecutionManager(operations);

    if (this._action.watch) {
      await this._executeWatchAsync(executionManager, cliCancellationToken);
    } else {
      await this._executeOnceAsync(executionManager, cliCancellationToken);
    }
  }

  private async _executeWatchAsync(
    executionManager: OperationExecutionManager,
    cliCancellationToken: CancellationToken
  ): Promise<void> {
    let resolveRequestRun!: (requestRun: true) => void;
    function createRequestRunPromise(): Promise<true> {
      return new Promise<true>((resolve: (requestRun: true) => void, reject: (err: Error) => void) => {
        resolveRequestRun = resolve;
      });
    }
    let requestRunPromise: Promise<true> = createRequestRunPromise();

    function requestRun(): void {
      resolveRequestRun(true);
    }

    // eslint-disable-next-line no-constant-condition
    while (!cliCancellationToken.isCancelled) {
      // Create the cancellation token which is passed to the incremental build.
      const cancellationTokenSource: CancellationTokenSource = new CancellationTokenSource();
      const cancellationToken: CancellationToken = cancellationTokenSource.token;

      function cancelExecution(): void {
        cancellationTokenSource.cancel();
      }

      cliCancellationToken.onCancelledPromise.then(cancelExecution, cancelExecution);

      // Start the incremental build and wait for a source file to change
      const executePromise: Promise<void> = this._executeOnceAsync(
        executionManager,
        cancellationToken,
        requestRun
      );

      try {
        // Whichever promise settles first will be the result of the race.
        const isBuildTrigger: true | void = await Promise.race([requestRunPromise, executePromise]);
        if (isBuildTrigger) {
          // If there's a source file change, we need to cancel the incremental build and wait for the
          // execution to finish before we begin execution again.
          cancellationTokenSource.cancel();
          this._terminal.writeLine(
            Colors.bold('New run requested, cancelling and restarting incremental build...')
          );
          await executePromise;
        } else {
          this._terminal.writeLine(Colors.bold('Waiting for changes. Press CTRL + C to exit...'));
          this._terminal.writeLine('');
          await requestRunPromise;
        }
      } catch (e) {
        // Swallow AlreadyReportedErrors, since we likely have already logged them out to the terminal.
        // We also need to wait for source file changes here so that we don't continuously loop after
        // encountering an error.
        if (e instanceof AlreadyReportedError) {
          this._terminal.writeLine(Colors.bold('Waiting for changes. Press CTRL + C to exit...'));
          this._terminal.writeLine('');
          await requestRunPromise;
        } else {
          // We don't know where this error is coming from, throw
          throw e;
        }
      }

      requestRunPromise = createRequestRunPromise();

      // Write an empty line to the terminal for separation between iterations. We've already iterated
      // at this point, so log out that we're about to start a new run.
      this._terminal.writeLine('');
      this._terminal.writeLine(Colors.bold('Starting incremental build...'));
    }
  }

  private async _executeOnceAsync(
    executionManager: OperationExecutionManager,
    cancellationToken: CancellationToken,
    requestRun?: () => void
  ): Promise<void> {
    // Execute the action operations
    await runWithLoggingAsync(
      () => {
        const operationExecutionManagerOptions: IOperationExecutionOptions = {
          terminal: this._terminal,
          parallelism: this._parallelism,
          cancellationToken,
          requestRun
        };

        return executionManager.executeAsync(operationExecutionManagerOptions);
      },
      this._action,
      this._loggingManager,
      this._terminal,
      this._metricsCollector,
      cancellationToken
    );
  }

  private _generateOperations(): Set<Operation> {
    const { selectedPhases } = this._action;
    const {
      defaultParameters: { clean, cleanCache }
    } = this.parameterManager;

    if (cleanCache && !clean) {
      throw new Error(
        `The ${JSON.stringify(Constants.cleanCacheParameterLongName)} option can only be used in ` +
          `conjunction with ${JSON.stringify(Constants.cleanParameterLongName)}.`
      );
    }

    const operations: Map<string, Operation> = new Map();
    const internalHeftSession: InternalHeftSession = this._internalHeftSession;
    const startLifecycleOperation: Operation = _getOrCreateLifecycleOperation(
      internalHeftSession,
      'start',
      operations
    );
    const finishLifecycleOperation: Operation = _getOrCreateLifecycleOperation(
      internalHeftSession,
      'finish',
      operations
    );

    let hasWarnedAboutSkippedPhases: boolean = false;
    for (const phase of selectedPhases) {
      // Warn if any dependencies are excluded from the list of selected phases
      if (!hasWarnedAboutSkippedPhases) {
        for (const dependencyPhase of phase.dependencyPhases) {
          if (!selectedPhases.has(dependencyPhase)) {
            // Only write once, and write with yellow to make it stand out without writing a warning to stderr
            hasWarnedAboutSkippedPhases = true;
            this._terminal.writeLine(
              Colors.bold(
                'The provided list of phases does not contain all phase dependencies. You may need to run the ' +
                  'excluded phases manually.'
              )
            );
            break;
          }
        }
      }

      // Create operation for the phase start node
      const phaseOperation: Operation = _getOrCreatePhaseOperation(internalHeftSession, phase, operations);
      // Set the 'start' lifecycle operation as a dependency of all phases to ensure the 'start' lifecycle
      // operation runs first
      phaseOperation.addDependency(startLifecycleOperation);
      // Set the phase operation as a dependency of the 'end' lifecycle operation to ensure the phase
      // operation runs first
      finishLifecycleOperation.addDependency(phaseOperation);

      // Create operations for each task
      for (const task of phase.tasks) {
        const taskOperation: Operation = _getOrCreateTaskOperation(internalHeftSession, task, operations);
        // Set the phase operation as a dependency of the task operation to ensure the phase operation runs first
        taskOperation.addDependency(phaseOperation);
        // Set the 'start' lifecycle operation as a dependency of all tasks to ensure the 'start' lifecycle
        // operation runs first
        taskOperation.addDependency(startLifecycleOperation);
        // Set the task operation as a dependency of the 'stop' lifecycle operation to ensure the task operation
        // runs first
        finishLifecycleOperation.addDependency(taskOperation);

        // Set all dependency tasks as dependencies of the task operation
        for (const dependencyTask of task.dependencyTasks) {
          taskOperation.addDependency(
            _getOrCreateTaskOperation(internalHeftSession, dependencyTask, operations)
          );
        }

        // Set all tasks in a in a phase as dependencies of the consuming phase
        for (const consumingPhase of phase.consumingPhases) {
          if (this._action.selectedPhases.has(consumingPhase)) {
            // Set all tasks in a dependency phase as dependencies of the consuming phase to ensure the dependency
            // tasks run first
            const consumingPhaseOperation: Operation = _getOrCreatePhaseOperation(
              internalHeftSession,
              consumingPhase,
              operations
            );
            consumingPhaseOperation.addDependency(taskOperation);
          }
        }
      }
    }

    return new Set(operations.values());
  }
}

function _getOrCreateLifecycleOperation(
  internalHeftSession: InternalHeftSession,
  type: LifecycleOperationRunnerType,
  operations: Map<string, Operation>
): Operation {
  const key: string = `lifecycle.${type}`;

  let operation: Operation | undefined = operations.get(key);
  if (!operation) {
    operation = new Operation({
      groupName: 'lifecycle',
      runner: new LifecycleOperationRunner({ type, internalHeftSession })
    });
    operations.set(key, operation);
  }
  return operation;
}

function _getOrCreatePhaseOperation(
  internalHeftSession: InternalHeftSession,
  phase: HeftPhase,
  operations: Map<string, Operation>
): Operation {
  const key: string = phase.phaseName;

  let operation: Operation | undefined = operations.get(key);
  if (!operation) {
    // Only create the operation. Dependencies are hooked up separately
    operation = new Operation({
      groupName: phase.phaseName,
      runner: new PhaseOperationRunner({ phase, internalHeftSession })
    });
    operations.set(key, operation);
  }
  return operation;
}

function _getOrCreateTaskOperation(
  internalHeftSession: InternalHeftSession,
  task: HeftTask,
  operations: Map<string, Operation>
): Operation {
  const key: string = `${task.parentPhase.phaseName}.${task.taskName}`;

  let operation: Operation | undefined = operations.get(key);
  if (!operation) {
    operation = new Operation({
      groupName: task.parentPhase.phaseName,
      runner: new TaskOperationRunner({
        internalHeftSession,
        task
      })
    });
    operations.set(key, operation);
  }
  return operation;
}
