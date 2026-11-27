// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  RushConstants,
  type ICreateOperationsContext,
  type IOperationGraph,
  type IOperationGraphContext,
  type IOperationExecutionResult,
  type Operation,
  type IPhasedCommand,
  type IRushPlugin,
  type RushConfiguration,
  type RushSession
} from '@rushstack/rush-sdk';
import { CommandLineParameterKind, type CommandLineStringParameter } from '@rushstack/ts-command-line';

import type { IGraphNode } from './GraphProcessor';

const PLUGIN_NAME: 'DropBuildGraphPlugin' = 'DropBuildGraphPlugin';

/**
 * This is the type that represents the schema of the drop file
 * @public
 */
export interface IBuildXLRushGraph {
  nodes: IGraphNode[];
  repoSettings: {
    commonTempFolder: string;
    /**
     * Version of the command, environment, output and cache metadata contract.
     * Consumers must honor these fields when executing exported operations.
     */
    executionContractVersion?: 1;
  };
}

/**
 * @public
 */
export interface IDropGraphPluginOptions {
  /**
   * The names of the commands that will be used to run BuildXL
   */
  buildXLCommandNames: string[];
  /**
   * Opts into executable graph planning and version 1 metadata.
   * Omit to preserve the legacy exporter and command lifecycle.
   * Version 1 requires consumer support and native execution (`--no-daemon`).
   */
  executionContractVersion?: 1;
}

const DROP_GRAPH_PARAMETER_LONG_NAME: '--drop-graph' = '--drop-graph';

/**
 * This plugin is used to drop the build graph to a file for BuildXL to consume.
 * @public
 */
export class DropBuildGraphPlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;
  readonly #buildXLCommandNames: string[];
  readonly #executionContractVersion: 1 | undefined;

  public constructor(options: IDropGraphPluginOptions) {
    if (options.executionContractVersion !== undefined && options.executionContractVersion !== 1) {
      throw new Error(`${PLUGIN_NAME}: Unsupported executionContractVersion. Expected 1 or omission.`);
    }
    this.#buildXLCommandNames = options.buildXLCommandNames;
    this.#executionContractVersion = options.executionContractVersion;
  }

  public apply(session: RushSession, rushConfiguration: RushConfiguration): void {
    function getDropGraphPath(commandName: string, context: ICreateOperationsContext): string | undefined {
      // TODO: Introduce an API to allow plugins to register command line options for arbitrary, existing commands
      // in a repo
      const dropGraphParameter: CommandLineStringParameter | undefined = context.customParameters.get(
        DROP_GRAPH_PARAMETER_LONG_NAME
      ) as CommandLineStringParameter;
      if (!dropGraphParameter) {
        // TODO: Introduce an API to allow plugins to register command line options for arbitrary, existing commands
        // in a repo
        throw new Error(
          `The ${DROP_GRAPH_PARAMETER_LONG_NAME} parameter needs to be defined in "${RushConstants.commandLineFilename}" ` +
            `and associated with the action "${commandName}"`
        );
      } else if (dropGraphParameter.kind !== CommandLineParameterKind.String) {
        throw new Error(`The ${DROP_GRAPH_PARAMETER_LONG_NAME} parameter must be a string parameter`);
      }

      return dropGraphParameter.value;
    }

    async function handleCreateOperationsAsync(
      commandName: string,
      operations: Set<Operation>,
      context: ICreateOperationsContext
    ): Promise<Set<Operation>> {
      const dropGraphPath: string | undefined = getDropGraphPath(commandName, context);
      if (!dropGraphPath) {
        return operations;
      }
      const { dropGraphAsync } = await import('./dropGraph');
      if (
        !(await dropGraphAsync({
          operations,
          context,
          dropGraphPath,
          rushConfiguration,
          logger: session.getLogger(PLUGIN_NAME)
        }))
      ) {
        throw new Error('Failed to validate the graph');
      }
      return new Set();
    }

    async function handleExternalGraphAsync(
      commandName: string,
      graph: IOperationGraph,
      context: IOperationGraphContext
    ): Promise<true | undefined> {
      const dropGraphPath: string | undefined = getDropGraphPath(commandName, context);
      if (dropGraphPath) {
        if (context.isWatch) {
          throw new Error('Graph export does not support watch mode.');
        }
        if (typeof graph.createExecutionPlanAsync !== 'function') {
          throw new Error(
            `${PLUGIN_NAME} requires an operation graph with external execution planning support.`
          );
        }
        const executionRecords: ReadonlyMap<Operation, IOperationExecutionResult> =
          await graph.createExecutionPlanAsync({});
        const { dropGraphAsync } = await import('./dropGraph');
        const isValid: boolean = await dropGraphAsync({
          operations: new Set(graph.operations),
          executionContractVersion: 1,
          executionRecords,
          context,
          dropGraphPath,
          rushConfiguration,
          logger: session.getLogger(PLUGIN_NAME)
        });

        if (!isValid) {
          throw new Error('Failed to validate the graph');
        } else {
          return true;
        }
      } else {
        return undefined;
      }
    }

    for (const buildXLCommandName of this.#buildXLCommandNames) {
      session.hooks.runPhasedCommand.for(buildXLCommandName).tap(PLUGIN_NAME, (command: IPhasedCommand) => {
        if (this.#executionContractVersion === undefined) {
          command.hooks.createOperationsAsync.tapPromise(
            { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
            async (operations: Set<Operation>, context: ICreateOperationsContext) =>
              await handleCreateOperationsAsync(command.actionName, operations, context)
          );
          return;
        }
        if (!command.hooks.onGraphCreatedAsync) {
          throw new Error(`${PLUGIN_NAME} requires Rush with external execution planning support.`);
        }
        command.hooks.onGraphCreatedAsync.tap(
          PLUGIN_NAME,
          (graph: IOperationGraph, context: IOperationGraphContext) => {
            if (!graph.hooks.beforeExecuteGraphAsync) {
              throw new Error(`${PLUGIN_NAME} requires Rush with external execution planning support.`);
            }
            graph.hooks.beforeExecuteGraphAsync.tapPromise(
              { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
              async () => await handleExternalGraphAsync(command.actionName, graph, context)
            );
          }
        );
      });
    }
  }
}
