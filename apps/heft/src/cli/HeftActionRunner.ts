// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { performance } from 'perf_hooks';
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
  type IOperationExecutionManagerOptions
} from '../operations/OperationExecutionManager';
import { Operation } from '../operations/Operation';
import { TaskOperationRunner } from '../operations/runners/TaskOperationRunner';
import { PhaseOperationRunner } from '../operations/runners/PhaseOperationRunner';
import { LifecycleOperationRunner } from '../operations/runners/LifecycleOperationRunner';
import type { HeftPhase } from '../pluginFramework/HeftPhase';
import type { IHeftAction, IHeftActionOptions } from '../cli/actions/IHeftAction';
import type { HeftTask } from '../pluginFramework/HeftTask';
import type { LifecycleOperationRunnerType } from '../operations/runners/LifecycleOperationRunner';

export interface IHeftActionRunnerOptions extends IHeftActionOptions {
  action: IHeftAction;
}

export class HeftActionRunner {
  private readonly _action: IHeftAction;
  private readonly _terminal: ITerminal;
  private readonly _internalHeftSession: InternalHeftSession;
  private readonly _metricsCollector: MetricsCollector;
  private readonly _loggingManager: LoggingManager;
  private readonly _heftConfiguration: HeftConfiguration;
  private _parameterManager: HeftParameterManager | undefined;

  protected get parameterManager(): HeftParameterManager {
    if (!this._parameterManager) {
      throw new InternalError(`HeftActionRunner.defineParameters() has not been called.`);
    }
    return this._parameterManager;
  }

  public constructor(options: IHeftActionRunnerOptions) {
    this._action = options.action;
    this._internalHeftSession = options.internalHeftSession;
    this._heftConfiguration = options.heftConfiguration;
    this._loggingManager = options.loggingManager;
    this._terminal = options.terminal;
    this._metricsCollector = options.metricsCollector;

    this._metricsCollector.setStartTime();
  }

  public defineParameters(parameterProvider?: CommandLineParameterProvider | undefined): void {
    if (!this._parameterManager) {
      // Use the provided parameter provider if one was provided. This is used by the RunAction
      // to allow for the Heft plugin parameters to be applied as scoped parameters.
      parameterProvider = parameterProvider || this._action;
    } else {
      throw new InternalError(`HeftActionParameters.defineParameters() has already been called.`);
    }

    const cleanFlag: CommandLineFlagParameter = parameterProvider.defineFlagParameter({
      parameterLongName: '--clean',
      description: 'If specified, clean the outputs before running each phase.'
    });
    const cleanCacheFlag: CommandLineFlagParameter = parameterProvider.defineFlagParameter({
      parameterLongName: '--clean-cache',
      description:
        'If specified, clean the cache before running each phase. To use this flag, the ' +
        '--clean flag must also be provided.'
    });
    const verboseFlag: CommandLineFlagParameter = parameterProvider.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'If specified, log information useful for debugging.'
    });
    const productionFlag: CommandLineFlagParameter = parameterProvider.defineFlagParameter({
      parameterLongName: '--production',
      description: 'If specified, run Heft in production mode.'
    });
    const localesParameter: CommandLineStringListParameter = parameterProvider.defineStringListParameter({
      parameterLongName: '--locales',
      argumentName: 'LOCALE',
      description: 'Use the specified locale for this run, if applicable.'
    });
    let serveFlag: CommandLineFlagParameter | undefined;
    if (this._action.watch) {
      serveFlag = parameterProvider.defineFlagParameter({
        parameterLongName: '--serve',
        description: 'If specified, serve the output. This flag can only be used with watch-enabled actions.'
      });
    }

    const parameterManager: HeftParameterManager = new HeftParameterManager({
      isClean: () => cleanFlag.value,
      isCleanCache: () => cleanCacheFlag.value,
      isDebug: () => this._internalHeftSession.debug,
      isVerbose: () => verboseFlag.value,
      isProduction: () => productionFlag.value,
      isWatch: () => this._action.watch,
      isServe: () => serveFlag?.value ?? false,
      getLocales: () => localesParameter.values
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
    // Set the parameter manager on the internal session, which is used to provide the selected
    // parameters to plugins. Set this in onExecute() since we now know that this action is being
    // executed, and the session should be populated with the executing parameters.
    this._internalHeftSession.parameterManager = this.parameterManager;

    // Ensure that verbose is enabled on the terminal if requested. terminalProvider.verboseEnabled
    // should already be `true` if the `--debug` flag was provided. This is set in HeftCommandLineParser
    if (this._heftConfiguration.terminalProvider instanceof ConsoleTerminalProvider) {
      this._heftConfiguration.terminalProvider.verboseEnabled =
        this._heftConfiguration.terminalProvider.verboseEnabled ||
        this.parameterManager.defaultParameters.verbose;
    }

    // Log some information about the execution
    const projectPackageJson: IPackageJson = this._heftConfiguration.projectPackageJson;
    this._terminal.writeVerboseLine(`Project: ${projectPackageJson.name}@${projectPackageJson.version}`);
    this._terminal.writeVerboseLine(`Project build folder: ${this._heftConfiguration.buildFolder}`);
    if (this._heftConfiguration.rigConfig.rigFound) {
      this._terminal.writeVerboseLine(`Rig package: ${this._heftConfiguration.rigConfig.rigPackageName}`);
      this._terminal.writeVerboseLine(`Rig profile: ${this._heftConfiguration.rigConfig.rigProfile}`);
    }
    this._terminal.writeVerboseLine(`Heft version: ${this._heftConfiguration.heftPackageJson.version}`);
    this._terminal.writeVerboseLine(`Node version: ${process.version}`);
    this._terminal.writeVerboseLine('');

    await this._executeOnceAsync();
  }

  private async _executeOnceAsync(): Promise<void> {
    // Execute the action operations
    let encounteredError: boolean = false;
    try {
      const operations: Set<Operation> = this._generateOperations();
      const operationExecutionManagerOptions: IOperationExecutionManagerOptions = {
        loggingManager: this._loggingManager,
        terminal: this._terminal,
        // TODO: Allow for running non-parallelized operations.
        parallelism: undefined
      };
      const executionManager: OperationExecutionManager = new OperationExecutionManager(
        operations,
        operationExecutionManagerOptions
      );
      await executionManager.executeAsync();
    } catch (e) {
      encounteredError = true;
      throw e;
    } finally {
      const warningStrings: string[] = this._loggingManager.getWarningStrings();
      const errorStrings: string[] = this._loggingManager.getErrorStrings();

      const encounteredWarnings: boolean = warningStrings.length > 0;
      encounteredError = encounteredError || errorStrings.length > 0;

      await this._metricsCollector.recordAsync(
        this._action.actionName,
        {
          encounteredError
        },
        this._action.getParameterStringMap()
      );

      this._terminal.writeLine(
        Colors.bold(
          (encounteredError ? Colors.red : encounteredWarnings ? Colors.yellow : Colors.green)(
            `-------------------- Finished (${Math.round(performance.now()) / 1000}s) --------------------`
          )
        )
      );

      if (warningStrings.length > 0) {
        this._terminal.writeWarningLine(
          `Encountered ${warningStrings.length} warning${warningStrings.length === 1 ? '' : 's'}`
        );
        for (const warningString of warningStrings) {
          this._terminal.writeWarningLine(`  ${warningString}`);
        }
      }

      if (errorStrings.length > 0) {
        this._terminal.writeErrorLine(
          `Encountered ${errorStrings.length} error${errorStrings.length === 1 ? '' : 's'}`
        );
        for (const errorString of errorStrings) {
          this._terminal.writeErrorLine(`  ${errorString}`);
        }
      }
    }

    if (encounteredError) {
      throw new AlreadyReportedError();
    }
  }

  private _generateOperations(): Set<Operation> {
    const { selectedPhases } = this._action;
    const {
      defaultParameters: { clean, cleanCache }
    } = this.parameterManager;

    if (cleanCache && !clean) {
      throw new Error('The "--clean-cache" option can only be used in conjunction with "--clean".');
    }

    const operations: Map<string, Operation> = new Map();
    const startLifecycleOperation: Operation = this._getOrCreateLifecycleOperation('start', operations);
    const stopLifecycleOperation: Operation = this._getOrCreateLifecycleOperation('stop', operations);

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
      const phaseOperation: Operation = this._getOrCreatePhaseOperation(phase, operations);
      // Set the 'start' lifecycle operation as a dependency of all phases to ensure the 'start' lifecycle
      // operation runs first
      phaseOperation.dependencies.add(startLifecycleOperation);
      // Set the phase operation as a dependency of the 'end' lifecycle operation to ensure the phase
      // operation runs first
      stopLifecycleOperation.dependencies.add(phaseOperation);

      // Create operations for each task
      for (const task of phase.tasks) {
        const taskOperation: Operation = this._getOrCreateTaskOperation(task, operations);
        // Set the phase operation as a dependency of the task operation to ensure the phase operation runs first
        taskOperation.dependencies.add(phaseOperation);
        // Set the 'start' lifecycle operation as a dependency of all tasks to ensure the 'start' lifecycle
        // operation runs first
        taskOperation.dependencies.add(startLifecycleOperation);
        // Set the task operation as a dependency of the 'stop' lifecycle operation to ensure the task operation
        // runs first
        stopLifecycleOperation.dependencies.add(taskOperation);

        // Set all dependency tasks as dependencies of the task operation
        for (const dependencyTask of task.dependencyTasks) {
          taskOperation.dependencies.add(this._getOrCreateTaskOperation(dependencyTask, operations));
        }

        // Set all tasks in a in a phase as dependencies of the consuming phase
        for (const consumingPhase of phase.consumingPhases) {
          if (this._action.selectedPhases.has(consumingPhase)) {
            // Set all tasks in a dependency phase as dependencies of the consuming phase to ensure the dependency
            // tasks run first
            const consumingPhaseOperation: Operation = this._getOrCreatePhaseOperation(
              consumingPhase,
              operations
            );
            consumingPhaseOperation.dependencies.add(taskOperation);
          }
        }
      }
    }

    return new Set(operations.values());
  }

  private _getOrCreateLifecycleOperation(
    type: LifecycleOperationRunnerType,
    operations: Map<string, Operation>
  ): Operation {
    const {
      defaultParameters: { clean, cleanCache }
    } = this.parameterManager;
    const key: string = `lifecycle.${type}`;

    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      operation = new Operation({
        groupName: 'lifecycle',
        runner: new LifecycleOperationRunner({
          clean,
          cleanCache,
          type,
          internalHeftSession: this._internalHeftSession
        })
      });
      operations.set(key, operation);
    }
    return operation;
  }

  private _getOrCreatePhaseOperation(phase: HeftPhase, operations: Map<string, Operation>): Operation {
    const {
      defaultParameters: { clean, cleanCache }
    } = this.parameterManager;
    const key: string = phase.phaseName;

    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      // Only create the operation. Dependencies are hooked up separately
      operation = new Operation({
        groupName: phase.phaseName,
        runner: new PhaseOperationRunner({
          clean,
          cleanCache,
          phase,
          internalHeftSession: this._internalHeftSession
        })
      });
      operations.set(key, operation);
    }
    return operation;
  }

  private _getOrCreateTaskOperation(task: HeftTask, operations: Map<string, Operation>): Operation {
    const key: string = `${task.parentPhase.phaseName}.${task.taskName}`;

    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      operation = new Operation({
        groupName: task.parentPhase.phaseName,
        runner: new TaskOperationRunner({ internalHeftSession: this._internalHeftSession, task })
      });
      operations.set(key, operation);
    }
    return operation;
  }
}
