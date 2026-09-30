// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { IInputsSnapshot, Operation } from '@microsoft/rush-lib';

import {
  WorkspaceEngineRecreationRequiredError,
  type IMapWorkspaceInvalidationsOptions
} from './WorkspaceEngineComponentFactory';

/**
 * Returns the operations whose own state hashes differ between the current and the next inputs snapshots.
 */
export function getOperationsWithChangedInputs(options: IMapWorkspaceInvalidationsOptions): Operation[] {
  const { currentInputsSnapshot: current, nextInputsSnapshot: next, operationGraph } = options;
  if (current === next) {
    // A snapshot computes the same hashes each time
    return [];
  }

  return Array.from(operationGraph.operations).filter(
    (operation) =>
      current.getOperationOwnStateHash(operation.associatedProject, operation.associatedPhase.name) !==
      next.getOperationOwnStateHash(operation.associatedProject, operation.associatedPhase.name)
  );
}

/**
 * Returns a function that checks that an inputs snapshot is compatible with the snapshot that an engine was
 * created from, as {@link assertCompatibleInputs} does. It checks a snapshot only if it differs from the last
 * compatible one.
 */
export function createInputsCompatibilityCheck(
  initialSnapshot: IInputsSnapshot
): (snapshot: IInputsSnapshot) => void {
  let compatibleSnapshot: IInputsSnapshot = initialSnapshot;
  return (snapshot: IInputsSnapshot): void => {
    if (snapshot !== compatibleSnapshot) {
      assertCompatibleInputs(initialSnapshot, snapshot);
      compatibleSnapshot = snapshot;
    }
  };
}

/**
 * Throws {@link WorkspaceEngineRecreationRequiredError} if a file that may define the operation graph has
 * different hashes in the two snapshots.
 */
export function assertCompatibleInputs(current: IInputsSnapshot, next: IInputsSnapshot): void {
  if (current.hashes === next.hashes) {
    return;
  }

  const paths: Set<string> = new Set([...current.hashes.keys(), ...next.hashes.keys()]);
  for (const filePath of paths) {
    if (isGraphDefinitionPath(filePath) && current.hashes.get(filePath) !== next.hashes.get(filePath)) {
      throw new WorkspaceEngineRecreationRequiredError();
    }
  }
}

function isGraphDefinitionPath(filePath: string): boolean {
  const normalized: string = filePath.replace(/\\/g, '/');
  return (
    /(^|\/)config\//.test(normalized) ||
    ['rush.json', 'package.json', '.gitignore', '.npmrc', '.env', 'pnpm-lock.yaml'].includes(
      path.basename(filePath)
    )
  );
}
