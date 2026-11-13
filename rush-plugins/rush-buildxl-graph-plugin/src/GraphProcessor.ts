// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Operation, ILogger } from '@rushstack/rush-sdk';
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

  /**
   * Explicit non-secret environment values to apply to this operation.
   * Ambient environment variables and credentials are not exported.
   */
  environmentVariables?: Record<string, string>;

  /**
   * Declared output folders, relative to workingDirectory. Cache entries must not capture other operations' outputs.
   */
  outputFolderNames?: string[];

  /**
   * If true, stderr alone must not fail the operation. Nonzero exit codes still fail.
   */
  warningsAreAllowed?: true;
}

interface IGraphNodeInternal extends Omit<IGraphNode, 'dependencies' | 'command'> {
  dependencies: ReadonlySet<string>;
  command: string | undefined;
}

type NodeMap = ReadonlyMap<string, IGraphNodeInternal>;

interface IGraphOperation {
  associatedPhase: Pick<Operation['associatedPhase'], 'name' | 'logFilenameIdentifier'>;
  associatedProject: Pick<Operation['associatedProject'], 'packageName' | 'projectFolder'>;
  logFilenameIdentifier: string;
  dependencies: Iterable<IGraphOperation>;
  runner:
    | Pick<
        NonNullable<Operation['runner']>,
        'isNoOp' | 'getCommandForExecution' | 'cacheable' | 'warningsAreAllowed'
      >
    | undefined;
  settings?: Pick<NonNullable<Operation['settings']>, 'disableBuildCacheForOperation' | 'outputFolderNames'>;
}

interface IGraphExecutionRecord {
  readonly enabled: boolean;
  readonly environmentOverrides?: Readonly<Record<string, string>>;
}

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
export function getOperationId(operation: IGraphOperation): string {
  const {
    associatedPhase: { name: task, logFilenameIdentifier: phaseLogFilenameIdentifier },
    associatedProject: { packageName },
    logFilenameIdentifier
  } = operation;
  // Native shard operations share a phase but have distinct filesystem-safe operation identifiers.
  const suffix: string =
    logFilenameIdentifier && logFilenameIdentifier !== phaseLogFilenameIdentifier
      ? `#${logFilenameIdentifier}`
      : '';
  return `${packageName}#${task}${suffix}`;
}

export class GraphProcessor {
  readonly #logger: ILogger;

  public constructor(logger: ILogger) {
    this.#logger = logger;
  }

  /*
   * Convert the operationMap into an array of graph nodes with empty commands pruned
   */
  public processOperations(
    operations: ReadonlySet<IGraphOperation>,
    executionRecords?: ReadonlyMap<IGraphOperation, IGraphExecutionRecord>
  ): IGraphNode[] {
    const nodeMap: Map<string, IGraphNodeInternal> = new Map();
    for (const operation of operations) {
      const record: IGraphExecutionRecord | undefined = executionRecords?.get(operation);
      if (executionRecords && !record) {
        throw new Error(`Missing execution plan for ${getOperationId(operation)}`);
      }
      const entry: IGraphNodeInternal = this.#operationAsHashedEntry(operation, record);
      if (nodeMap.has(entry.id)) {
        throw new Error(`Duplicate operation ID: ${entry.id}`);
      }
      nodeMap.set(entry.id, entry);
    }

    for (const node of nodeMap.values()) {
      for (const dependency of node.dependencies) {
        if (!nodeMap.has(dependency)) {
          throw new Error(`${node.id} has a dependency on ${dependency} which does not exist`);
        }
      }
    }
    if (this.#hasDependencyCycle(nodeMap)) {
      throw new Error('Graph contains a dependency cycle');
    }
    return this.#pruneNoOps(nodeMap);
  }

  /*
   * Validate that all dependencies exist
   * Validate that all nodes have a non-empty command
   * Print a message to the logger, and return true if the graph is valid
   */
  public validateGraph(entries: readonly Readonly<IGraphNode>[]): boolean {
    const entryIDs: Set<string> = new Set(entries.map((entry) => entry.id));
    const nodeMap: Map<string, Readonly<IGraphNode>> = new Map();
    let isValid: boolean = true;
    for (const entry of entries) {
      if (nodeMap.has(entry.id)) {
        this.#logger.emitError(new Error(`Duplicate operation ID: ${entry.id}`));
        isValid = false;
      }
      nodeMap.set(entry.id, entry);
      for (const depId of entry.dependencies) {
        if (!entryIDs.has(depId)) {
          this.#logger.emitError(new Error(`${entry.id} has a dependency on ${depId} which does not exist`));
          isValid = false;
        }
      }

      if (!entry.command) {
        this.#logger.emitError(new Error(`There is an empty command in ${entry.id}`));
        isValid = false;
      }
    }

    if (this.#hasDependencyCycle(nodeMap)) {
      this.#logger.emitError(new Error('Graph contains a dependency cycle'));
      isValid = false;
    }

    if (isValid) {
      this.#logger.terminal.writeLine(
        Colorize.green('All nodes have non-empty commands and dependencies which exist')
      );
    }

    const totalEdges: number = entries.reduce((acc, entry) => acc + entry.dependencies.length, 0);
    this.#logger.terminal.writeLine(`Graph has ${entries.length} nodes, ${totalEdges} edges`);
    return isValid;
  }

  #hasDependencyCycle(nodes: ReadonlyMap<string, { dependencies: Iterable<string> }>): boolean {
    const dependencyCounts: Map<string, number> = new Map();
    const consumers: Map<string, string[]> = new Map();
    for (const [id, node] of nodes) {
      let count: number = 0;
      for (const dependency of node.dependencies) {
        if (nodes.has(dependency)) {
          count++;
          let dependents: string[] | undefined = consumers.get(dependency);
          if (!dependents) {
            dependents = [];
            consumers.set(dependency, dependents);
          }
          dependents.push(id);
        }
      }
      dependencyCounts.set(id, count);
    }
    const ready: string[] = [];
    for (const [id, count] of dependencyCounts) {
      if (count === 0) {
        ready.push(id);
      }
    }
    let visited: number = 0;
    while (ready.length > 0) {
      const id: string = ready.pop()!;
      visited++;
      for (const consumer of consumers.get(id) ?? []) {
        const remaining: number = dependencyCounts.get(consumer)! - 1;
        dependencyCounts.set(consumer, remaining);
        if (remaining === 0) {
          ready.push(consumer);
        }
      }
    }
    return visited !== nodes.size;
  }

  /*
   * remove all entries with empty commands
   * if an entry has a dependency with an empty command, it should inherit the dependencies of the empty command
   */
  #pruneNoOps(inputNodeMap: NodeMap): IGraphNode[] {
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
  #operationAsHashedEntry(operation: IGraphOperation, record?: IGraphExecutionRecord): IGraphNodeInternal {
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
    for (const dependency of operationDependencies) {
      const id: string = getOperationId(dependency);
      dependencies.add(id);
    }

    const enabled: boolean = record?.enabled !== false;
    if (enabled && (!runner || (!runner.isNoOp && !runner.getCommandForExecution))) {
      throw new Error(`${getOperationId(operation)}: Operation runner does not support command export`);
    }
    const command: string | undefined = enabled ? runner?.getCommandForExecution?.() : undefined;
    const node: IGraphNodeInternal = {
      id: getOperationId(operation),
      task,
      package: packageName,
      dependencies,
      workingDirectory,
      command
    };

    if (record?.environmentOverrides && Object.keys(record.environmentOverrides).length > 0) {
      node.environmentVariables = { ...record.environmentOverrides };
    }
    if (settings?.outputFolderNames) {
      node.outputFolderNames = [...settings.outputFolderNames];
    }
    if (runner?.warningsAreAllowed) {
      node.warningsAreAllowed = true;
    }
    if (runner?.cacheable === false || settings?.disableBuildCacheForOperation) {
      node.cacheable = false;
    }

    const missingFields: (keyof IGraphNodeInternal)[] = [];
    for (const requiredField of REQUIRED_FIELDS) {
      if (!node[requiredField]) {
        missingFields.push(requiredField);
      }
    }

    if (missingFields.length > 0) {
      throw new Error(
        `Operation is missing required fields ${missingFields.join(', ')}: ${JSON.stringify(node)}`
      );
    }

    // the runner is a no-op if and only if the command is empty
    if (enabled && !!runner?.isNoOp !== !command) {
      throw new Error(`${node.id}: Operation runner isNoOp does not match commandToRun existence`);
    }

    return node;
  }
}
