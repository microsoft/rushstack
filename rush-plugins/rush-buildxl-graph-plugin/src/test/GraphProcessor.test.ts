// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationRunner, Operation } from '@rushstack/rush-sdk';
import type { ShellOperationRunner } from '@rushstack/rush-sdk/lib/logic/operations/ShellOperationRunner';
import { Terminal, NoOpTerminalProvider } from '@rushstack/terminal';

import { GraphProcessor, type IGraphNode } from '../GraphProcessor.ts';

// to update the examples folder, run the following command from the project root:
// export DEBUG_RUSH_BUILD_GRAPH="test" && rush build --production -t . --drop-graph ./src/examples/graph.json
import graph from '../examples/graph.json';
import debugGraph from '../examples/debug-graph.json';

function sortGraphNodes(graphNodes: IGraphNode[]): IGraphNode[] {
  return graphNodes.sort((a, b) => (a.id === b.id ? 0 : a.id < b.id ? -1 : 1));
}

describe(GraphProcessor.name, () => {
  let exampleGraph: readonly IGraphNode[];
  let graphParser: GraphProcessor;
  let emittedErrors: Error[];
  let emittedWarnings: Error[];

  beforeAll(() => {
    exampleGraph = sortGraphNodes(Array.from(graph.nodes));
  });

  beforeEach(() => {
    emittedErrors = [];
    emittedWarnings = [];

    const terminal: Terminal = new Terminal(new NoOpTerminalProvider());
    graphParser = new GraphProcessor({
      terminal,
      emitWarning: emittedWarnings.push.bind(emittedWarnings),
      emitError: emittedErrors.push.bind(emittedErrors)
    });
  });

  it('should process debug-graph.json into graph.json', () => {
    let prunedGraph: IGraphNode[] = graphParser.processOperations(
      new Set<Operation>(debugGraph.OperationMap as unknown as Operation[])
    );

    prunedGraph = sortGraphNodes(prunedGraph);
    expect(prunedGraph).toEqual(exampleGraph);
    expect(emittedErrors).toEqual([]);
    expect(emittedWarnings).toEqual([]);
  });

  it('should fail if the input schema is invalid', () => {
    const clonedOperationMap: Operation[] = JSON.parse(JSON.stringify(debugGraph.OperationMap));
    (clonedOperationMap[0].dependencies as unknown as Operation[]).push({
      incorrectPhase: { name: 'incorrectPhase' },
      incorrectProject: { packageName: 'incorrectProject' }
    } as unknown as Operation);
    const operations: Set<Operation> = new Set(clonedOperationMap);
    expect(() => graphParser.processOperations(operations)).toThrowErrorMatchingSnapshot();
    expect(emittedErrors).toEqual([]);
    expect(emittedWarnings).toEqual([]);
  });

  it('should fail if isNoOp mismatches a command', () => {
    const clonedOperationMap: Operation[] = JSON.parse(JSON.stringify(debugGraph.OperationMap));
    (clonedOperationMap[0].runner as IOperationRunner & { isNoOp: boolean }).isNoOp = true;
    (
      clonedOperationMap[0].runner as unknown as ShellOperationRunner & { commandToRun: string }
    ).commandToRun = 'echo "hello world"';
    const operations: Set<Operation> = new Set(clonedOperationMap);
    graphParser.processOperations(operations);
    expect(emittedErrors).not.toEqual([]);
    expect(emittedWarnings).toEqual([]);
  });

  describe(GraphProcessor.prototype.validateGraph.name, () => {
    it('should validate graph.json', () => {
      const isValid: boolean = graphParser.validateGraph(exampleGraph);
      expect(isValid).toBe(true);
      expect(emittedErrors).toEqual([]);
      expect(emittedWarnings).toEqual([]);
    });

    it('should fail to validate when command is empty', () => {
      const invalidGraph = JSON.parse(JSON.stringify(exampleGraph));
      invalidGraph[2].command = '';
      const isValid: boolean = graphParser.validateGraph(invalidGraph);
      expect(isValid).toBe(false);
      expect(emittedErrors).toMatchSnapshot();
      expect(emittedWarnings).toEqual([]);
    });

    it('should fail to validate when command is missing', () => {
      const invalidGraph = JSON.parse(JSON.stringify(exampleGraph));
      delete invalidGraph[2].command;
      const isValid: boolean = graphParser.validateGraph(invalidGraph);
      expect(isValid).toBe(false);
      expect(emittedErrors).toMatchSnapshot();
      expect(emittedWarnings).toEqual([]);
    });

    it('should fail to validate when id is missing', () => {
      const invalidGraph = JSON.parse(JSON.stringify(exampleGraph));
      delete invalidGraph[2].id;
      const isValid: boolean = graphParser.validateGraph(invalidGraph);
      expect(isValid).toBe(false);
      expect(emittedErrors).toMatchSnapshot();
      expect(emittedWarnings).toEqual([]);
    });

    it('should fail to validate when id is empty', () => {
      const invalidGraph = JSON.parse(JSON.stringify(exampleGraph));
      invalidGraph[2].id = '';
      const isValid: boolean = graphParser.validateGraph(invalidGraph);
      expect(isValid).toBe(false);
      expect(emittedErrors).toMatchSnapshot();
      expect(emittedWarnings).toEqual([]);
    });

    it('should fail to validate when dependencies refer to nonexistent nodes', () => {
      const invalidGraph = JSON.parse(JSON.stringify(exampleGraph));
      invalidGraph[2].dependencies.push('@this/is/presumably#_not:real');
      const isValid: boolean = graphParser.validateGraph(invalidGraph);
      expect(isValid).toBe(false);
      expect(emittedErrors).toMatchSnapshot();
      expect(emittedWarnings).toEqual([]);
    });
  });
});
