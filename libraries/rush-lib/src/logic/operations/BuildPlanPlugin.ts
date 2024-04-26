// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';
import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { Operation } from './Operation';
import type { IOperationBuildCacheContext } from './CacheableOperationPlugin';
import { DisjointSet } from '../cobuild/DisjointSet';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
import { RushConstants } from '../RushConstants';
import type { RushProjectConfiguration } from '../../api/RushProjectConfiguration';

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
  executionPlan: Operation[];
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
    hooks.beforeExecuteOperations.tapPromise(PLUGIN_NAME, createBuildPlan);

    async function createBuildPlan(
      recordByOperation: Map<Operation, IOperationExecutionResult>,
      context: ICreateOperationsContext
    ): Promise<void> {
      const { projectConfigurations, projectChangeAnalyzer } = context;
      const disjointSet: DisjointSet<Operation> = new DisjointSet<Operation>();
      const operations: IterableIterator<Operation> = recordByOperation.keys();
      for (const operation of operations) {
        disjointSet.add(operation);
      }
      const buildCacheByOperation: Map<Operation, IBuildPlanOperationCacheContext> = new Map<
        Operation,
        IBuildPlanOperationCacheContext
      >();
      for (const operation of operations) {
        const { associatedProject, associatedPhase } = operation;
        if (associatedProject && associatedPhase) {
          const projectConfiguration: RushProjectConfiguration | undefined =
            projectConfigurations.get(associatedProject);
          const fileHashes: Map<string, string> | undefined =
            await projectChangeAnalyzer._tryGetProjectDependenciesAsync(associatedProject, terminal);
          const cacheDisabledReason: string | undefined = projectConfiguration
            ? projectConfiguration.getCacheDisabledReason(operation, fileHashes!.keys(), associatedPhase.name)
            : `Project does not have a ${RushConstants.rushProjectConfigFilename} configuration file, ` +
              'or one provided by a rig, so it does not support caching.';
          buildCacheByOperation.set(operation, { cacheDisabledReason });
        }
      }
      const buildPlan = createCobuildPlan(disjointSet, terminal, buildCacheByOperation);
      logCobuildBuildPlan(buildPlan, terminal);
    }
  }
}

function generateCobuildPlanSummary(operations: Operation[], terminal: ITerminal): ICobuildPlan['summary'] {
  const leafQueue: Operation[] = operations.filter((e) => e.consumers.size === 0);
  let currentLeafNodes: Set<Operation> = new Set<Operation>();
  const remainingOperations: Set<Operation> = new Set<Operation>(operations);
  let depth: number = 0;
  let maxWidth: number = leafQueue.filter((e) => !e.runner?.isNoOp).length;
  const numberOfNodes: number[] = [maxWidth];
  const depthToOperationsMap: Map<number, Set<Operation>> = new Map<number, Set<Operation>>();
  depthToOperationsMap.set(depth, new Set(leafQueue));
  do {
    if (leafQueue.length === 0) {
      leafQueue.push(...currentLeafNodes);
      const realOperations: Operation[] = [...currentLeafNodes].filter((e) => !e.runner?.isNoOp);
      if (realOperations.length > 0) {
        depth += 1;
        depthToOperationsMap.set(depth, new Set(realOperations));
        numberOfNodes.push(realOperations.length);
      }
      const currentWidth: number = realOperations.length;
      if (currentWidth > maxWidth) {
        maxWidth = currentWidth;
      }
      currentLeafNodes = new Set();
    }
    if (leafQueue.length === 0) {
      break;
    }
    const leaf: Operation = leafQueue.shift()!;
    if (remainingOperations.has(leaf)) {
      remainingOperations.delete(leaf);
      for (const dependent of leaf.dependencies) {
        if (![...dependent.consumers].some((e) => remainingOperations.has(e))) {
          currentLeafNodes.add(dependent);
        }
      }
    }
  } while (remainingOperations.size > 0);

  terminal.writeLine(`Build Plan Depth (deepest dependency tree): ${depth + 1}`);
  terminal.writeLine(`Build Plan Width (maximum parallelism): ${maxWidth}`);
  terminal.writeLine(`Number of Nodes per Depth: ${[...numberOfNodes].reverse().join(', ')}`);
  for (const [operationDepth, operationsAtDepth] of depthToOperationsMap) {
    let numberOfDependents: number = 0;
    for (let i: number = 0; i < operationDepth; i++) {
      numberOfDependents += numberOfNodes[i];
    }
    terminal.writeLine(
      `Plan @ Depth ${depth - operationDepth} has ${
        numberOfNodes[operationDepth]
      } nodes and ${numberOfDependents} dependents:`
    );
    for (const operation of operationsAtDepth) {
      if (!operation.runner?.isNoOp) {
        terminal.writeLine(`- ${operation.runner?.name ?? 'unknown'}`);
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
  return op.runner?.name ?? 'unknown';
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
  // This function should log the tree execution plan, which is a tree of operations that are executed in parallel.
  // It should then log the clusters and their dependencies as well as reasons that those clusters were created.
  // TODO: It should also output the number of operations that have the same depth in the tree.
  const executionPlan: Operation[] = [];
  const clusters: Set<Operation>[] = [...disjointSet.getAllSets()];
  const operations: Operation[] = clusters.flatMap((e) => Array.from(e));
  const rootOperations: Operation[] = operations.filter((e) => e.dependencies.size === 0);

  const operationToClusterMap: Map<Operation, Set<Operation>> = new Map<Operation, Set<Operation>>();
  for (const cluster of clusters) {
    for (const operation of cluster) {
      operationToClusterMap.set(operation, cluster);
    }
  }

  const queue: Operation[] = [...rootOperations];
  const seen: Set<Operation> = new Set<Operation>();
  while (queue.length > 0) {
    const element: Operation = queue.shift()!;
    if (!seen.has(element) && !element.runner?.isNoOp) {
      executionPlan.push(element);
      seen.add(element);
    }
    const consumers: Operation[] = [...element.consumers].filter((e) => !seen.has(e));
    consumers.forEach((consumer) => queue.push(consumer));
  }

  return {
    summary: generateCobuildPlanSummary(executionPlan, terminal),
    executionPlan,
    buildCacheByOperation,
    clusterByOperation: operationToClusterMap,
    clusters
  };
}

function logCobuildBuildPlan(buildPlan: ICobuildPlan, terminal: ITerminal): void {
  const { executionPlan, clusters, buildCacheByOperation, clusterByOperation } = buildPlan;

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
      dedupedOperations.add(
        `${operation.associatedProject?.packageName ?? ''} (${operation.associatedPhase?.name})`
      );
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
    terminal.writeLine(
      `- Clustered by: \n${
        [...allClusterDependencies]
          .filter((e) => buildCacheByOperation.get(e)?.cacheDisabledReason)
          .map((e) => `  - (${e.runner?.name}) "${buildCacheByOperation.get(e)?.cacheDisabledReason ?? ''}"`)
          .join('\n') || '  - none'
      }`
    );
    terminal.writeLine(
      `- Operations: ${Array.from(
        cluster,
        (e) => `${getName(e)}${e.runner?.isNoOp ? ' [SKIPPED]' : ''}`
      ).join(', ')}`
    );
    terminal.writeLine('--------------------------------------------------');
  }
  terminal.writeLine('##################################################');
}
