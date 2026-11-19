// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

interface IOperationLogFileURLs {
  text?: string;
  error?: string;
  jsonl?: string;
}

interface IOperationData {
  name: string;
  isActive?: boolean;
  status?: string;
  runInThisIteration?: boolean;
  logFileURLs?: IOperationLogFileURLs;
}

interface IStateEntry {
  name: string;
  isActive?: boolean;
  status?: string;
  runInThisIteration?: boolean;
  logFileURLs?: IOperationLogFileURLs;
}

export function applyExecutionStates(
  operations: Map<string, IOperationData>,
  executionStates: Map<string, IStateEntry>,
  stateArray: IStateEntry[]
): void {
  if (!stateArray) return;

  stateArray.forEach((stateEntry) => {
    executionStates.set(stateEntry.name, stateEntry);

    const op: IOperationData | undefined = operations.get(stateEntry.name);
    if (!op) return;

    op.isActive = stateEntry.isActive;
    op.status = stateEntry.status || op.status;
    op.runInThisIteration = stateEntry.runInThisIteration;
    op.logFileURLs = stateEntry.logFileURLs;
  });
}

export function setQueuedStates(queuedStates: Map<string, IStateEntry>, stateArray: IStateEntry[]): void {
  queuedStates.clear();
  if (!stateArray) return;

  stateArray.forEach((stateEntry) => {
    queuedStates.set(stateEntry.name, stateEntry);
  });
}

export function setOperationsFromPayload(
  operations: Map<string, IOperationData>,
  operationArray: IOperationData[]
): void {
  operations.clear();
  operationArray.forEach((op) => operations.set(op.name, op));
}

export function patchOperationsFromPayload(
  operations: Map<string, IOperationData>,
  operationArray: IOperationData[]
): void {
  operationArray.forEach((op) => operations.set(op.name, op));
}

export function toLastExecutionResultsMap(
  lastExecutionResultsArray: IStateEntry[] | undefined
): Map<string, IStateEntry> {
  const result: Map<string, IStateEntry> = new Map();
  if (!lastExecutionResultsArray) return result;

  lastExecutionResultsArray.forEach((entry) => {
    result.set(entry.name, entry);
  });

  return result;
}
