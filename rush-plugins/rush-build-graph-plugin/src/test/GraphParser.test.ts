// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// GraphParser.test.ts

import type { Operation, ILogger } from '@rushstack/rush-sdk';

import { PackageJsonLookup, JsonFile } from '@rushstack/node-core-library';

import { GraphParser, type IGraphNode } from '../GraphParser';

import * as child_process from 'child_process';

import testData from './test-operation-map.json';

const lookup: PackageJsonLookup = new PackageJsonLookup();
lookup.tryGetPackageFolderFor(__dirname);
const thisProjectFolder: string | undefined = lookup.tryGetPackageFolderFor(__dirname);
if (!thisProjectFolder) {
  throw new Error('Cannot find project folder');
}

const testRepoLocation: string = `${thisProjectFolder}/rushBuildGraphPluginTestRepo`;
const graphLocation: string = `${thisProjectFolder}/examples/graph.json`;

const procOut: child_process.SpawnSyncReturns<string> = child_process.spawnSync(
  'rush',
  ['build', '--drop-graph', graphLocation],
  { encoding: 'utf8', stdio: 'ignore', cwd: testRepoLocation, timeout: 60000 }
);

const graph = JsonFile.load(graphLocation);

const exampleGraph: readonly IGraphNode[] = Array.from(graph.nodes as IGraphNode[]).sort((a, b) =>
  a.id > b.id ? 1 : -1
) as readonly IGraphNode[];

const graphParser: GraphParser = new GraphParser({
  terminal: { writeErrorLine: jest.fn(), writeLine: jest.fn() }
} as unknown as ILogger);

describe('--drop-graph integration process', () => {
  beforeAll(async () => {
    if (procOut.error) {
      throw procOut.error;
    }

    if (procOut.status !== 0) {
      throw new Error(`Failed to build graph: ${procOut.status}`);
    }
  });
  it('Should produce consistent output graph', () => {
    expect(exampleGraph).toMatchSnapshot();
  });
});

describe(GraphParser.name, () => {
  it('should fail if the input schema is invalid', () => {
    const operations = JSON.parse(JSON.stringify(testData.OperationMap));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (operations[0].dependencies as Array<any>).push({
      incorrectPhase: { name: 'incorrectPhase' },
      incorrectProject: { packageName: 'incorrectProject' }
    });
    expect(() => graphParser.processOperations(new Set(operations))).toThrowErrorMatchingSnapshot();
  });

  it('should fail if isNoOp mismatches a command', () => {
    const operations = JSON.parse(JSON.stringify(testData.OperationMap));
    const firstOperation: Operation = operations[0];
    // @ts-ignore, isNoOp is a readonly property
    firstOperation.runner!.isNoOp = true;
    // @ts-ignore, _commandToRun doesn't exist on IOperationRunner
    firstOperation.runner!._commandToRun = 'echo "hello world"';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => graphParser.processOperations(new Set(operations as any))).toThrowErrorMatchingSnapshot();
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
