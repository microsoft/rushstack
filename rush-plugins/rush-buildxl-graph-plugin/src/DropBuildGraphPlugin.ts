// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  RushConstants,
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
}

const DROP_GRAPH_PARAMETER_LONG_NAME: '--drop-graph' = '--drop-graph';

/**
 * This plugin is used to drop the build graph to a file for BuildXL to consume.
 * @public
 */
export class DropBuildGraphPlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;
  readonly #buildXLCommandNames: string[];

  public constructor(options: IDropGraphPluginOptions) {
    this.#buildXLCommandNames = options.buildXLCommandNames;
  }

  public apply(session: RushSession, rushConfiguration: RushConfiguration): void {
    async function handleExternalGraphAsync(
      commandName: string,
      graph: IOperationGraph,
      context: IOperationGraphContext
    ): Promise<true | undefined> {
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

      const dropGraphPath: string | undefined = dropGraphParameter?.value;
      if (dropGraphPath) {
        if (context.isWatch) {
          throw new Error('Graph export does not support watch mode.');
        }
        const executionRecords: ReadonlyMap<Operation, IOperationExecutionResult> =
          await graph.createExecutionPlanAsync({
            inputsSnapshot: context.initialSnapshot
          });
        const { dropGraphAsync } = await import('./dropGraph');
        const isValid: boolean = await dropGraphAsync({
          operations: new Set(graph.operations),
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
        if (!command.hooks.beforeExecuteGraphAsync) {
          throw new Error(`${PLUGIN_NAME} requires Rush with external execution planning support.`);
        }
        command.hooks.beforeExecuteGraphAsync.tapPromise(
          {
            name: PLUGIN_NAME,
            stage: Number.MAX_SAFE_INTEGER
          },
          async (graph: IOperationGraph, context: IOperationGraphContext) =>
            await handleExternalGraphAsync(command.actionName, graph, context)
        );
      });
    }
  }
}
