// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { performance } from 'perf_hooks';
import {
  AlreadyReportedError,
  Colors,
  ConsoleTerminalProvider,
  type IPackageJson,
  type ITerminal
} from '@rushstack/node-core-library';

import { Operation } from '../operations/Operation';
import { TaskOperationRunner } from '../operations/runners/TaskOperationRunner';
import { PhaseOperationRunner } from '../operations/runners/PhaseOperationRunner';
import { LifecycleOperationRunner } from '../operations/runners/LifecycleOperationRunner';
import type { IHeftAction } from '../cli/actions/IHeftAction';
import { HeftPhase } from '../pluginFramework/HeftPhase';
import type { HeftTask } from '../pluginFramework/HeftTask';
import type { InternalHeftSession } from '../pluginFramework/InternalHeftSession';
import type { LifecycleOperationRunnerType } from '../operations/runners/LifecycleOperationRunner';

export interface IExpandPhaseSelectionOptions {
  to?: Set<HeftPhase>;
  only?: Set<HeftPhase>;
}

export interface IExecuteInstrumentedOptions {
  action: IHeftAction;
  executeAsync: () => Promise<void>;
}

export interface ICreateOperationsOptions {
  internalHeftSession: InternalHeftSession;
  selectedPhases: Set<HeftPhase>;
  terminal: ITerminal;
  production: boolean;
  verbose: boolean;
  clean: boolean;
  cleanCache: boolean;
}

export function createOperations(options: ICreateOperationsOptions): Set<Operation> {
  const operations: Map<string, Operation> = new Map();
  const leafNodeTaskOperationsByPhaseName: Map<string, Set<Operation>> = new Map();

  if (options.cleanCache && !options.clean) {
    throw new Error('The "--clean-cache" option can only be used in conjunction with "--clean".');
  }

  const startLifecycleOperation: Operation = getOrCreateLifecycleOperation('start', options);
  const stopLifecycleOperation: Operation = getOrCreateLifecycleOperation('stop', options);

  let hasWarnedAboutSkippedPhases: boolean = false;
  for (const phase of options.selectedPhases) {
    // Warn if any dependencies are excluded from the list of selected phases
    if (
      !hasWarnedAboutSkippedPhases &&
      [...phase.dependencyPhases].some((dependency: HeftPhase) => !options.selectedPhases.has(dependency))
    ) {
      // Only write once, and write with yellow to make it stand out without writing a warning to stderr
      hasWarnedAboutSkippedPhases = true;
      options.terminal.writeLine(
        Colors.yellow(
          'The provided list of phases does not contain all phase dependencies. You may need to run the ' +
            'excluded phases manually.'
        )
      );
    }

    // Create operation for the phase start node
    const phaseOperation: Operation = getOrCreatePhaseOperation(phase, options);
    // Set the 'start' lifecycle operation as a dependency of all phases to ensure the 'start' lifecycle
    // operation runs first
    phaseOperation.dependencies.add(startLifecycleOperation);
    // Set the phase operation as a dependency of the 'end' lifecycle operation to ensure the phase
    // operation runs first
    stopLifecycleOperation.dependencies.add(phaseOperation);

    // Create operations for each task
    const phaseLeafNodes: Set<Operation> = new Set();
    for (const task of phase.tasks) {
      const taskOperation: Operation = getOrCreateTaskOperation(task, options);
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
        taskOperation.dependencies.add(getOrCreateTaskOperation(dependencyTask, options));
      }

      // Set all tasks in a in a phase as dependencies of the consuming phase
      for (const consumingPhase of phase.consumingPhases) {
        if (options.selectedPhases.has(consumingPhase)) {
          // Set all tasks in a dependency phase as dependencies of the consuming phase to ensure the dependency
          // tasks run first
          const consumingPhaseOperation: Operation = getOrCreatePhaseOperation(consumingPhase, options);
          consumingPhaseOperation.dependencies.add(taskOperation);
        }
      }
    }
    leafNodeTaskOperationsByPhaseName.set(phase.phaseName, phaseLeafNodes);
  }

  return new Set(operations.values());

  function getOrCreateLifecycleOperation(
    type: LifecycleOperationRunnerType,
    options: ICreateOperationsOptions
  ): Operation {
    const key: string = `lifecycle.${type}`;
    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      operation = new Operation({
        runner: new LifecycleOperationRunner({
          internalHeftSession: options.internalHeftSession,
          production: options.production,
          verbose: options.verbose,
          clean: options.clean,
          cleanCache: options.cleanCache,
          type
        })
      });
      operations.set(key, operation);
    }
    return operation;
  }

  function getOrCreatePhaseOperation(phase: HeftPhase, options: ICreateOperationsOptions): Operation {
    const key: string = phase.phaseName;
    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      // Only create the operation. Dependencies are hooked up separately
      operation = new Operation({
        runner: new PhaseOperationRunner({
          internalHeftSession: options.internalHeftSession,
          production: options.production,
          verbose: options.verbose,
          clean: options.clean,
          cleanCache: options.cleanCache,
          phase
        })
      });
      operations.set(key, operation);
    }
    return operation;
  }

  function getOrCreateTaskOperation(task: HeftTask, options: ICreateOperationsOptions): Operation {
    const key: string = `${task.parentPhase.phaseName}.${task.taskName}`;
    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      operation = new Operation({
        runner: new TaskOperationRunner({
          internalHeftSession: options.internalHeftSession,
          production: options.production,
          verbose: options.verbose,
          phase: task.parentPhase,
          task
        })
      });
      operations.set(key, operation);
    }
    return operation;
  }
}

export function initializeAction(action: IHeftAction): void {
  action.metricsCollector.setStartTime();
}

export async function executeInstrumentedAsync(options: IExecuteInstrumentedOptions): Promise<void> {
  const { action, executeAsync } = options;
  const { actionName, heftConfiguration, terminal, loggingManager } = action;

  terminal.writeLine(`Starting ${actionName}`);

  if (action.verbose && action.heftConfiguration.terminalProvider instanceof ConsoleTerminalProvider) {
    action.heftConfiguration.terminalProvider.verboseEnabled = true;
  }

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

    const projectPackageJson: IPackageJson = heftConfiguration.projectPackageJson;
    terminal.writeLine(
      `Project: ${projectPackageJson.name}`,
      Colors.dim(Colors.gray(`@${projectPackageJson.version}`))
    );
    terminal.writeLine(`Heft version: ${heftConfiguration.heftPackageJson.version}`);
    terminal.writeLine(`Node version: ${process.version}`);
  }

  if (encounteredError) {
    throw new AlreadyReportedError();
  }
}
