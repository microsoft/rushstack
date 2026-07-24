// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable @typescript-eslint/no-explicit-any */

export function applyExecutionStates(
  operations: Map<string, any>,
  executionStates: Map<string, any>,
  stateArray: any[]
): void {
  if (!stateArray) return;

  stateArray.forEach((stateEntry) => {
    executionStates.set(stateEntry.name, stateEntry);

    const op: any = operations.get(stateEntry.name);
    if (!op) return;

    op.isActive = stateEntry.isActive;
    op.status = stateEntry.status || op.status;
    op.runInThisIteration = stateEntry.runInThisIteration;
    op.logFileURLs = stateEntry.logFileURLs;
  });
}

export function setQueuedStates(queuedStates: Map<string, any>, stateArray: any[]): void {
  queuedStates.clear();
  if (!stateArray) return;

  stateArray.forEach((stateEntry) => {
    queuedStates.set(stateEntry.name, stateEntry);
  });
}

export function setOperationsFromPayload(operations: Map<string, any>, operationArray: any[]): void {
  operations.clear();
  operationArray.forEach((op) => operations.set(op.name, op));
}

export function patchOperationsFromPayload(operations: Map<string, any>, operationArray: any[]): void {
  operationArray.forEach((op) => operations.set(op.name, op));
}

export function toLastExecutionResultsMap(lastExecutionResultsArray: any[] | undefined): Map<string, any> {
  const result: Map<string, any> = new Map();
  if (!lastExecutionResultsArray) return result;

  lastExecutionResultsArray.forEach((entry) => {
    result.set(entry.name, entry);
  });

  return result;
}
