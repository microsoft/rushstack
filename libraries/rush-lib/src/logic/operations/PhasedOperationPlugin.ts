// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IPhase } from '../../api/CommandLineConfiguration';

import { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';
import { NullOperationRunner } from './NullOperationRunner';
import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';

const PLUGIN_NAME: 'PhasedOperationPlugin' = 'PhasedOperationPlugin';

/**
 * Core phased command plugin that provides the functionality for generating a base operation graph
 * from the set of selected projects and phases.
 */
export class PhasedOperationPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.createOperations.tap(PLUGIN_NAME, createOperations);
  }
}

function createOperations(
  existingOperations: Set<Operation>,
  context: ICreateOperationsContext
): Set<Operation> {
  const { changedProjects, phaseSelection, projectSelection } = context;
  const operationsWithChanges: Set<Operation> = new Set();

  const operations: Map<string, Operation> = new Map();

  // Create tasks for selected phases and projects
  for (const phase of phaseSelection) {
    for (const project of projectSelection) {
      getOrCreateOperation(phase, project);
    }
  }

  for (const operation of operationsWithChanges) {
    for (const consumer of operation.consumers) {
      operationsWithChanges.add(consumer);
    }
  }

  for (const [key, operation] of operations) {
    if (!operationsWithChanges.has(operation)) {
      // In scope, but not changed.
      operation.runner = new NullOperationRunner({
        name: key,
        result: OperationStatus.FromCache,
        silent: true
      });
    }
  }

  return existingOperations;

  // Binds phaseSelection, projectSelection, operations via closure
  function getOrCreateOperation(phase: IPhase, project: RushConfigurationProject): Operation {
    const key: string = getOperationKey(phase, project);
    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      operation = new Operation({
        project,
        phase
      });

      if (!phaseSelection.has(phase) || !projectSelection.has(project)) {
        // Not in scope
        operation.runner = new NullOperationRunner({
          name: key,
          result: OperationStatus.Skipped,
          silent: true
        });
      } else if (changedProjects.has(project)) {
        operationsWithChanges.add(operation);
      }

      operations.set(key, operation);
      existingOperations.add(operation);

      const {
        dependencies: { self, upstream }
      } = phase;

      for (const depPhase of self) {
        operation.addDependency(getOrCreateOperation(depPhase, project));
      }

      if (upstream.size) {
        const { dependencyProjects } = project;
        if (dependencyProjects.size) {
          for (const depPhase of upstream) {
            for (const dependencyProject of dependencyProjects) {
              operation.addDependency(getOrCreateOperation(depPhase, dependencyProject));
            }
          }
        }
      }
    }

    return operation;
  }
}

// Convert the [IPhase, RushConfigurationProject] into a value suitable for use as a Map key
function getOperationKey(phase: IPhase, project: RushConfigurationProject): string {
  return `${project.packageName};${phase.name}`;
}
