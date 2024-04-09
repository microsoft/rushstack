// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ICreateOperationsContext, ILogger, Operation, RushConfiguration } from '@rushstack/rush-sdk';
import type { IBuildXLRushGraph } from './DropBuildGraphPlugin';
import { type IGraphNode, GraphParser } from './GraphParser';
import { FileSystem } from '@rushstack/node-core-library';
import { filterObjectForDebug, filterObjectForTesting } from './GraphDebugHelpers';
import { join, dirname, basename } from 'path';

export interface IDropGraphParameters {
  operations: Set<Operation>;
  context: ICreateOperationsContext;
  dropGraphPath: string;
  configuration: RushConfiguration;
  logger: ILogger;
}

export async function _dropGraph(parameters: IDropGraphParameters): Promise<boolean> {
  const { operations, context, dropGraphPath, configuration, logger } = parameters;

  const graphParser: GraphParser = new GraphParser(logger);
  const graph: IGraphNode[] = graphParser.processOperations(operations);
  /* eslint-disable @typescript-eslint/no-explicit-any */

  if (process.env.DEBUG_RUSH_BUILD_GRAPH) {
    let filterFn: ((obj: any, depth?: number) => any) | undefined;
    switch (process.env.DEBUG_RUSH_BUILD_GRAPH) {
      case 'test':
        filterFn = filterObjectForTesting;
        break;
      case 'full':
        filterFn = filterObjectForDebug;
        break;
      default:
        logger.terminal.writeWarningLine("ignoring DEBUG_RUSH_BUILD_GRAPH, not set to 'test' or 'full'");
    }
    if (filterFn) {
      const graphOut: any = [];
      for (const operation of operations.keys()) {
        graphOut.push(filterFn(operation));
      }
      const debugOutput: any = {
        OperationMap: graphOut,
        ICreateOperationsContext: filterFn(context)
      };
      const debugPathOut: string = `${dirname(dropGraphPath){/debug-${basename(dropGraphPath)}`;

      await JsonFile.saveAsync(debugOutput, debugPathOut, { ensureFolderExists: true });
    }
  }

  const buildXLGraph: IBuildXLRushGraph = {
    nodes: graph,
    repoSettings: {
      commonTempFolder: configuration.commonTempFolder
    }
  };

  await JsonFile.saveAsync(buildXLGraph, dropGraphPath, { ensureFolderExists: true });
  return graphParser.validateGraph(buildXLGraph.nodes);
}
