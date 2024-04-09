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
import type { IDropGraphParameters } from './DropGraph';

const PLUGIN_NAME: 'DropBuildGraphPlugin' = 'DropBuildGraphPlugin';

/**
 * The graph JSON object
 * @beta
 */
export interface IBuildXLRushGraph {
  nodes: IGraphNode[];
  repoSettings: {
    commonTempFolder: string;
  };
}
export type { IGraphNode };

/**
 * This plugin is used to drop the build graph to a file for BuildXL to consume.
 * @beta
 */
export class DropBuildGraphPlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(session: RushSession, configuration: RushConfiguration): void {
    const dropIndex: number = process.argv.indexOf('--drop-graph');
    const dropGraphPath: string | undefined = dropIndex > -1 ? process.argv[dropIndex + 1] : undefined;

    if (!dropGraphPath) {
      return;
    }

    session.hooks.runAnyPhasedCommand.tap(this.pluginName, (command: IPhasedCommand) => {
      command.hooks.createOperations.tapPromise(
        {
          name: this.pluginName,
          stage: Number.MAX_SAFE_INTEGER // Run this after other plugins have created all operations
        },
        async (operations: Set<Operation>, context: ICreateOperationsContext) => {
          const { _dropGraph } = await import('./DropGraph');
          const parameters: IDropGraphParameters = {
            operations,
            context,
            dropGraphPath,
            configuration,
            logger: session.getLogger(PLUGIN_NAME)
          };
          const isValid: boolean = await _dropGraph(parameters);
          if (isValid) {
            process.exit(0);
          } else {
            process.exit(1);
          }
        }
      );
    });
  }
}
