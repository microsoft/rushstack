// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  RushConstants,
  type ICreateOperationsContext,
  type IPhasedCommand,
  type IRushPlugin,
  type Operation,
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
  private readonly _buildXLCommandNames: string[];

  public constructor(options: IDropGraphPluginOptions) {
    this._buildXLCommandNames = options.buildXLCommandNames;
  }

  public apply(session: RushSession, rushConfiguration: RushConfiguration): void {
    async function handleCreateOperationsForCommandAsync(
      commandName: string,
      operations: Set<Operation>,
      context: ICreateOperationsContext
    ): Promise<Set<Operation>> {
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
        const { dropGraphAsync } = await import('./dropGraph');
        const isValid: boolean = await dropGraphAsync({
          operations,
          context,
          dropGraphPath,
          rushConfiguration,
          logger: session.getLogger(PLUGIN_NAME)
        });

        if (!isValid) {
          throw new Error('Failed to validate the graph');
        } else {
          // If the --drop-graph flag is present, we want to exit the process after dropping the graph
          return new Set();
        }
      } else {
        return operations;
      }
    }

    for (const buildXLCommandName of this._buildXLCommandNames) {
      session.hooks.runPhasedCommand.for(buildXLCommandName).tap(PLUGIN_NAME, (command: IPhasedCommand) => {
        command.hooks.createOperationsAsync.tapPromise(
          {
            name: PLUGIN_NAME,
            stage: Number.MAX_SAFE_INTEGER // Run this after other plugins have created all operations
          },
          async (operations: Set<Operation>, context: ICreateOperationsContext) =>
            await handleCreateOperationsForCommandAsync(command.actionName, operations, context)
        );
      });
    }
  }
}
