// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Operation, IOperationRunner, ILogger } from '@rushstack/rush-sdk';

import { Colorize } from '@rushstack/terminal';
import { filterObjectForDebug } from './GraphDebugHelpers';

/**
 * This is the schema of a graph node
 * @beta
 */
export interface IGraphNode {
  id: string;
  command: string;
  workingDirectory: string;
  package: string;
  task: string;
  dependencies: string[];
}

type IGraphNodeInternal = Readonly<Omit<IGraphNode, 'dependencies' | 'command'>> & {
  dependencies: ReadonlySet<string>;
  command: string | undefined;
};
type INodeMapInternal = ReadonlyMap<string, IGraphNodeInternal>;

/* Example of a graph node
  {
    "id": "@1js/ui-meeting-transcript#build:storybook",
    "command": [heft run --only build -- --clean --production"
    ],
    "dependencies": [
        "@1js/ui-meeting-transcript#build"
    ],
    "workingDirectory": "packages/ui-meeting-transcript",
    "package": "@1js/ui-meeting-transcript",
    "task": "build:storybook"
  }
*/

/*
 * Try to get the operation id, return undefined if it fails
 */
export function tryGetOperationId(operation: Partial<Operation>): string | undefined {
  const task: string | undefined = operation.associatedPhase?.name;
  const project: string | undefined = operation.associatedProject?.packageName;
  return task && project ? `${project}#${task}` : undefined;
}

export class GraphParser {
  private _logger: ILogger;

  public constructor(logger: ILogger) {
    this._logger = logger;
  }

  /*
   * Convert the operationMap into an array of graph nodes with empty commands pruned
   */
  public processOperations(operations: Iterable<Operation>): IGraphNode[] {
    const result: INodeMapInternal = new Map();
    for (const operation of operations) {
      const entry: IGraphNodeInternal = this._operationAsHashedEntry(operation);
      result.set(entry.id, entry);
    }

    return this._pruneNoOps(result);
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
          this._logger.terminal.writeErrorLine(
            `${entry.id} has a dependency on ${depId} which does not exist`
          );
          isValid = false;
        }
      }

      if (!entry.id) {
        this._logger.terminal.writeErrorLine(`An entry id is missing or empty`);
        isValid = false;
      }

      if (!entry.command) {
        this._logger.terminal.writeErrorLine(`There is an empty command in ${entry.id} `);
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
   * Get the operation id, throw an error if it fails
   */
  public getOperationId(operation: Operation): string {
    const result: string | undefined = tryGetOperationId(operation);
    if (!result) {
      throw new Error(
        'Operation does not have a name: ' + JSON.stringify(filterObjectForDebug(operation, 2), undefined, 2)
      );
    }
    return result;
  }

  /*
   * remove all entries with empty commands
   * if an entry has a dependency with an empty command, it should inherit the dependencies of the empty command
   */
  private _pruneNoOps(inputNodeMap: INodeMapInternal): IGraphNode[] {
    // Cache for the non-empty upstream dependencies of each operation
    const nonEmptyDependenciesByOperation: Map<IGraphNodeInternal, Set<string>> = new Map();
    function getNonEmptyDependencies(node: IGraphNodeInternal): ReadonlySet<string> {
      // If we've already computed this, return the cached result
      let nonEmptyDependencies: Set<string> | undefined = nonEmptyDependenciesByOperation.get(node);
      if (!nonEmptyDependencies) {
        nonEmptyDependencies = new Set();
        nonEmptyDependenciesByOperation.set(node, nonEmptyDependencies);
        for (const dependencyID of node.dependencies) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          if (!inputNodeMap.get(dependencyID)!.command) {
            // If the dependency is empty, recursively inherit its non-empty dependencies
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
      if (node.command) {
        result.push({ ...node, dependencies: Array.from(getNonEmptyDependencies(node)), command: node.command });
      }
    }
    
    return result;
  }

  /*
   * Convert an operation into a graph node
   */
  private _operationAsHashedEntry(operation: Operation): IGraphNodeInternal {
    const dependencies: Set<string> = new Set();
    for (const dep of operation.dependencies.values()) {
      dependencies.add(this.getOperationId(dep));
    }

    const node: Partial<IGraphNodeInternal> = {
      id: tryGetOperationId(operation),
      task: operation.associatedPhase?.name,
      package: operation.associatedProject?.packageName,
      dependencies,
      workingDirectory: operation.associatedProject?.projectFolder,
      // _commandToRun does not exist in the type definition of IOperationRunner,
      //    but it's defined in subclasss ShellOperationRunner
      command: (operation.runner as IOperationRunner & { _commandToRun: string })?._commandToRun
    };

    // command is absent because it is not required
    const requiredFields: Array<keyof IGraphNodeInternal> = [
      'id',
      'task',
      'package',
      'dependencies',
      'workingDirectory'
    ];
    const missingFields: Array<keyof IGraphNodeInternal> = requiredFields.filter((prop) => !node[prop]);

    if (missingFields.length > 0) {
      this._logger.terminal.writeErrorLine(
        `Operation is missing required fields ${missingFields.join(', ')}: ${JSON.stringify(node)}`
      );
    }

    // the runner is a no-op if and only if the command is empty
    if (!!operation.runner?.isNoOp !== !node.command) {
      throw new Error(`${node.id}: Operation runner isNoOp does not match _commandToRun existence`);
    }

    return node as IGraphNodeInternal;
  }
}
