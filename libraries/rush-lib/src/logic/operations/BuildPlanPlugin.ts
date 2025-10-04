// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';

import type {
  IOperationExecutionManager,
  IOperationExecutionManagerContext,
  IOperationExecutionIterationOptions,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { Operation } from './Operation';
import { clusterOperations, type IOperationBuildCacheContext } from './CacheableOperationPlugin';
import { DisjointSet } from '../cobuild/DisjointSet';
import type { IConfigurableOperation } from './IOperationExecutionResult';
import { RushProjectConfiguration } from '../../api/RushProjectConfiguration';

const PLUGIN_NAME: 'BuildPlanPlugin' = 'BuildPlanPlugin';

interface IBuildPlanOperationCacheContext {
  cacheDisabledReason: IOperationBuildCacheContext['cacheDisabledReason'];
}

interface ICobuildPlan {
  summary: {
    maxWidth: number;
    maxDepth: number;
    numberOfNodesPerDepth: number[];
  };
  operations: Operation[];
  clusters: Set<Operation>[];
  buildCacheByOperation: Map<Operation, IBuildPlanOperationCacheContext>;
  clusterByOperation: Map<Operation, Set<Operation>>;
}

export class BuildPlanPlugin implements IPhasedCommandPlugin {
  private readonly _terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    this._terminal = terminal;
  }

  public apply(hooks: PhasedCommandHooks): void {
    const terminal: ITerminal = this._terminal;

    hooks.executionManagerAsync.tap(
      PLUGIN_NAME,
      (manager: IOperationExecutionManager, context: IOperationExecutionManagerContext) => {
        manager.hooks.configureIteration.tap(PLUGIN_NAME, (currentStates, lastStates, iterationOptions) => {
          createBuildPlan(currentStates, iterationOptions, context);
        });
      }
    );

    function createBuildPlan(
      recordByOperation: ReadonlyMap<Operation, IConfigurableOperation>,
      iterationOptions: IOperationExecutionIterationOptions,
      context: IOperationExecutionManagerContext
    ): void {
      const { inputsSnapshot } = iterationOptions;
      const { projectConfigurations } = context;
      const disjointSet: DisjointSet<Operation> = new DisjointSet<Operation>();
      const operations: Operation[] = [...recordByOperation.keys()];
      for (const operation of operations) {
        disjointSet.add(operation);
      }
      const buildCacheByOperation: Map<Operation, IBuildPlanOperationCacheContext> = new Map<
        Operation,
        IBuildPlanOperationCacheContext
      >();

      for (const operation of operations) {
        const { associatedProject, associatedPhase } = operation;

        const projectConfiguration: RushProjectConfiguration | undefined =
          projectConfigurations.get(associatedProject);
        const fileHashes: ReadonlyMap<string, string> | undefined =
          inputsSnapshot?.getTrackedFileHashesForOperation(associatedProject, associatedPhase.name);
        if (!fileHashes) {
          continue;
        }
        const cacheDisabledReason: string | undefined =
          RushProjectConfiguration.getCacheDisabledReasonForProject({
            projectConfiguration,
            trackedFileNames: fileHashes.keys(),
            isNoOp: operation.isNoOp,
            phaseName: associatedPhase.name
          });
        buildCacheByOperation.set(operation, { cacheDisabledReason });
      }
      clusterOperations(disjointSet, buildCacheByOperation);
      const buildPlan: ICobuildPlan = createCobuildPlan(disjointSet, terminal, buildCacheByOperation);
      logCobuildBuildPlan(buildPlan, terminal);
    }
  }
}

/**
 * Output the build plan summary, this will include the depth of the build plan, the width of the build plan, and
 * the number of nodes at each depth.
 *
 * Example output:
```
Build Plan Depth (deepest dependency tree): 3
Build Plan Width (maximum parallelism): 7
Number of Nodes per Depth: 2, 7, 5
Plan @ Depth 0 has 2 nodes and 0 dependents:
- b (build)
- a (build)
Plan @ Depth 1 has 7 nodes and 2 dependents:
- c (build)
- d (build)
- f (pre-build)
- g (pre-build)
- e (build)
- f (build)
- g (build)
Plan @ Depth 2 has 5 nodes and 9 dependents:
- c (build)
- d (build)
- e (build)
- f (build)
- g (build)
```
 * The summary data can be useful for understanding the shape of the build plan. The depth of the build plan is the
 *  longest dependency chain in the build plan. The width of the build plan is the maximum number of operations that
 *  can be executed in parallel. The number of nodes per depth is the number of operations that can be executed in parallel
 *  at each depth. **This does not currently include clustering information, which further restricts which operations can
 *  be executed in parallel.**
 * The depth data can be useful for debugging situations where cobuilds aren't utilizing multiple agents as expected. There may be
 *  some long dependency trees that can't be executed in parallel. Or there may be some key operations at the base of the
 *  build graph that are blocking the rest of the build.
 */
function generateCobuildPlanSummary(operations: Operation[], terminal: ITerminal): ICobuildPlan['summary'] {
  const numberOfDependenciesByOperation: Map<Operation, number> = new Map<Operation, number>();

  const queue: Operation[] = operations.filter((e) => e.dependencies.size === 0);
  const seen: Set<Operation> = new Set<Operation>(queue);
  for (const operation of queue) {
    numberOfDependenciesByOperation.set(operation, 0);
  }

  /**
   * Traverse the build plan to determine the number of dependencies for each operation. This is done by starting
   *  at the base of the build plan and traversing the graph in a breadth-first manner. We use the parent operation
   *  to determine the number of dependencies for each child operation. This allows us to detect cases where no-op
   *  operations are strung together, and correctly mark the first real operation as being a root operation.
   */
  while (queue.length > 0) {
    const operation: Operation = queue.shift()!;
    const increment: number = operation.isNoOp ? 0 : 1;
    for (const consumer of operation.consumers) {
      const numberOfDependencies: number = (numberOfDependenciesByOperation.get(operation) ?? 0) + increment;
      numberOfDependenciesByOperation.set(consumer, numberOfDependencies);
      if (!seen.has(consumer)) {
        queue.push(consumer);
        seen.add(consumer);
      }
    }
  }

  const layerQueue: Operation[] = [];
  for (const operation of operations) {
    if (operation.isNoOp) {
      continue;
    }

    const numberOfDependencies: number = numberOfDependenciesByOperation.get(operation) ?? 0;
    if (numberOfDependencies === 0) {
      layerQueue.push(operation);
    }
  }

  let nextLayer: Set<Operation> = new Set<Operation>();
  const remainingOperations: Set<Operation> = new Set<Operation>(operations);
  let depth: number = 0;
  let maxWidth: number = layerQueue.length;
  const numberOfNodes: number[] = [maxWidth];
  const depthToOperationsMap: Map<number, Set<Operation>> = new Map<number, Set<Operation>>();
  depthToOperationsMap.set(depth, new Set(layerQueue));

  /**
   * Determine the depth and width of the build plan. We start with the inner layer and gradually traverse layer by
   *  layer up the tree/graph until we have no more nodes to process. At each layer, we determine the
   *  number of executable operations.
   */
  do {
    if (layerQueue.length === 0) {
      layerQueue.push(...nextLayer);
      const realOperations: Operation[] = layerQueue.filter((e) => !e.isNoOp);
      if (realOperations.length > 0) {
        depth += 1;
        depthToOperationsMap.set(depth, new Set(realOperations));
        numberOfNodes.push(realOperations.length);
      }
      const currentWidth: number = realOperations.length;
      if (currentWidth > maxWidth) {
        maxWidth = currentWidth;
      }
      nextLayer = new Set();

      if (layerQueue.length === 0) {
        break;
      }
    }
    const leaf: Operation = layerQueue.shift()!;
    if (remainingOperations.delete(leaf)) {
      for (const consumer of leaf.consumers) {
        nextLayer.add(consumer);
      }
    }
  } while (remainingOperations.size > 0);

  terminal.writeLine(`Build Plan Depth (deepest dependency tree): ${depth + 1}`);
  terminal.writeLine(`Build Plan Width (maximum parallelism): ${maxWidth}`);
  terminal.writeLine(`Number of Nodes per Depth: ${numberOfNodes.join(', ')}`);
  for (const [operationDepth, operationsAtDepth] of depthToOperationsMap) {
    let numberOfDependents: number = 0;
    for (let i: number = 0; i < operationDepth; i++) {
      numberOfDependents += numberOfNodes[i];
    }
    terminal.writeLine(
      `Plan @ Depth ${operationDepth} has ${numberOfNodes[operationDepth]} nodes and ${numberOfDependents} dependents:`
    );
    for (const operation of operationsAtDepth) {
      if (operation.isNoOp !== true) {
        terminal.writeLine(`- ${operation.name}`);
      }
    }
  }

  return {
    maxDepth: depth === 0 && numberOfNodes[0] !== 0 ? depth + 1 : 0,
    maxWidth: maxWidth,
    numberOfNodesPerDepth: numberOfNodes
  };
}

function getName(op: Operation): string {
  return op.name;
}

/**
 * Log the cobuild build plan by cluster. This is intended to help debug situations where cobuilds aren't
 *  utilizing multiple agents correctly.
 */
function createCobuildPlan(
  disjointSet: DisjointSet<Operation>,
  terminal: ITerminal,
  buildCacheByOperation: Map<Operation, IBuildPlanOperationCacheContext>
): ICobuildPlan {
  const clusters: Set<Operation>[] = [...disjointSet.getAllSets()];
  const operations: Operation[] = clusters.flatMap((e) => Array.from(e));

  const operationToClusterMap: Map<Operation, Set<Operation>> = new Map<Operation, Set<Operation>>();
  for (const cluster of clusters) {
    for (const operation of cluster) {
      operationToClusterMap.set(operation, cluster);
    }
  }

  return {
    summary: generateCobuildPlanSummary(operations, terminal),
    operations,
    buildCacheByOperation,
    clusterByOperation: operationToClusterMap,
    clusters
  };
}

/**
 * This method logs in depth details about the cobuild plan, including the operations in each cluster, the dependencies
 *  for each cluster, and the reason why each operation is clustered.
 */
function logCobuildBuildPlan(buildPlan: ICobuildPlan, terminal: ITerminal): void {
  const { operations, clusters, buildCacheByOperation, clusterByOperation } = buildPlan;

  const executionPlan: Operation[] = [];
  for (const operation of operations) {
    if (!operation.isNoOp) {
      executionPlan.push(operation);
    }
  }

  // This is a lazy way of getting the waterfall chart, basically check for the latest
  //  dependency and put this operation after that finishes.
  const spacingByDependencyMap: Map<Operation, number> = new Map<Operation, number>();
  for (let index: number = 0; index < executionPlan.length; index++) {
    const operation: Operation = executionPlan[index];

    const spacing: number = Math.max(
      ...Array.from(operation.dependencies, (e) => {
        const dependencySpacing: number | undefined = spacingByDependencyMap.get(e);
        return dependencySpacing !== undefined ? dependencySpacing + 1 : 0;
      }),
      0
    );
    spacingByDependencyMap.set(operation, spacing);
  }
  executionPlan.sort((a, b) => {
    const aSpacing: number = spacingByDependencyMap.get(a) ?? 0;
    const bSpacing: number = spacingByDependencyMap.get(b) ?? 0;
    return aSpacing - bSpacing;
  });

  terminal.writeLine('##################################################');
  // Get the maximum name length for left padding.
  let maxOperationNameLength: number = 1;
  for (const operation of executionPlan) {
    const name: string = getName(operation);
    maxOperationNameLength = Math.max(maxOperationNameLength, name.length);
  }
  for (const operation of executionPlan) {
    const spacing: number = spacingByDependencyMap.get(operation) ?? 0;
    terminal.writeLine(
      `${getName(operation).padStart(maxOperationNameLength + 1)}: ${'-'.repeat(spacing)}(${clusters.indexOf(
        clusterByOperation.get(operation)!
      )})`
    );
  }
  terminal.writeLine('##################################################');

  function getDependenciesForCluster(cluster: Set<Operation>): Set<Operation> {
    const dependencies: Set<Operation> = new Set<Operation>();
    for (const operation of cluster) {
      for (const dependent of operation.dependencies) {
        dependencies.add(dependent);
      }
    }
    return dependencies;
  }

  function dedupeShards(ops: Set<Operation>): string[] {
    const dedupedOperations: Set<string> = new Set<string>();
    for (const operation of ops) {
      dedupedOperations.add(`${operation.associatedProject.packageName} (${operation.associatedPhase.name})`);
    }
    return [...dedupedOperations];
  }

  for (let clusterIndex: number = 0; clusterIndex < clusters.length; clusterIndex++) {
    const cluster: Set<Operation> = clusters[clusterIndex];
    const allClusterDependencies: Set<Operation> = getDependenciesForCluster(cluster);
    const outOfClusterDependencies: Set<Operation> = new Set(
      [...allClusterDependencies].filter((e) => !cluster.has(e))
    );

    terminal.writeLine(`Cluster ${clusterIndex}:`);
    terminal.writeLine(`- Dependencies: ${dedupeShards(outOfClusterDependencies).join(', ') || 'none'}`);
    // Only log clustering info, if we did in fact cluster.
    if (cluster.size > 1) {
      terminal.writeLine(
        `- Clustered by: \n${[...allClusterDependencies]
          .filter((e) => buildCacheByOperation.get(e)?.cacheDisabledReason)
          .map((e) => `  - (${e.name}) "${buildCacheByOperation.get(e)?.cacheDisabledReason ?? ''}"`)
          .join('\n')}`
      );
    }
    terminal.writeLine(
      `- Operations: ${Array.from(cluster, (e) => `${getName(e)}${e.isNoOp ? ' [SKIPPED]' : ''}`).join(', ')}`
    );
    terminal.writeLine('--------------------------------------------------');
  }
  terminal.writeLine('##################################################');
}
