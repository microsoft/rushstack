// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IPhase } from '../../api/CommandLineConfiguration';

import { Operation } from './Operation';
import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { IOperationSettings } from '../../api/RushProjectConfiguration';

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
  const {
    projectsInUnknownState: changedProjects,
    phaseOriginal,
    phaseSelection,
    projectSelection,
    projectConfigurations
  } = context;
  const operationsWithWork: Set<Operation> = new Set();

  const operations: Map<string, Operation> = new Map();

  // Create tasks for selected phases and projects
  for (const phase of phaseOriginal) {
    for (const project of projectSelection) {
      getOrCreateOperation(phase, project);
    }
  }

  // Recursively expand all consumers in the `operationsWithWork` set.
  for (const operation of operationsWithWork) {
    for (const consumer of operation.consumers) {
      operationsWithWork.add(consumer);
    }
  }

  for (const operation of operations.values()) {
    if (!operationsWithWork.has(operation)) {
      // This operation is in scope, but did not change since it was last executed by the current command.
      // However, we have no state tracking across executions, so treat as unknown.
      operation.enabled = false;
    }
  }

  return existingOperations;

  // Binds phaseSelection, projectSelection, operations via closure
  function getOrCreateOperation(phase: IPhase, project: RushConfigurationProject): Operation {
    const key: string = getOperationKey(phase, project);
    let operation: Operation | undefined = operations.get(key);

    if (!operation) {
      const {
        dependencies: { self, upstream },
        name,
        logFilenameIdentifier
      } = phase;
      const operationSettings: IOperationSettings | undefined = projectConfigurations
        .get(project)
        ?.operationSettingsByOperationName.get(name);
      operation = new Operation({
        project,
        phase,
        settings: operationSettings,
        logFilenameIdentifier: logFilenameIdentifier
      });

      if (!phaseSelection.has(phase) || !projectSelection.has(project)) {
        // Not in scope. Mark disabled, which will report as OperationStatus.Skipped.
        operation.enabled = false;
      } else if (changedProjects.has(project)) {
        operationsWithWork.add(operation);
      }

      operations.set(key, operation);
      existingOperations.add(operation);

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
