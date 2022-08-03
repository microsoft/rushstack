// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { performance } from 'perf_hooks';
import {
  AlreadyReportedError,
  Colors,
  ConsoleTerminalProvider,
  type IPackageJson
} from '@rushstack/node-core-library';
import type {
  CommandLineFlagParameter,
  CommandLineParameterProvider,
  CommandLineStringListParameter
} from '@rushstack/ts-command-line';

import { Operation } from '../operations/Operation';
import {
  IOperationExecutionManagerOptions,
  OperationExecutionManager
} from '../operations/OperationExecutionManager';
import { TaskOperationRunner } from '../operations/runners/TaskOperationRunner';
import { PhaseOperationRunner } from '../operations/runners/PhaseOperationRunner';
import { LifecycleOperationRunner } from '../operations/runners/LifecycleOperationRunner';
import { HeftPhase } from '../pluginFramework/HeftPhase';
import { HeftParameterManager } from '../pluginFramework/HeftParameterManager';
import type { IHeftAction } from '../cli/actions/IHeftAction';
import type { HeftTask } from '../pluginFramework/HeftTask';
import type { LifecycleOperationRunnerType } from '../operations/runners/LifecycleOperationRunner';

export interface IExecuteInstrumentedOptions {
  action: IHeftAction;
  executeAsync: () => Promise<void>;
}

export function createOperations(action: IHeftAction): Set<Operation> {
  const {
    terminal,
    selectedPhases,
    parameterManager: {
      defaultParameters: { clean, cleanCache }
    }
  } = action;

  if (cleanCache && !clean) {
    throw new Error('The "--clean-cache" option can only be used in conjunction with "--clean".');
  }

  const operations: Map<string, Operation> = new Map();
  const startLifecycleOperation: Operation = getOrCreateLifecycleOperation('start', action);
  const stopLifecycleOperation: Operation = getOrCreateLifecycleOperation('stop', action);

  let hasWarnedAboutSkippedPhases: boolean = false;
  for (const phase of selectedPhases) {
    // Warn if any dependencies are excluded from the list of selected phases
    if (!hasWarnedAboutSkippedPhases) {
      for (const dependencyPhase of phase.dependencyPhases) {
        if (!selectedPhases.has(dependencyPhase)) {
          // Only write once, and write with yellow to make it stand out without writing a warning to stderr
          hasWarnedAboutSkippedPhases = true;
          terminal.writeLine(
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
    const phaseOperation: Operation = getOrCreatePhaseOperation(phase, action);
    // Set the 'start' lifecycle operation as a dependency of all phases to ensure the 'start' lifecycle
    // operation runs first
    phaseOperation.dependencies.add(startLifecycleOperation);
    // Set the phase operation as a dependency of the 'end' lifecycle operation to ensure the phase
    // operation runs first
    stopLifecycleOperation.dependencies.add(phaseOperation);

    // Create operations for each task
    for (const task of phase.tasks) {
      const taskOperation: Operation = getOrCreateTaskOperation(task, action);
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
        taskOperation.dependencies.add(getOrCreateTaskOperation(dependencyTask, action));
      }

      // Set all tasks in a in a phase as dependencies of the consuming phase
      for (const consumingPhase of phase.consumingPhases) {
        if (action.selectedPhases.has(consumingPhase)) {
          // Set all tasks in a dependency phase as dependencies of the consuming phase to ensure the dependency
          // tasks run first
          const consumingPhaseOperation: Operation = getOrCreatePhaseOperation(consumingPhase, action);
          consumingPhaseOperation.dependencies.add(taskOperation);
        }
      }
    }
  }

  return new Set(operations.values());

  function getOrCreateLifecycleOperation(type: LifecycleOperationRunnerType, action: IHeftAction): Operation {
    const {
      internalHeftSession,
      parameterManager: {
        defaultParameters: { clean, cleanCache }
      }
    } = action;
    const key: string = `lifecycle.${type}`;

    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      operation = new Operation({
        groupName: 'lifecycle',
        runner: new LifecycleOperationRunner({ internalHeftSession, clean, cleanCache, type })
      });
      operations.set(key, operation);
    }
    return operation;
  }

  function getOrCreatePhaseOperation(phase: HeftPhase, action: IHeftAction): Operation {
    const {
      internalHeftSession,
      parameterManager: {
        defaultParameters: { clean, cleanCache }
      }
    } = action;
    const key: string = phase.phaseName;

    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      // Only create the operation. Dependencies are hooked up separately
      operation = new Operation({
        groupName: phase.phaseName,
        runner: new PhaseOperationRunner({ internalHeftSession, clean, cleanCache, phase })
      });
      operations.set(key, operation);
    }
    return operation;
  }

  function getOrCreateTaskOperation(task: HeftTask, action: IHeftAction): Operation {
    const { internalHeftSession } = action;
    const key: string = `${task.parentPhase.phaseName}.${task.taskName}`;
    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      operation = new Operation({
        groupName: task.parentPhase.phaseName,
        runner: new TaskOperationRunner({ internalHeftSession, task })
      });
      operations.set(key, operation);
    }
    return operation;
  }
}

export function defineHeftActionParameters(
  action: IHeftAction,
  parameterProvider?: CommandLineParameterProvider | undefined
): void {
  const { internalHeftSession, selectedPhases } = action;
  parameterProvider = parameterProvider || action;

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

  const parameterManager: HeftParameterManager = new HeftParameterManager({
    isClean: () => cleanFlag.value,
    isCleanCache: () => cleanCacheFlag.value,
    isDebug: () => internalHeftSession.debug,
    isVerbose: () => verboseFlag.value,
    isProduction: () => productionFlag.value,
    getLocales: () => localesParameter.values
  });

  // Add all the lifecycle parameters for the action
  for (const lifecyclePluginDefinition of internalHeftSession.lifecycle.pluginDefinitions) {
    parameterManager.addPluginParameters(lifecyclePluginDefinition);
  }

  // Add all the task parameters for the action
  for (const phase of selectedPhases) {
    for (const task of phase.tasks) {
      parameterManager.addPluginParameters(task.pluginDefinition);
    }
  }

  // Finalize and apply to the CommandLineParameterProvider
  parameterManager.finalizeParameters(parameterProvider);
  action.parameterManager = parameterManager;
}

export async function executeHeftAction(action: IHeftAction): Promise<void> {
  // Set the parameter manager on the internal session, which is used to provide the selected
  // parameters to plugins. Set this in onExecute() since we now know that this action is being
  // executed, and the session should be populated with the executing parameters.
  action.internalHeftSession.parameterManager = action.parameterManager;

  // Execute the selected phases
  await executeInstrumentedAsync({
    action,
    executeAsync: async () => {
      const operations: Set<Operation> = createOperations(action);
      const operationExecutionManagerOptions: IOperationExecutionManagerOptions = {
        loggingManager: action.loggingManager,
        terminal: action.terminal,
        // TODO: Allow for running non-parallelized operations.
        parallelism: undefined
      };
      const executionManager: OperationExecutionManager = new OperationExecutionManager(
        operations,
        operationExecutionManagerOptions
      );
      await executionManager.executeAsync();
    }
  });
}

export async function executeInstrumentedAsync(options: IExecuteInstrumentedOptions): Promise<void> {
  const { action, executeAsync } = options;
  const { heftConfiguration, terminal, loggingManager, parameterManager } = action;

  if (heftConfiguration.terminalProvider instanceof ConsoleTerminalProvider) {
    heftConfiguration.terminalProvider.verboseEnabled =
      heftConfiguration.terminalProvider.verboseEnabled || parameterManager.defaultParameters.verbose;
  }

  const projectPackageJson: IPackageJson = heftConfiguration.projectPackageJson;
  terminal.writeVerboseLine(`Project: ${projectPackageJson.name}@${projectPackageJson.version}`);
  terminal.writeVerboseLine(`Project build folder: ${heftConfiguration.buildFolder}`);
  if (heftConfiguration.rigConfig.rigFound) {
    terminal.writeVerboseLine(`Rig package: ${heftConfiguration.rigConfig.rigPackageName}`);
    terminal.writeVerboseLine(`Rig profile: ${heftConfiguration.rigConfig.rigProfile}`);
  }
  terminal.writeVerboseLine(`Heft version: ${heftConfiguration.heftPackageJson.version}`);
  terminal.writeVerboseLine(`Node version: ${process.version}`);
  terminal.writeVerboseLine('');

  let encounteredError: boolean = false;
  try {
    await executeAsync();
  } catch (e) {
    encounteredError = true;
    throw e;
  } finally {
    const warningStrings: string[] = loggingManager.getWarningStrings();
    const errorStrings: string[] = loggingManager.getErrorStrings();

    const encounteredWarnings: boolean = warningStrings.length > 0;
    encounteredError = encounteredError || errorStrings.length > 0;

    await action.metricsCollector.recordAsync(
      action.actionName,
      {
        encounteredError
      },
      action.getParameterStringMap()
    );

    terminal.writeLine(
      Colors.bold(
        (encounteredError ? Colors.red : encounteredWarnings ? Colors.yellow : Colors.green)(
          `-------------------- Finished (${Math.round(performance.now()) / 1000}s) --------------------`
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

export function initializeAction(action: IHeftAction): void {
  action.metricsCollector.setStartTime();
}
