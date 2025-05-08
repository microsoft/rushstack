// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Operation, ILogger } from '@rushstack/rush-sdk';
import type { ShellOperationRunner } from '@rushstack/rush-sdk/lib/logic/operations/ShellOperationRunner';
import { Colorize } from '@rushstack/terminal';

/**
 * @example
 * ```
 * {
 *   "id": "@rushstack/node-core-library#_phase:build",
 *   "task": "_phase:build",
 *   "package": "@rushstack/node-core-library",
 *   "dependencies": [
 *     "@rushstack/eslint-patch#_phase:build",
 *     "@rushstack/eslint-plugin#_phase:build",
 *     "@rushstack/eslint-plugin-packlets#_phase:build",
 *     "@rushstack/eslint-plugin-security#_phase:build"
 *   ],
 *   "workingDirectory": "/repo/libraries/node-core-library",
 *   "command": "heft run --only build -- --clean --production --drop-graph ./src/examples/graph.json"
 * }
 * ```
 *
 * See https://github.com/microsoft/BuildXL/blob/adf025c1b96b8106984928df3e9c30c8331bc8d6/Public/Src/Tools/JavaScript/Tool.RushGraphBuilder/src/RushBuildPluginGraph.ts
 *
 * @public
 */
export interface IGraphNode {
  /**
   * The unique id of the Pip
   *
   * @example
   * `@rushstack/node-core-library#_phase:build`
   */
  id: string;

  /**
   * The command to run during the Pip
   */
  command: string;

  /**
   * The working directory of the Pip
   */
  workingDirectory: string;

  /**
   * The project name associated with the Pip
   *
   * @example
   * `@rushstack/node-core-library`
   */
  package: string;

  /**
   * The task name of the Pip
   *
   * @example
   * `_phase:build`
   */
  task: string;

  /**
   * The IDs of the dependencies of the Pip. These are the {@link IGraphNode.id} properties of other Pips.
   */
  dependencies: string[];

  /**
   * If false, the Pip is uncacheable
   */
  cacheable?: false;
}

interface IGraphNodeInternal extends Omit<IGraphNode, 'dependencies' | 'command'> {
  dependencies: ReadonlySet<string>;
  command: string | undefined;
}

type NodeMap = ReadonlyMap<string, IGraphNodeInternal>;

const REQUIRED_FIELDS: Array<keyof IGraphNodeInternal> = [
  // command is absent because it is not required
  'id',
  'task',
  'package',
  'dependencies',
  'workingDirectory'
];

/*
 * Get the operation id
 */
export function getOperationId(operation: Operation): string {
  const {
    associatedPhase: { name: task },
    associatedProject: { packageName }
  } = operation;
  return `${packageName}#${task}`;
}

export class GraphProcessor {
  private readonly _logger: ILogger;

  public constructor(logger: ILogger) {
    this._logger = logger;
  }

  /*
   * Convert the operationMap into an array of graph nodes with empty commands pruned
   */
  public processOperations(operations: Set<Operation>): IGraphNode[] {
    const nodeMap: Map<string, IGraphNodeInternal> = new Map();
    for (const operation of operations) {
      const entry: IGraphNodeInternal = this._operationAsHashedEntry(operation);
      nodeMap.set(entry.id, entry);
    }

    return this._pruneNoOps(nodeMap);
  }

  /*
   * Validate that all dependencies exist
   * Validate that all nodes have a non-empty command
   * Print a message to the logger, and return true if the graph is valid
   */
  public validateGraph(entries: readonly Readonly<IGraphNode>[]): boolean {
    const entryIDs: Set<string> = new Set(entries.map((entry) => entry.id));
    let isValid: boolean = true;
    for (const entry of entries) {
      for (const depId of entry.dependencies) {
        if (!entryIDs.has(depId)) {
          this._logger.emitError(new Error(`${entry.id} has a dependency on ${depId} which does not exist`));
          isValid = false;
        }
      }

      if (!entry.command) {
        this._logger.emitError(new Error(`There is an empty command in ${entry.id}`));
        isValid = false;
      }
    }

    if (isValid) {
      this._logger.terminal.writeLine(
        Colorize.green('All nodes have non-empty commands and dependencies which exist')
      );
    }

    const totalEdges: number = entries.reduce((acc, entry) => acc + entry.dependencies.length, 0);
    this._logger.terminal.writeLine(`Graph has ${entries.length} nodes, ${totalEdges} edges`);
    return isValid;
  }

  /*
   * remove all entries with empty commands
   * if an entry has a dependency with an empty command, it should inherit the dependencies of the empty command
   */
  private _pruneNoOps(inputNodeMap: NodeMap): IGraphNode[] {
    // Cache for the non-empty upstream dependencies of each operation
    const nonEmptyDependenciesByOperation: Map<IGraphNodeInternal, Set<string>> = new Map();
    function getNonEmptyDependencies(node: IGraphNodeInternal): ReadonlySet<string> {
      // If we've already computed this, return the cached result
      let nonEmptyDependencies: Set<string> | undefined = nonEmptyDependenciesByOperation.get(node);
      if (!nonEmptyDependencies) {
        nonEmptyDependencies = new Set();
        nonEmptyDependenciesByOperation.set(node, nonEmptyDependencies);
        for (const dependencyID of node.dependencies) {
          if (!inputNodeMap.get(dependencyID)!.command) {
            // If the dependency is empty, recursively inherit its non-empty dependencies
            for (const deepDependency of getNonEmptyDependencies(inputNodeMap.get(dependencyID)!)) {
              nonEmptyDependencies.add(deepDependency);
            }
          } else {
            nonEmptyDependencies.add(dependencyID);
          }
        }
      }

      return nonEmptyDependencies;
    }

    const result: IGraphNode[] = [];
    for (const node of inputNodeMap.values()) {
      const command: string | undefined = node.command;
      if (command) {
        const nonEmptyDependencySet: ReadonlySet<string> = getNonEmptyDependencies(node);
        result.push({
          ...node,
          dependencies: Array.from(nonEmptyDependencySet),
          command: command
        });
      }
    }

    return result;
  }

  /*
   * Convert an operation into a graph node
   */
  private _operationAsHashedEntry(operation: Operation): IGraphNodeInternal {
    const {
      runner,
      associatedPhase: { name: task },
      associatedProject: {
        // "package" is a reserved word
        packageName,
        projectFolder: workingDirectory
      },
      settings,
      dependencies: operationDependencies
    } = operation;

    const dependencies: Set<string> = new Set();
    for (const dependency of operationDependencies.values()) {
      const id: string = getOperationId(dependency);
      dependencies.add(id);
    }

    const node: Partial<IGraphNodeInternal> = {
      id: getOperationId(operation),
      task,
      package: packageName,
      dependencies,
      workingDirectory,
      command: (runner as Partial<Pick<ShellOperationRunner, 'commandToRun'>>)?.commandToRun
    };

    if (settings?.disableBuildCacheForOperation) {
      node.cacheable = false;
    }

    const missingFields: (keyof IGraphNodeInternal)[] = [];
    for (const requiredField of REQUIRED_FIELDS) {
      if (!node[requiredField]) {
        missingFields.push(requiredField);
      }
    }

    if (missingFields.length > 0) {
      this._logger.emitError(
        new Error(`Operation is missing required fields ${missingFields.join(', ')}: ${JSON.stringify(node)}`)
      );
    }

    // the runner is a no-op if and only if the command is empty
    if (!!runner?.isNoOp !== !node.command) {
      this._logger.emitError(
        new Error(`${node.id}: Operation runner isNoOp does not match commandToRun existence`)
      );
    }

    return node as IGraphNodeInternal;
  }
}
