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
import type { IDropGraphOptions } from './DropGraph';

const PLUGIN_NAME: 'RushDropBuildGraphPlugin' = 'RushDropBuildGraphPlugin';

/**
 * The graph JSON object
 * @beta
 */
export interface IRushGraph {
  nodes: IGraphNode[];
  repoSettings: {
    commonTempFolder: string;
  };
}

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

/**
 * This plugin is used to drop the build graph to a file for BuildXL to consume.
 * @beta
 */
export class DropBuildGraphPlugin implements IRushPlugin {
  private readonly _pluginName: string = PLUGIN_NAME;

  public apply(session: RushSession, configuration: RushConfiguration): void {
    const dropIndex: number = process.argv.indexOf('--drop-graph');
    const dropGraphPath: string | undefined = dropIndex > -1 ? process.argv[dropIndex + 1] : undefined;

    if (!dropGraphPath) {
      return;
    }

    session.hooks.runAnyPhasedCommand.tap(this._pluginName, (command: IPhasedCommand) => {
      command.hooks.createOperations.tapPromise(
        {
          name: this._pluginName,
          stage: Number.MAX_SAFE_INTEGER // Run this after other plugins have created all operations
        },
        async (operations: Set<Operation>, context: ICreateOperationsContext) => {
          const { _dropGraphAsync: _dropGraph } = await import('./DropGraph');
          const parameters: IDropGraphOptions = {
            operations,
            context,
            dropGraphPath,
            configuration,
            logger: session.getLogger(this._pluginName)
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
