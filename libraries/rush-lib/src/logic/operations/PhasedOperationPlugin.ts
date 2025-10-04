// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IPhase } from '../../api/CommandLineConfiguration';
import { Operation, type OperationEnabledState } from './Operation';
import type {
  ICreateOperationsContext,
  IOperationExecutionManager,
  IOperationExecutionManagerContext,
  IOperationExecutionIterationOptions,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { IOperationSettings } from '../../api/RushProjectConfiguration';
import type { IConfigurableOperation, IOperationExecutionResult } from './IOperationExecutionResult';
import { SUCCESS_STATUSES } from './OperationStatus';
import type { IInputsSnapshot } from '../incremental/InputsSnapshot';

const PLUGIN_NAME: 'PhasedOperationPlugin' = 'PhasedOperationPlugin';

/**
 * Core phased command plugin that provides the functionality for generating a base operation graph
 * from the set of selected projects and phases.
 */
export class PhasedOperationPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.createOperationsAsync.tap(PLUGIN_NAME, createOperations);
    // Configure operations later.
    hooks.executionManagerAsync.tap(
      {
        name: `${PLUGIN_NAME}.Configure`,
        stage: 1000
      },
      configureExecutionManager
    );
  }
}

function createOperations(
  existingOperations: Set<Operation>,
  context: ICreateOperationsContext
): Set<Operation> {
  const {
    phaseSelection: phases,
    projectSelection: projects,
    projectConfigurations,
    changedProjectsOnly,
    includePhaseDeps,
    isIncrementalBuildAllowed,
    generateFullGraph,
    rushConfiguration
  } = context;

  const operations: Map<string, Operation> = new Map();

  const defaultEnabledState: OperationEnabledState =
    changedProjectsOnly && isIncrementalBuildAllowed ? 'ignore-dependency-changes' : true;

  const projectUniverse: Iterable<RushConfigurationProject> = generateFullGraph
    ? rushConfiguration.projects
    : projects;
  for (const phase of phases) {
    for (const project of projectUniverse) {
      getOrCreateOperation(phase, project);
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

      const includedInSelection: boolean = phases.has(phase) && projects.has(project);
      operation = new Operation({
        project,
        phase,
        settings: operationSettings,
        logFilenameIdentifier: logFilenameIdentifier,
        enabled:
          includePhaseDeps || includedInSelection
            ? operationSettings?.ignoreChangedProjectsOnlyFlag
              ? true
              : defaultEnabledState
            : false
      });

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

function configureExecutionManager(
  executionManager: IOperationExecutionManager,
  context: IOperationExecutionManagerContext
): void {
  executionManager.hooks.configureIteration.tap(
    PLUGIN_NAME,
    (
      currentStates: ReadonlyMap<Operation, IConfigurableOperation>,
      lastStates: ReadonlyMap<Operation, IOperationExecutionResult>,
      iterationOptions: IOperationExecutionIterationOptions
    ) => {
      configureOperations(currentStates, lastStates, iterationOptions);
    }
  );
}

function shouldEnableOperation(
  currentState: IConfigurableOperation,
  lastState: IOperationExecutionResult | undefined,
  inputsSnapshot?: IInputsSnapshot
): boolean {
  if (!lastState) {
    return true;
  }

  if (!SUCCESS_STATUSES.has(lastState.status)) {
    return true;
  }

  if (!inputsSnapshot) {
    // Insufficient information to tell if a rebuild is needed, so assume yes.
    return true;
  }

  const currentHashComponents: ReadonlyArray<string> = currentState.getStateHashComponents();
  const lastHashComponents: ReadonlyArray<string> = lastState.getStateHashComponents();
  if (currentHashComponents.length !== lastHashComponents.length) {
    return true;
  }

  const localChangesOnly: boolean = currentState.operation.enabled === 'ignore-dependency-changes';

  // In localChangesOnly mode, we ignore the components that come from dependencies, which are all but the last two
  for (
    let i: number = localChangesOnly ? currentHashComponents.length - 2 : 0;
    i < currentHashComponents.length;
    i++
  ) {
    if (currentHashComponents[i] !== lastHashComponents[i]) {
      return true;
    }
  }

  return false;
}

function configureOperations(
  currentStates: ReadonlyMap<Operation, IConfigurableOperation>,
  lastStates: ReadonlyMap<Operation, IOperationExecutionResult>,
  iterationOptions: IOperationExecutionIterationOptions
): void {
  for (const [operation, currentState] of currentStates) {
    const lastState: IOperationExecutionResult | undefined = lastStates.get(operation);

    currentState.enabled =
      operation.enabled && shouldEnableOperation(currentState, lastState, iterationOptions.inputsSnapshot);
  }
}

// Convert the [IPhase, RushConfigurationProject] into a value suitable for use as a Map key
function getOperationKey(phase: IPhase, project: RushConfigurationProject): string {
  return `${project.packageName};${phase.name}`;
}
