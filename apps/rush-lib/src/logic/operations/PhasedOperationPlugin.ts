// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IPhase } from '../../api/CommandLineConfiguration';

import { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';
import { NullOperationRunner } from './NullOperationRunner';
import type { ICreateOperationsContext, PhasedCommandHooks } from '../../pluginFramework/PhasedCommandHooks';

const PLUGIN_NAME: 'PhasedOperationPlugin' = 'PhasedOperationPlugin';

/**
 * Core phased command plugin that provides the functionality for generating a base operation graph
 * from the set of selected projects and phases.
 */
export class PhasedOperationPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.createOperations.tap(PLUGIN_NAME, createOperations);

    function createOperations(
      existingOperations: Set<Operation>,
      context: ICreateOperationsContext
    ): Set<Operation> {
      const { phaseSelection, projectSelection } = context;

      const operations: Map<string, Operation> = new Map();

      // Convert the [IPhase, RushConfigurationProject] into a value suitable for use as a Map key
      function getOperationKey(phase: IPhase, project: RushConfigurationProject): string {
        return `${project.packageName};${phase.name}`;
      }

      function getOrCreateOperation(phase: IPhase, project: RushConfigurationProject): Operation {
        const key: string = getOperationKey(phase, project);
        let operation: Operation | undefined = operations.get(key);
        if (!operation) {
          const isIncluded: boolean = phaseSelection.has(phase) && projectSelection.has(project);

          operation = new Operation(project, phase);
          // included operations will be initialized by later plugins
          if (!isIncluded) {
            operation.runner = new NullOperationRunner({
              name: key,
              result: OperationStatus.Skipped,
              silent: true
            });
          }
          operations.set(key, operation);
          existingOperations.add(operation);

          const {
            phaseDependencies: { self, upstream }
          } = phase;

          const { dependencies } = operation;

          for (const depPhase of self) {
            dependencies.add(getOrCreateOperation(depPhase, project));
          }

          if (upstream.size) {
            const { dependencyProjects } = project;
            if (dependencyProjects.size) {
              for (const depPhase of upstream) {
                for (const dependencyProject of dependencyProjects) {
                  dependencies.add(getOrCreateOperation(depPhase, dependencyProject));
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
          getOrCreateOperation(phase, project);
        }
      }

      return existingOperations;
    }
  }
}
