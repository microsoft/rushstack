// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Builds and runs a small rush-lib operation graph with the dual-emit sink
// attached, capturing both the legacy terminal output and the wire frames.

import { OperationGraph } from '@microsoft/rush-lib/lib/logic/operations/OperationGraph';
import type { IOperationGraphOptions } from '@microsoft/rush-lib/lib/logic/operations/OperationGraph';
import { OperationStatus } from '@microsoft/rush-lib/lib/logic/operations/OperationStatus';

import { createScenarioOperation } from './EngineRunners';
import { TestWritable } from './TestWritable';
import { WireAdapter } from './WireAdapter';

const PARALLELISM: number = 1;

/** Options for {@link runEngineScenarioAsync}. */
export interface IEngineScenarioOptions {
  /** Run the engine in quiet mode (stdout discarded from the collated terminal). */
  readonly quiet: boolean;
  /** Make the `beta` operation fail. */
  readonly failing?: boolean;
}

/** The captured result of one engine run. */
export interface IEngineScenarioResult {
  /** The legacy terminal output (golden reference). */
  readonly writable: TestWritable;
  /** The wire frames produced by the dual-emit sink. */
  readonly adapter: WireAdapter;
}

/** Runs the fixture graph to completion with the wire adapter attached. */
export async function runEngineScenarioAsync(
  options: IEngineScenarioOptions
): Promise<IEngineScenarioResult> {
  const writable: TestWritable = new TestWritable();
  const adapter: WireAdapter = new WireAdapter();
  const graphOptions: IOperationGraphOptions = {
    quietMode: options.quiet,
    debugMode: false,
    parallelism: PARALLELISM,
    allowOversubscription: true,
    destinations: [writable],
    abortController: new AbortController()
  };
  const graph: OperationGraph = new OperationGraph(
    new Set([
      createScenarioOperation('alpha', OperationStatus.Success),
      createScenarioOperation(
        'beta',
        options.failing ? OperationStatus.Failure : OperationStatus.Success
      )
    ]),
    graphOptions
  );
  graph.eventSink = adapter;
  await graph.executeAsync({});
  return { writable, adapter };
}
