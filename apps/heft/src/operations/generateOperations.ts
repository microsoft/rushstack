// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';
import type { Operation as IOperation } from '@rushstack/operation-graph';
// Deep imports avoid loading the rest of the package (e.g. WatchLoop). These resolve to the same
// modules (and thus the same classes) that the package entry point re-exports.
import { Operation } from '@rushstack/operation-graph/lib/Operation';
import { OperationGroupRecord } from '@rushstack/operation-graph/lib/OperationGroupRecord';

import type { IHeftPhaseOperationMetadata, IHeftTaskOperationMetadata } from '../cli/HeftActionRunner';
import type { HeftPhase } from '../pluginFramework/HeftPhase';
import type { HeftTask } from '../pluginFramework/HeftTask';
import type { InternalHeftSession } from '../pluginFramework/InternalHeftSession';
import { PhaseOperationRunner } from './runners/PhaseOperationRunner';
import { TaskOperationRunner } from './runners/TaskOperationRunner';

export interface IGenerateOperationsOptions {
  internalHeftSession: InternalHeftSession;
  selectedPhases: ReadonlySet<HeftPhase>;
  terminal: ITerminal;
}

/**
 * Creates the operation graph (one silent operation per phase, plus one operation per task) for the
 * selected phases.
 */
export function generateOperations(
  options: IGenerateOperationsOptions
): Set<IOperation<IHeftTaskOperationMetadata, IHeftPhaseOperationMetadata>> {
  const { internalHeftSession, selectedPhases, terminal } = options;

  const operations: Map<
    string,
    Operation<IHeftTaskOperationMetadata, IHeftPhaseOperationMetadata>
  > = new Map();
  const operationGroups: Map<string, OperationGroupRecord<IHeftPhaseOperationMetadata>> = new Map();

  let hasWarnedAboutSkippedPhases: boolean = false;
  for (const phase of selectedPhases) {
    // Warn if any dependencies are excluded from the list of selected phases
    if (!hasWarnedAboutSkippedPhases) {
      for (const dependencyPhase of phase.dependencyPhases) {
        if (!selectedPhases.has(dependencyPhase)) {
          // Only write once, and write with yellow to make it stand out without writing a warning to stderr
          hasWarnedAboutSkippedPhases = true;
          terminal.writeLine(
            Colorize.bold(
              'The provided list of phases does not contain all phase dependencies. You may need to run the ' +
                'excluded phases manually.'
            )
          );
          break;
        }
      }
    }

    // Create operation for the phase start node
    const phaseOperation: Operation = _getOrCreatePhaseOperation(
      internalHeftSession,
      phase,
      operations,
      operationGroups
    );

    // Create operations for each task
    for (const task of phase.tasks) {
      const taskOperation: Operation = _getOrCreateTaskOperation(
        internalHeftSession,
        task,
        operations,
        operationGroups
      );
      // Set the phase operation as a dependency of the task operation to ensure the phase operation runs first
      taskOperation.addDependency(phaseOperation);

      // Set all dependency tasks as dependencies of the task operation
      for (const dependencyTask of task.dependencyTasks) {
        taskOperation.addDependency(
          _getOrCreateTaskOperation(internalHeftSession, dependencyTask, operations, operationGroups)
        );
      }

      // Set all tasks in a in a phase as dependencies of the consuming phase
      for (const consumingPhase of phase.consumingPhases) {
        if (selectedPhases.has(consumingPhase)) {
          // Set all tasks in a dependency phase as dependencies of the consuming phase to ensure the dependency
          // tasks run first
          const consumingPhaseOperation: Operation = _getOrCreatePhaseOperation(
            internalHeftSession,
            consumingPhase,
            operations,
            operationGroups
          );
          consumingPhaseOperation.addDependency(taskOperation);
          // This is purely to simplify the reported graph for phase circularities
          consumingPhaseOperation.addDependency(phaseOperation);
        }
      }
    }
  }

  // The declarations under "lib/" are distinct from the rolled-up declarations of the package entry point,
  // but describe the same runtime classes.
  return new Set(operations.values()) as unknown as Set<
    IOperation<IHeftTaskOperationMetadata, IHeftPhaseOperationMetadata>
  >;
}

function _getOrCreatePhaseOperation(
  this: void,
  internalHeftSession: InternalHeftSession,
  phase: HeftPhase,
  operations: Map<string, Operation>,
  operationGroups: Map<string, OperationGroupRecord<IHeftPhaseOperationMetadata>>
): Operation {
  const key: string = phase.phaseName;

  let operation: Operation | undefined = operations.get(key);
  if (!operation) {
    let group: OperationGroupRecord<IHeftPhaseOperationMetadata> | undefined = operationGroups.get(
      phase.phaseName
    );
    if (!group) {
      group = new OperationGroupRecord(phase.phaseName, { phase });
      operationGroups.set(phase.phaseName, group);
    }
    // Only create the operation. Dependencies are hooked up separately
    operation = new Operation({
      group,
      name: phase.phaseName,
      runner: new PhaseOperationRunner({ phase, internalHeftSession })
    });
    operations.set(key, operation);
  }
  return operation;
}

function _getOrCreateTaskOperation(
  this: void,
  internalHeftSession: InternalHeftSession,
  task: HeftTask,
  operations: Map<string, Operation>,
  operationGroups: Map<string, OperationGroupRecord<IHeftPhaseOperationMetadata>>
): Operation {
  const key: string = `${task.parentPhase.phaseName}.${task.taskName}`;

  let operation: Operation<IHeftTaskOperationMetadata> | undefined = operations.get(
    key
  ) as Operation<IHeftTaskOperationMetadata>;
  if (!operation) {
    const group: OperationGroupRecord<IHeftPhaseOperationMetadata> | undefined = operationGroups.get(
      task.parentPhase.phaseName
    );
    if (!group) {
      throw new InternalError(
        `Task ${task.taskName} in phase ${task.parentPhase.phaseName} has no group. This should not happen.`
      );
    }
    operation = new Operation({
      group,
      runner: new TaskOperationRunner({
        internalHeftSession,
        task
      }),
      name: task.taskName,
      metadata: { task, phase: task.parentPhase }
    });
    operations.set(key, operation);
  }
  return operation;
}
