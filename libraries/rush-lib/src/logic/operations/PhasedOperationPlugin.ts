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
import { IOperationSettings, RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import { IProjectFileFilter } from '../ProjectChangeAnalyzer';
import ignore, { Ignore } from 'ignore';
import { BuildCacheOperationProcessor } from '../buildCache/BuildCacheOperationProcessor';

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
    phaseSelection,
    projectSelection,
    buildCacheConfiguration
  } = context;
  const operationsWithWork: Set<Operation> = new Set();

  const operations: Map<string, Operation> = new Map();

  const fileFilterCache: WeakMap<object, IProjectFileFilter> = new WeakMap();

  const buildCacheEnabled: boolean = !!context.buildCacheConfiguration?.buildCacheEnabled;

  // Create tasks for selected phases and projects
  for (const phase of phaseSelection) {
    for (const [project, projectConfiguration] of projectSelection) {
      getOrCreateOperation(phase, project, projectConfiguration);
    }
  }

  // Recursively expand all consumers in the `operationsWithWork` set.
  for (const operation of operationsWithWork) {
    for (const consumer of operation.consumers) {
      operationsWithWork.add(consumer);
    }
  }

  for (const [key, operation] of operations) {
    if (!operationsWithWork.has(operation)) {
      // This operation is in scope, but did not change since it was last executed by the current command.
      // However, we have no state tracking across executions, so treat as unknown.
      operation.runner = new NullOperationRunner({
        name: key,
        result: OperationStatus.Skipped,
        silent: true
      });
    }
  }

  return existingOperations;
  function getFileFilter(ignoreGlobs: ReadonlyArray<string> | undefined): IProjectFileFilter | undefined {
    if (!ignoreGlobs || ignoreGlobs.length === 0) {
      return;
    }

    let filter: IProjectFileFilter | undefined = fileFilterCache.get(ignoreGlobs);
    if (!filter) {
      const ignoreMatcher: Ignore = ignore();
      for (const ignoreGlob of ignoreGlobs) {
        ignoreMatcher.add(ignoreGlob);
      }
      filter = ignoreMatcher.createFilter();
      fileFilterCache.set(ignoreGlobs, filter);
    }

    return filter;
  }

  // Binds phaseSelection, projectSelection, operations via closure
  function getOrCreateOperation(
    phase: IPhase,
    project: RushConfigurationProject,
    projectConfiguration: RushProjectConfiguration | undefined
  ): Operation {
    const key: string = getOperationKey(phase, project);
    let operation: Operation | undefined = operations.get(key);
    if (!operation) {
      const optionsForPhase: IOperationSettings | undefined =
        projectConfiguration?.operationSettingsByOperationName.get(phase.name);
      const outputFolderNames: ReadonlyArray<string> = optionsForPhase?.outputFolderNames || [];
      const projectFileFilter: IProjectFileFilter | undefined = getFileFilter(
        projectConfiguration?.incrementalBuildIgnoredGlobs
      );

      const enableCache: boolean =
        buildCacheEnabled &&
        !!optionsForPhase &&
        !projectConfiguration?.disableBuildCacheForProject &&
        !optionsForPhase?.disableBuildCacheForOperation;

      operation = new Operation({
        project,
        phase,
        outputFolderNames,
        projectFileFilter,
        processor:
          enableCache && buildCacheConfiguration
            ? new BuildCacheOperationProcessor({
                project,
                phaseName: phase.name,
                outputFolderNames,
                buildCacheConfiguration
              })
            : undefined
      });

      if (!phaseSelection.has(phase) || !projectSelection.has(project)) {
        // Not in scope. Mark skipped because state is unknown.
        operation.runner = new NullOperationRunner({
          name: key,
          result: OperationStatus.Skipped,
          silent: true
        });
        operation.processor = undefined;
      } else if (changedProjects.has(project)) {
        operationsWithWork.add(operation);
      }

      operations.set(key, operation);
      existingOperations.add(operation);

      const {
        dependencies: { self, upstream }
      } = phase;

      for (const depPhase of self) {
        operation.addDependency(getOrCreateOperation(depPhase, project, projectConfiguration));
      }

      if (upstream.size) {
        const { dependencyProjects } = project;
        if (dependencyProjects.size) {
          for (const depPhase of upstream) {
            for (const dependencyProject of dependencyProjects) {
              operation.addDependency(
                getOrCreateOperation(depPhase, dependencyProject, projectSelection.get(dependencyProject))
              );
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
