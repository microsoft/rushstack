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
import { TaskOperationRunner } from '../operations/TaskOperationRunner';
import { PhaseOperationRunner } from '../operations/PhaseOperationRunner';
import type { IHeftAction } from '../cli/actions/IHeftAction';
import type { HeftPhase } from '../pluginFramework/HeftPhase';
import type { HeftTask } from '../pluginFramework/HeftTask';
import type { InternalHeftSession } from '../pluginFramework/InternalHeftSession';

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
  terminal: ITerminal;
  production: boolean;
  clean: boolean;
}

export function createOperations(options: ICreateOperationsOptions): Set<Operation> {
  const operations: Map<string, Operation> = new Map();
  const phaseOperations: Map<string, Operation> = new Map();
  const leafNodeTaskOperations: Map<string, Set<Operation>> = new Map();

  const { internalHeftSession, terminal } = options;
  for (const phase of internalHeftSession.phases) {
    // Create operation for the phase start node
    const phaseOperation: Operation = getOrCreatePhaseOperation(phase, options);
    phaseOperations.set(phase.phaseName, phaseOperation);

    // Create operations for each task
    const phaseLeafNodes: Set<Operation> = new Set();
    for (const task of phase.tasks) {
      const taskOperation: Operation = getOrCreateTaskOperation(task, options);
      // All tasks in a phase depend on the phase operation
      taskOperation.dependencies.add(phaseOperation);
      // Save the leaf nodes for later processing
      if (!task.consumingTasks.size) {
        phaseLeafNodes.add(taskOperation);
      }
    }
    leafNodeTaskOperations.set(phase.phaseName, phaseLeafNodes);
  }

  let hasWarnedAboutSkippedPhases: boolean = false;
  for (const phase of internalHeftSession.phases) {
    if (phase.dependencyPhases.size) {
      // Link up the leaf node operations of the dependency phases to the root node operations of the current
      // phase.
      const phaseOperation: Operation = phaseOperations.get(phase.phaseName)!;
      for (const dependencyPhase of phase.dependencyPhases) {
        // Check to see if the dependency phase is in the list of selected phases and if not, ignore it. We
        // will assume that unselected dependency phases have already completed and we don't need to run them.
        if (internalHeftSession.phases.has(dependencyPhase)) {
          // Add the dependency phase operation to the current phase operation's dependencies to allow for
          // taskless dependency phases
          const dependencyPhaseOperation: Operation = phaseOperations.get(dependencyPhase.phaseName)!;
          phaseOperation.dependencies.add(dependencyPhaseOperation);

          // Link up the dependency phase leaf nodes to the current phase operation
          const dependencyPhaseLeafNodeOperations: Set<Operation> = leafNodeTaskOperations.get(
            dependencyPhase.phaseName
          )!;
          for (const dependencyPhaseLeafNodeOperation of dependencyPhaseLeafNodeOperations) {
            phaseOperation.dependencies.add(dependencyPhaseLeafNodeOperation);
          }
        } else if (!hasWarnedAboutSkippedPhases) {
          // Only write once, and write with yellow to make it stand out without writing a warning to stderr
          hasWarnedAboutSkippedPhases = true;
          terminal.writeLine(
            Colors.yellow(
              'The provided list of phases does not contain all phase dependencies. You may need to run the ' +
                'excluded phases manually.'
            )
          );
        }
      }
    }
  }

  return new Set(operations.values());

  function getOrCreatePhaseOperation(phase: HeftPhase, options: ICreateOperationsOptions): Operation {
    const key: string = phase.phaseName;
    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      // Only create the operation. Dependencies are hooked up separately
      operation = new Operation({
        runner: new PhaseOperationRunner({
          internalHeftSession: options.internalHeftSession,
          production: options.production,
          clean: options.clean,
          phase
        })
      });
      operations.set(key, operation);
    }
    return operation;
  }

  function getOrCreateTaskOperation(task: HeftTask, options: ICreateOperationsOptions): Operation {
    const key: string = `${task.parentPhase.phaseName};${task.taskName}`;
    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      operation = new Operation({
        runner: new TaskOperationRunner({
          internalHeftSession: options.internalHeftSession,
          production: options.production,
          clean: options.clean,
          phase: task.parentPhase,
          task
        })
      });
      operations.set(key, operation);
      for (const dependencyTask of task.dependencyTasks) {
        operation.dependencies.add(getOrCreateTaskOperation(dependencyTask, options));
      }
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
