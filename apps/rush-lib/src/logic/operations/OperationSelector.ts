// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IPhase } from '../../api/CommandLineConfiguration';
import type { IOperationRunner } from './IOperationRunner';

import { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';
import { NullOperationRunner } from './NullOperationRunner';

export interface IOperationSelectorOptions {
  phasesToRun: ReadonlySet<IPhase>;
}

export interface ICreateOperationsOptions {
  phaseSelection: ReadonlySet<IPhase>;
  projectSelection: ReadonlySet<RushConfigurationProject>;
  operationFactory: IOperationRunnerFactory;
}

export interface IOperationOptions {
  project: RushConfigurationProject;
  phase: IPhase;
}

export interface IOperationRunnerFactory {
  createOperationRunner(options: IOperationOptions): IOperationRunner;
}

/**
 * This function creates operations for the set of selected projects and phases, using the provided factory
 */
export function createOperations(
  existingOperations: Set<Operation>,
  createOperationsOptions: ICreateOperationsOptions
): Set<Operation> {
  const { phaseSelection, projectSelection, operationFactory } = createOperationsOptions;

  const operations: Map<string, Operation> = new Map();

  // Convert the [IPhase, RushConfigurationProject] into a value suitable for use as a Map key
  function getOperationKey(phase: IPhase, project: RushConfigurationProject): string {
    return `${project.packageName};${phase.name}`;
  }

  function getOperation(phase: IPhase, project: RushConfigurationProject): Operation {
    const key: string = getOperationKey(phase, project);
    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      const isIncluded: boolean = phaseSelection.has(phase) && projectSelection.has(project);

      const runner: IOperationRunner = isIncluded
        ? operationFactory.createOperationRunner({
            phase,
            project
          })
        : new NullOperationRunner(key, OperationStatus.Skipped, true);

      operation = new Operation(runner, project, phase);
      operations.set(key, operation);
      existingOperations.add(operation);

      const {
        phaseDependencies: { self, upstream }
      } = phase;

      const { dependencies } = operation;

      for (const depPhase of self) {
        dependencies.add(getOperation(depPhase, project));
      }

      if (upstream.size) {
        const { dependencyProjects } = project;
        if (dependencyProjects.size) {
          for (const depPhase of upstream) {
            for (const dependencyProject of dependencyProjects) {
              dependencies.add(getOperation(depPhase, dependencyProject));
            }
          }
        }
      }
    }

    return operation;
  }

  // Create tasks for selected phases and projects
  for (const phase of phaseSelection) {
    for (const project of projectSelection) {
      getOperation(phase, project);
    }
  }

  return existingOperations;
}
