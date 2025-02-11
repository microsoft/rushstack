// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  ICreateOperationsContext,
  IPhasedCommand,
  IRushPlugin,
  Operation,
  RushConfiguration,
  RushSession
} from '@rushstack/rush-sdk';
import type { IGraphNode } from './GraphParser';

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

const DROP_GRAPH_FLAG_NAME: '--drop-graph' = '--drop-graph';

/**
 * This plugin is used to drop the build graph to a file for BuildXL to consume.
 * @public
 */
export class DropBuildGraphPlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(session: RushSession, rushConfiguration: RushConfiguration): void {
    // TODO: Introduce an API to allow plugins to register command line options
    const dropIndex: number = process.argv.indexOf(DROP_GRAPH_FLAG_NAME);
    const dropGraphPath: string | undefined = dropIndex > -1 ? process.argv[dropIndex + 1] : undefined;

    if (dropGraphPath) {
      session.hooks.runAnyPhasedCommand.tap(PLUGIN_NAME, (command: IPhasedCommand) => {
        command.hooks.createOperations.tapPromise(
          {
            name: PLUGIN_NAME,
            stage: Number.MAX_SAFE_INTEGER // Run this after other plugins have created all operations
          },
          async (operations: Set<Operation>, context: ICreateOperationsContext) => {
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
          }
        );
      });
    }
  }
}
