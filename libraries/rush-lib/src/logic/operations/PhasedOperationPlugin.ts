// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IPhase } from '../../api/CommandLineConfiguration';
import { Operation, type OperationEnabledState } from './Operation';
import type {
  ICreateOperationsContext,
  IOperationGraphContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { IOperationGraph, IOperationGraphIterationOptions } from './IOperationGraph';
import type { IOperationSettings } from '../../api/RushProjectConfiguration';
import type {
  IConfigurableOperation,
  IOperationExecutionResult,
  IOperationStateHashComponents
} from './IOperationExecutionResult';
import { OperationStatus, SUCCESS_STATUSES } from './OperationStatus';
import type { IInputsSnapshot } from '../incremental/InputsSnapshot';
import { enableUnverifiedRetainedOperations, isResultUnverifiable } from './RetainedResultVerification';

const PLUGIN_NAME: 'PhasedOperationPlugin' = 'PhasedOperationPlugin';
// Runs after the default-stage taps (e.g. CacheableOperationPlugin's input file checks), which can mark a result as
// unverifiable.
const VERIFY_RESULT_STAGE: number = 1;

/**
 * The statuses of results retained by an earlier iteration of the graph that are reused while the state hash of the
 * operation is unchanged. The graph only retains a `Skipped` result for an operation that was selected to execute,
 * when a plugin (e.g. change detection) found its outputs up to date.
 */
const RETAINED_RESULT_STATUSES: ReadonlySet<OperationStatus> = new Set([
  ...SUCCESS_STATUSES,
  OperationStatus.Skipped
]);

/**
 * Core phased command plugin that provides the functionality for generating a base operation graph
 * from the set of selected projects and phases.
 */
export class PhasedOperationPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.createOperationsAsync.tap(PLUGIN_NAME, createOperations);
    // Configure operations later.
    hooks.onGraphCreatedAsync.tap(
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

function configureExecutionManager(graph: IOperationGraph, context: IOperationGraphContext): void {
  // The state hash at which each operation last produced its outputs, or restored them from the build cache,
  // in an iteration of this graph in which the outputs of all of its dependencies were verified.
  const verifiedStateHashByOperation: Map<Operation, string> = new Map();
  // The records of the executing iteration, if its state hashes are available.
  let iterationRecords: ReadonlyMap<Operation, IOperationExecutionResult> | undefined;

  graph.hooks.beforeDeleteResults.tap(PLUGIN_NAME, (operations: ReadonlySet<Operation>) => {
    for (const operation of operations) {
      verifiedStateHashByOperation.delete(operation);
    }
  });

  graph.hooks.configureIteration.tap(
    PLUGIN_NAME,
    (
      currentStates: ReadonlyMap<Operation, IConfigurableOperation>,
      lastStates: ReadonlyMap<Operation, IOperationExecutionResult>,
      iterationOptions: IOperationGraphIterationOptions
    ) => {
      configureOperations(currentStates, lastStates, iterationOptions);
      if (iterationOptions.inputsSnapshot) {
        // A retained result that is current by state hash can still have been built against outputs of a
        // dependency that were not current, e.g. by an `--only` request.
        enableUnverifiedRetainedOperations(
          currentStates,
          lastStates,
          verifiedStateHashByOperation,
          RETAINED_RESULT_STATUSES
        );
      }
    }
  );

  graph.hooks.beforeExecuteIterationAsync.tap(
    PLUGIN_NAME,
    (
      records: ReadonlyMap<Operation, IOperationExecutionResult>,
      iterationOptions: IOperationGraphIterationOptions
    ): void => {
      if (iterationOptions.inputsSnapshot) {
        iterationRecords = records;
      } else {
        // Without state hashes, nothing can be verified.
        iterationRecords = undefined;
        verifiedStateHashByOperation.clear();
      }
    }
  );

  graph.hooks.afterExecuteOperationAsync.tap(
    { name: PLUGIN_NAME, stage: VERIFY_RESULT_STAGE },
    (record: IOperationExecutionResult) => {
      if (iterationRecords) {
        updateVerifiedStateHash(record, iterationRecords, verifiedStateHashByOperation);
      }
    }
  );

  graph.hooks.afterExecuteIterationAsync.tap(PLUGIN_NAME, (status: OperationStatus) => {
    iterationRecords = undefined;
    return status;
  });
}

function updateVerifiedStateHash(
  record: IOperationExecutionResult,
  records: ReadonlyMap<Operation, IOperationExecutionResult>,
  verifiedStateHashByOperation: Map<Operation, string>
): void {
  const { operation } = record;
  switch (record.status) {
    case OperationStatus.Skipped: {
      if (!record.enabled) {
        // The operation was not selected, so its outputs were left as they were.
        return;
      }
      // A plugin (e.g. change detection) found the outputs of the selected operation up to date for its state
      // hash, which verifies them in the same way as executing it.
      if (
        !isResultUnverifiable(record) &&
        areDependenciesVerified(operation, records, verifiedStateHashByOperation)
      ) {
        verifiedStateHashByOperation.set(operation, record.getStateHash());
        return;
      }
      break;
    }

    case OperationStatus.FromCache: {
      // The outputs were restored from the build cache entry for this state hash.
      verifiedStateHashByOperation.set(operation, record.getStateHash());
      return;
    }

    case OperationStatus.Success:
    case OperationStatus.SuccessWithWarning:
    case OperationStatus.NoOp: {
      if (
        !isResultUnverifiable(record) &&
        areDependenciesVerified(operation, records, verifiedStateHashByOperation)
      ) {
        verifiedStateHashByOperation.set(operation, record.getStateHash());
        return;
      }
      break;
    }

    default: {
      // The outputs may be incomplete.
      break;
    }
  }

  verifiedStateHashByOperation.delete(operation);
}

function areDependenciesVerified(
  operation: Operation,
  records: ReadonlyMap<Operation, IOperationExecutionResult>,
  verifiedStateHashByOperation: ReadonlyMap<Operation, string>
): boolean {
  for (const dependency of operation.dependencies) {
    const dependencyRecord: IOperationExecutionResult | undefined = records.get(dependency);
    if (
      !dependencyRecord ||
      verifiedStateHashByOperation.get(dependency) !== dependencyRecord.getStateHash()
    ) {
      return false;
    }
  }
  return true;
}

function shouldEnableOperation(
  currentState: IConfigurableOperation,
  lastState: IOperationExecutionResult | undefined,
  inputsSnapshot?: IInputsSnapshot
): boolean {
  if (!lastState) {
    return true;
  }

  if (!RETAINED_RESULT_STATUSES.has(lastState.status)) {
    return true;
  }

  if (!inputsSnapshot) {
    // Insufficient information to tell if a rebuild is needed, so assume yes.
    return true;
  }

  const current: IOperationStateHashComponents = currentState.getStateHashComponents();
  const last: IOperationStateHashComponents = lastState.getStateHashComponents();

  // Always compare local and config hashes
  if (current.local !== last.local || current.config !== last.config) {
    return true;
  }

  const localChangesOnly: boolean = currentState.operation.enabled === 'ignore-dependency-changes';
  if (localChangesOnly) {
    return false;
  }

  // Compare dependency hashes
  if (current.dependencies.length !== last.dependencies.length) {
    return true;
  }
  for (let i: number = 0; i < current.dependencies.length; i++) {
    if (current.dependencies[i] !== last.dependencies[i]) {
      return true;
    }
  }

  return false;
}

function configureOperations(
  currentStates: ReadonlyMap<Operation, IConfigurableOperation>,
  lastStates: ReadonlyMap<Operation, IOperationExecutionResult>,
  iterationOptions: IOperationGraphIterationOptions
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
