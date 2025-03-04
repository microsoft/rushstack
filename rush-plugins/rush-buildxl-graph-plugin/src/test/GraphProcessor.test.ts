// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type IOperationRunner, Operation } from '@rushstack/rush-sdk';
import { Terminal, NoOpTerminalProvider } from '@rushstack/terminal';

import { GraphProcessor, type IGraphNode } from '../GraphProcessor';

// to update the examples folder, run the following command from the project root:
// export DEBUG_RUSH_BUILD_GRAPH="test" && rush build --production -t . --drop-graph ./src/examples/graph.json
import graph from '../examples/graph.json';
import debugGraph from '../examples/debug-graph.json';

function sortGraphNodes(graphNodes: IGraphNode[]): IGraphNode[] {
  return graphNodes.sort((a, b) => (a.id === b.id ? 0 : a.id < b.id ? -1 : 1));
}

function getDebugOperationMap(): Operation[] {
  const cloned: typeof debugGraph.OperationMap = JSON.parse(JSON.stringify(debugGraph.OperationMap));

  return cloned.map((op) => {
    // Operation has getters
    Object.setPrototypeOf(op, Operation.prototype);
    return op as unknown as Operation;
  });
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
    let prunedGraph: IGraphNode[] = graphParser.processOperations(new Set<Operation>(getDebugOperationMap()));

    prunedGraph = sortGraphNodes(prunedGraph);
    expect(prunedGraph).toEqual(exampleGraph);
    expect(emittedErrors).toEqual([]);
    expect(emittedWarnings).toEqual([]);
  });

  it('should fail if the input schema is invalid', () => {
    const clonedOperationMap: Operation[] = getDebugOperationMap();
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
    const clonedOperationMap: Operation[] = getDebugOperationMap();
    const runner: IOperationRunner | undefined = clonedOperationMap[0].runner;
    if (!runner) {
      throw new Error('runner is undefined');
    }
    (runner as IOperationRunner & { isNoOp: boolean }).isNoOp = true;
    (runner as IOperationRunner & { commandToRun?: string }).commandToRun = 'echo "hello world"';
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
