// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Operation } from './Operation';

/**
 * Performs a depth-first search to topologically sort the operations, subject to override via sortFn
 */
export function computeTopology(operations: Iterable<Operation>): Operation[] {
  // Clone the set of operations as an array, so that we can sort it.
  const queue: Operation[] = Array.from(operations);

  // Create a collection for detecting visited nodes
  const cycleDetectorStack: Set<Operation> = new Set();
  for (const operation of queue) {
    calculateCriticalPathLength(operation, cycleDetectorStack);
  }

  return queue;
}

function calculateShortestPath(startOperation: Operation, endOperation: Operation): Operation[] {
  const visitedOperations: Set<Operation> = new Set([startOperation]);
  const parentOperations: Map<Operation, Operation> = new Map();
  const distanceMap: Map<Operation, number> = new Map([[startOperation, 0]]);

  // Run a breadth-first search to find the shortest path between the start and end operations
  const queue: Operation[] = [startOperation];
  for (const operation of queue) {
    for (const dependencyOperation of operation.dependencies) {
      if (visitedOperations.has(dependencyOperation)) {
        continue;
      }
      visitedOperations.add(dependencyOperation);
      const calculatedDistance: number = (distanceMap.get(operation) ?? Number.MAX_SAFE_INTEGER) + 1;
      distanceMap.set(dependencyOperation, calculatedDistance);
      parentOperations.set(dependencyOperation, operation);
      if (dependencyOperation === endOperation) {
        break;
      }
      queue.push(dependencyOperation);
    }
  }

  // Walk back up the path from the end operation to the start operation
  let currentOperation: Operation = endOperation;
  const path: Operation[] = [];
  while (currentOperation !== startOperation) {
    path.unshift(currentOperation);
    currentOperation = parentOperations.get(currentOperation)!;
  }
  path.unshift(startOperation);
  return path;
}

/**
 * Perform a depth-first search to find critical path length.
 * Cycle detection comes at minimal additional cost.
 */
function calculateCriticalPathLength(operation: Operation, dependencyChain: Set<Operation>): number {
  if (dependencyChain.has(operation)) {
    // Find where the first cycle occurs
    let firstDetectedCycle: Operation | undefined;
    for (const dependency of [...dependencyChain]) {
      if (dependency.dependencies.has(operation)) {
        firstDetectedCycle = dependency;
      }
    }

    // Ensure we have the shortest path to the cycle
    const shortestPath: Operation[] = calculateShortestPath(operation, firstDetectedCycle!);

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
  operation.criticalPathLength = criticalPathLength + operation.weight;

  // Directly writing operations to an output collection here would yield a topological sorted set
  // However, we want a bit more fine-tuning of the output than just the raw topology

  return criticalPathLength;
}
