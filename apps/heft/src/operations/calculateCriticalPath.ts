// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface ISortableOperation<T extends ISortableOperation<T>> {
  name: string | undefined;
  criticalPathLength?: number | undefined;
  weight: number;
  consumers: Set<T>;
}

/**
 * For every operation in the input, computes the length of the longest chain of operations that depend on it.
 * This value is stored as `operation.criticalPathLength`.
 */
export function calculateCriticalPathLengths<T extends ISortableOperation<T>>(operations: Iterable<T>): T[] {
  // Clone the set of operations as an array, so that we can sort it.
  const queue: T[] = Array.from(operations);

  // Create a collection for detecting visited nodes
  const cycleDetectorStack: Set<T> = new Set();
  for (const operation of queue) {
    calculateCriticalPathLength(operation, cycleDetectorStack);
  }

  return queue;
}

/**
 * Calculates the shortest path from `startOperation` to `endOperation`.
 * Used when printing out circular dependencies.
 */
export function calculateShortestPath<T extends ISortableOperation<T>>(
  startOperation: T,
  endOperation: T
): T[] {
  // Map of each operation to the most optimal parent
  const parents: Map<T, T | undefined> = new Map([[endOperation, undefined]]);

  let found: boolean = false;

  // Run a breadth-first search to find the shortest path between the start and end operations
  for (const [operation] of parents) {
    for (const consumer of operation.consumers) {
      // Since this is a breadth-first traversal, the first encountered path to a given node
      // will be tied for shortest, so only the first encountered path needs to be tracked
      if (parents.has(consumer)) {
        continue;
      }

      parents.set(consumer, operation);
      if (consumer === startOperation) {
        found = true;
        break;
      }
    }
  }

  if (!found) {
    throw new Error(`Could not find a path from "${startOperation.name}" to "${endOperation.name}"`);
  }

  // Walk back up the path from the end operation to the start operation
  let currentOperation: T = startOperation;
  const path: T[] = [];
  while (currentOperation !== undefined) {
    path.push(currentOperation);
    currentOperation = parents.get(currentOperation)!;
  }
  return path;
}

/**
 * Perform a depth-first search to find critical path length to the provided operation.
 * Cycle detection comes at minimal additional cost.
 */
export function calculateCriticalPathLength<T extends ISortableOperation<T>>(
  operation: T,
  dependencyChain: Set<T>
): number {
  if (dependencyChain.has(operation)) {
    // Find where the first cycle occurs
    let firstDetectedCycle: T | undefined;
    for (const consumer of operation.consumers) {
      if (dependencyChain.has(consumer)) {
        firstDetectedCycle = consumer;
        break;
      }
    }

    // Ensure we have the shortest path to the cycle
    const shortestPath: T[] = calculateShortestPath(operation, firstDetectedCycle!);

    throw new Error(
      'A cyclic dependency was encountered:\n  ' +
        shortestPath.map((visitedTask) => visitedTask.name).join('\n  -> ')
    );
  }

  let { criticalPathLength } = operation;

  if (criticalPathLength !== undefined) {
    // This has been visited already
    return criticalPathLength;
  }

  criticalPathLength = 0;
  if (operation.consumers.size) {
    dependencyChain.add(operation);
    for (const consumer of operation.consumers) {
      criticalPathLength = Math.max(
        criticalPathLength,
        calculateCriticalPathLength(consumer, dependencyChain)
      );
    }
    dependencyChain.delete(operation);
  }
  // Include the contribution from the current operation
  operation.criticalPathLength = criticalPathLength + (operation.weight ?? 1);

  // Directly writing operations to an output collection here would yield a topological sorted set
  // However, we want a bit more fine-tuning of the output than just the raw topology

  return criticalPathLength;
}
