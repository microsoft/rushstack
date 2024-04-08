// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// GraphParser.test.ts

import type { Operation, ILogger } from '@rushstack/rush-sdk';

import { GraphParser, type IGraphNode } from '../GraphParser';

// to update the examples folder, run the following command from rush-plugins/rush-build-graph-plugin/rushBuildGraphPluginTestRepo
// export DEBUG_RUSH_BUILD_GRAPH="test" && rush build --drop-graph ../src/examples/graph.json
import graph from '../examples/graph.json';
import debugGraph from '../examples/debug-graph.json';

const exampleGraph: readonly IGraphNode[] = Array.from(graph.nodes as IGraphNode[]).sort((a, b) =>
  a.id.localeCompare(b.id)
) as readonly IGraphNode[];

const graphParser: GraphParser = new GraphParser({
  terminal: { writeErrorLine: jest.fn(), writeLine: jest.fn() }
} as unknown as ILogger);

describe('GraphParser', () => {
  it('should process debug-graph.json into graph.json', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prunedGraph: IGraphNode[] = graphParser.processOperations(new Set(debugGraph.OperationMap as any));

    prunedGraph = prunedGraph.sort((a, b) => a.id.localeCompare(b.id));
    expect(prunedGraph).toEqual(exampleGraph);
  });

  it('should fail if the input schema is invalid', () => {
    const operations = new Set(JSON.parse(JSON.stringify(debugGraph.OperationMap)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (operations.values().next().value.dependencies as Array<any>).push({
      incorrectPhase: { name: 'incorrectPhase' },
      incorrectProject: { packageName: 'incorrectProject' }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => graphParser.processOperations(operations as any)).toThrow();
  });

  it('should fail if isNoOp mismatches a command', () => {
    const operations = new Set(JSON.parse(JSON.stringify(debugGraph.OperationMap)));
    const firstOperation: Operation = operations.values().next().value;
    // @ts-ignore, isNoOp is a readonly property
    firstOperation.runner!.isNoOp = true;
    // @ts-ignore, _commandToRun doesn't exist on IOperationRunner
    firstOperation.runner!._commandToRun = 'echo "hello world"';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => graphParser.processOperations(operations as any)).toThrow();
  });
});

describe('validateGraph', () => {
  it('should validate graph.json', () => {
    const isValid: boolean = graphParser.validateGraph(exampleGraph);
    expect(isValid).toBe(true);
  });
  it('should fail to validate when command is empty', () => {
    const invalidGraph = JSON.parse(JSON.stringify(exampleGraph));
    invalidGraph[1].command = '';
    const isValid: boolean = graphParser.validateGraph(invalidGraph);
    expect(isValid).toBe(false);
  });
  it('should fail to validate when command is missing', () => {
    const invalidGraph = JSON.parse(JSON.stringify(exampleGraph));
    delete invalidGraph[1].command;
    const isValid: boolean = graphParser.validateGraph(invalidGraph);
    expect(isValid).toBe(false);
  });
  it('should fail to validate when id is missing', () => {
    const invalidGraph = JSON.parse(JSON.stringify(exampleGraph));
    delete invalidGraph[1].id;
    const isValid: boolean = graphParser.validateGraph(invalidGraph);
    expect(isValid).toBe(false);
  });
  it('should fail to validate when id is empty', () => {
    const invalidGraph = JSON.parse(JSON.stringify(exampleGraph));
    invalidGraph[1].id = '';
    const isValid: boolean = graphParser.validateGraph(invalidGraph);
    expect(isValid).toBe(false);
  });
  it('should fail to validate when dependencies refer to nonexistent nodes', () => {
    const invalidGraph = JSON.parse(JSON.stringify(exampleGraph));
    invalidGraph[1].dependencies.push('@this/is/presumably#_not:real');
    const isValid: boolean = graphParser.validateGraph(invalidGraph);
    expect(isValid).toBe(false);
  });
});
