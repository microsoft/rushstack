// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Operation } from '@microsoft/rush-lib';
import type {
  IDaemonPhasedEngineShape,
  IDaemonPhasedOperationSelection
} from '@rushstack/rush-daemon-protocol';

import type { IResolvedSelection } from './PhasedRequestRouter';
import type { IWorkspaceEngineShape } from './WorkspaceEngineComponentFactory';

export function validateNonemptyName(value: string, kind: string): void {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`Invalid phased request ${kind}: "${value}".`);
  }
}

export function validateEngineShape(
  requestShape: IDaemonPhasedEngineShape,
  workspaceShape: IWorkspaceEngineShape | undefined
): void {
  if (!workspaceShape) {
    throw new Error('The workspace session does not declare a reusable engine shape.');
  }
  validateNameSet(requestShape.phaseNames, workspaceShape.phaseNames, 'phase');
  validateNameSet(requestShape.pluginNames, workspaceShape.pluginNames, 'plugin');
}

function validateNameSet(
  requestedNames: ReadonlyArray<string>,
  workspaceNames: ReadonlyArray<string>,
  kind: string
): void {
  const requested: Set<string> = new Set(requestedNames);
  if (
    requested.size !== requestedNames.length ||
    requested.size !== workspaceNames.length ||
    workspaceNames.some((name: string) => !requested.has(name))
  ) {
    throw new Error(`The phased request ${kind} shape does not match the warm workspace engine.`);
  }
}

export function indexOperations(operations: ReadonlySet<Operation>): ReadonlyMap<string, Operation> {
  const operationById: Map<string, Operation> = new Map();
  for (const operation of operations) {
    const operationId: string = operation.name;
    if (operationById.has(operationId)) {
      throw new Error(`The workspace graph contains duplicate operation id "${operationId}".`);
    }
    operationById.set(operationId, operation);
  }
  return operationById;
}

export function resolveSelection(
  requestedSelection: ReadonlyArray<IDaemonPhasedOperationSelection>,
  operationById: ReadonlyMap<string, Operation>,
  exact: boolean
): IResolvedSelection {
  if (!exact && requestedSelection.length === 0) {
    throw new Error('A phased request must select at least one operation.');
  }
  const selectedIds: Set<string> = new Set();
  const enabledOperations: Operation[] = [];
  const ignoreDependencyOperations: Operation[] = [];
  for (const selection of requestedSelection) {
    validateNonemptyName(selection.operationId, 'operation id');
    if (selectedIds.has(selection.operationId)) {
      throw new Error(`Duplicate phased request operation id "${selection.operationId}".`);
    }
    selectedIds.add(selection.operationId);
    const operation: Operation | undefined = operationById.get(selection.operationId);
    if (!operation) {
      throw new Error(`Unknown phased request operation id "${selection.operationId}".`);
    }
    addSelectedOperation(selection.enabledState, operation, enabledOperations, ignoreDependencyOperations);
  }
  return {
    activeOperations: exact
      ? [...enabledOperations, ...ignoreDependencyOperations]
      : collectSelectionClosure(enabledOperations, ignoreDependencyOperations),
    enabledOperations,
    ignoreDependencyOperations,
    exact
  };
}

function addSelectedOperation(
  enabledState: unknown,
  operation: Operation,
  enabledOperations: Operation[],
  ignoreDependencyOperations: Operation[]
): void {
  if (enabledState === true) {
    enabledOperations.push(operation);
  } else if (enabledState === 'ignore-dependency-changes') {
    ignoreDependencyOperations.push(operation);
  } else {
    throw new Error(`Invalid phased request enabled state: "${String(enabledState)}".`);
  }
}

export function collectSelectionClosure(
  enabledOperations: ReadonlyArray<Operation>,
  ignoreDependencyOperations: ReadonlyArray<Operation>
): ReadonlyArray<Operation> {
  const activeOperations: Set<Operation> = new Set([...enabledOperations, ...ignoreDependencyOperations]);
  for (const operation of activeOperations) {
    for (const dependency of operation.dependencies) {
      activeOperations.add(dependency);
    }
  }
  return Array.from(activeOperations);
}

/**
 * The operations whose results decide a request's outcome: those of the selected projects that no other selected
 * project consumes, such as the projects named by `--to`. The other selected operations only feed them.
 *
 * @remarks
 * Projects rather than operations are compared, because an operation that nothing consumes, such as the last
 * phase of a dependency, still only serves a consuming project's request.
 */
export function getTargetOperationIds(activeOperations: ReadonlyArray<Operation>): ReadonlySet<string> {
  const active: ReadonlySet<Operation> = new Set(activeOperations);
  const consumedProjects: Set<Operation['associatedProject']> = new Set();
  for (const consumer of activeOperations) {
    for (const dependency of consumer.dependencies) {
      if (active.has(dependency) && dependency.associatedProject !== consumer.associatedProject) {
        consumedProjects.add(dependency.associatedProject);
      }
    }
  }
  const targetOperationIds: Set<string> = new Set();
  for (const operation of activeOperations) {
    if (!consumedProjects.has(operation.associatedProject)) {
      targetOperationIds.add(operation.name);
    }
  }
  return targetOperationIds;
}
