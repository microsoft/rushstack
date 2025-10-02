// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import type { ICreateOperationsContext, ILogger, Operation, RushConfiguration } from '@rushstack/rush-sdk';
import { JsonFile } from '@rushstack/node-core-library';

import type { IBuildXLRushGraph } from './DropBuildGraphPlugin';
import { type IGraphNode, GraphProcessor } from './GraphProcessor';
import { filterObjectForDebug, filterObjectForTesting } from './debugGraphFiltering';

export interface IDropGraphOptions {
  operations: Set<Operation>;
  context: ICreateOperationsContext;
  dropGraphPath: string;
  rushConfiguration: RushConfiguration;
  logger: ILogger;
}

const DEBUG_RUSH_BUILD_GRAPH_ENV_VAR_NAME: 'DEBUG_RUSH_BUILD_GRAPH' = 'DEBUG_RUSH_BUILD_GRAPH';

export async function dropGraphAsync(options: IDropGraphOptions): Promise<boolean> {
  const {
    operations,
    context,
    dropGraphPath,
    rushConfiguration: { commonTempFolder },
    logger
  } = options;
  if (process.env[DEBUG_RUSH_BUILD_GRAPH_ENV_VAR_NAME]) {
    let filterFn: ((obj: object, depth?: number) => object) | undefined;
    const debugValue: string | undefined = process.env[DEBUG_RUSH_BUILD_GRAPH_ENV_VAR_NAME];
    switch (process.env.DEBUG_RUSH_BUILD_GRAPH) {
      case 'test': {
        filterFn = filterObjectForTesting;
        break;
      }

      case 'full': {
        filterFn = filterObjectForDebug;
        break;
      }

      default: {
        throw new Error(`Invalid value for ${DEBUG_RUSH_BUILD_GRAPH_ENV_VAR_NAME}: ${debugValue}`);
      }
    }

    if (filterFn) {
      const graphOut: unknown[] = [];
      for (const operation of operations.keys()) {
        graphOut.push(filterFn(operation));
      }

      const debugOutput: unknown = {
        OperationMap: graphOut,
        ICreateOperationsContext: filterFn(context)
      };
      const debugPathOut: string = `${path.dirname(dropGraphPath)}/debug-${path.basename(dropGraphPath)}`;
      await JsonFile.saveAsync(debugOutput, debugPathOut, { ensureFolderExists: true });
    }
  }

  const graphProcessor: GraphProcessor = new GraphProcessor(logger);
  const nodes: IGraphNode[] = graphProcessor.processOperations(operations);
  const buildXLGraph: IBuildXLRushGraph = {
    nodes,
    repoSettings: {
      commonTempFolder
    }
  };

  await JsonFile.saveAsync(buildXLGraph, dropGraphPath, { ensureFolderExists: true });
  return graphProcessor.validateGraph(buildXLGraph.nodes);
}
