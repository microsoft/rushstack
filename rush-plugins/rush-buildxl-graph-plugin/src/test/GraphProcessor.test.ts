// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Terminal, NoOpTerminalProvider } from '@rushstack/terminal';
import { JsonFile } from '@rushstack/node-core-library';
import type { IPhase } from '@microsoft/rush-lib/lib/api/CommandLineConfiguration';
import { RushConfiguration } from '@microsoft/rush-lib/lib/api/RushConfiguration';
import type { IOperationRunner } from '@microsoft/rush-lib/lib/logic/operations/IOperationRunner';
import type { OperationStatus } from '@microsoft/rush-lib/lib/logic/operations/OperationStatus';
import {
  PhasedCommandHooks,
  type ICreateOperationsContext
} from '@microsoft/rush-lib/lib/pluginFramework/PhasedCommandHooks';
import { Operation } from '@microsoft/rush-lib/lib/logic/operations/Operation';
import { ShardedPhasedOperationPlugin } from '@microsoft/rush-lib/lib/logic/operations/ShardedPhaseOperationPlugin';
import { ShellOperationRunnerPlugin } from '@microsoft/rush-lib/lib/logic/operations/ShellOperationRunnerPlugin';

import { GraphProcessor, type IGraphNode } from '../GraphProcessor';

// to update the examples folder, run the following command from the project root:
// export DEBUG_RUSH_BUILD_GRAPH="test" && rush build --production -t . --drop-graph ./src/examples/graph.json
import graph from '../examples/graph.json';
import debugGraph from '../examples/debug-graph.json';

function sortGraphNodes(graphNodes: IGraphNode[]): IGraphNode[] {
  return graphNodes.sort((a, b) => (a.id === b.id ? 0 : a.id < b.id ? -1 : 1));
}

class MockRunner implements IOperationRunner {
  declare public name: string;
  declare public isNoOp: boolean;
  declare public silent: boolean;
  declare public cacheable: boolean;
  declare public reportTiming: boolean;
  declare public warningsAreAllowed: boolean;
  declare public _configHash: string;

  public async executeAsync(): Promise<OperationStatus> {
    throw new Error('Method not implemented.');
  }

  public getConfigHash(): string {
    return this._configHash;
  }

  public getCommandForExecution(): string {
    return this._configHash;
  }
}

function loadDebugGraph(): Operation[] {
  const operations: Operation[] = [];
  const clonedGraphNodes: typeof debugGraph.OperationMap = JSON.parse(
    JSON.stringify(debugGraph.OperationMap)
  );
  for (const node of clonedGraphNodes) {
    const runner = node.runner;
    Object.setPrototypeOf(runner, MockRunner.prototype);
    const operation: Operation = {
      ...node,
      runner
    } as unknown as Operation;
    operations.push(operation);
  }
  return operations;
}

async function createShardedOperationsAsync(rushConfiguration: RushConfiguration): Promise<Set<Operation>> {
  const phase: IPhase = {
    name: '_phase:test',
    logFilenameIdentifier: '_phase_test',
    isSynthetic: false,
    associatedParameters: new Set(),
    dependencies: { self: new Set(), upstream: new Set() },
    allowWarningsOnSuccess: false,
    missingScriptBehavior: 'error'
  };
  const project = rushConfiguration.projects[0];
  const preparation: Operation = new Operation({
    phase: { ...phase, name: '_phase:build', logFilenameIdentifier: '_phase_build' },
    project,
    logFilenameIdentifier: '_phase_build'
  });
  const collator: Operation = new Operation({
    phase,
    project,
    logFilenameIdentifier: phase.logFilenameIdentifier,
    settings: { operationName: phase.name, sharding: { count: 2, shardOperationSettings: {} } }
  });
  collator.addDependency(preparation);
  const hooks: PhasedCommandHooks = new PhasedCommandHooks();
  new ShardedPhasedOperationPlugin().apply(hooks);
  new ShellOperationRunnerPlugin().apply(hooks);
  const context: ICreateOperationsContext = {
    buildCacheConfiguration: undefined,
    changedProjectsOnly: false,
    cobuildConfiguration: undefined,
    customParameters: new Map(),
    includePhaseDeps: true,
    projectConfigurations: new Map(),
    isIncrementalBuildAllowed: false,
    isWatch: false,
    parallelism: 1,
    phaseSelection: new Set([phase]),
    projectSelection: new Set([project]),
    rushConfiguration
  };
  return await hooks.createOperationsAsync.promise(new Set([preparation, collator]), context);
}

describe(GraphProcessor.name, () => {
  let exampleGraph: readonly IGraphNode[];
  let graphParser: GraphProcessor;
  let emittedErrors: Error[];
  let emittedWarnings: Error[];
  let fixtureFolder: string;
  let rushConfiguration: RushConfiguration;

  beforeAll(async () => {
    exampleGraph = sortGraphNodes(Array.from(graph.nodes));
    fixtureFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'rush-shard-graph-'));
    const configPath: string = path.join(fixtureFolder, 'rush.json');
    await JsonFile.saveAsync(
      {
        rushVersion: '5.179.0',
        pnpmVersion: '10.27.0',
        projects: [{ packageName: 'sharded-project', projectFolder: 'projects/sharded-project' }]
      },
      configPath
    );
    await JsonFile.saveAsync(
      {
        name: 'sharded-project',
        version: '1.0.0',
        scripts: {
          '_phase:build': 'node prepare.js',
          '_phase:test': 'node collate.js',
          '_phase:test:shard': 'node test.js'
        }
      },
      path.join(fixtureFolder, 'projects', 'sharded-project', 'package.json'),
      { ensureFolderExists: true }
    );
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(configPath);
  });

  afterAll(async () => {
    if (fixtureFolder) await fs.rm(fixtureFolder, { recursive: true, force: true });
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
    let prunedGraph: IGraphNode[] = graphParser.processOperations(new Set<Operation>(loadDebugGraph()));

    prunedGraph = sortGraphNodes(prunedGraph);
    expect(prunedGraph).toEqual(exampleGraph);
    expect(emittedErrors).toEqual([]);
    expect(emittedWarnings).toEqual([]);
  });

  it('should fail if the input schema is invalid', () => {
    const clonedOperationMap: Operation[] = loadDebugGraph();
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
    const clonedOperationMap: Operation[] = loadDebugGraph();
    (clonedOperationMap[0].runner as IOperationRunner & { isNoOp: boolean }).isNoOp = true;
    (clonedOperationMap[0].runner as IOperationRunner).getCommandForExecution = () => 'echo "hello world"';
    const operations: Set<Operation> = new Set(clonedOperationMap);
    expect(() => graphParser.processOperations(operations)).toThrow(/isNoOp does not match/);
    expect(emittedErrors).toEqual([]);
    expect(emittedWarnings).toEqual([]);
  });

  it('exports every native shard and its collator with preparation dependencies', async () => {
    const operations: Set<Operation> = await createShardedOperationsAsync(rushConfiguration);
    const nodes: IGraphNode[] = graphParser.processOperations(operations);
    expect(nodes).toHaveLength(4);
    expect(new Set(nodes.map((node) => node.id)).size).toBe(4);
    const preparation: IGraphNode = nodes.find((node) => node.command.startsWith('node prepare.js'))!;
    const collator: IGraphNode = nodes.find((node) => node.command.startsWith('node collate.js'))!;
    const shards: IGraphNode[] = nodes.filter((node) => node.command.startsWith('node test.js'));
    expect(preparation.id).toBe('sharded-project#_phase:build');
    expect(shards).toHaveLength(2);
    expect(shards.map((node) => node.dependencies)).toEqual([[preparation.id], [preparation.id]]);
    expect(new Set(collator.dependencies)).toEqual(new Set(shards.map((node) => node.id)));
    expect(shards.map((node) => node.command)).toEqual([
      expect.stringContaining('--shard=1/2'),
      expect.stringContaining('--shard=2/2')
    ]);
    expect(collator.command).toContain('--shard-count="2"');
    expect(sortGraphNodes(graphParser.processOperations(new Set([...operations].reverse())))).toEqual(
      sortGraphNodes(nodes)
    );
    expect(graphParser.validateGraph(nodes)).toBe(true);
    expect(emittedErrors).toEqual([]);
  });

  it('preserves runner-level cache exclusions without disabling sibling shards', async () => {
    const operations: Set<Operation> = await createShardedOperationsAsync(rushConfiguration);
    const collator: Operation = [...operations].find(
      (operation) => operation.settings?.sharding && !operation.isNoOp
    )!;
    collator.runner!.cacheable = false;
    const nodes: IGraphNode[] = graphParser.processOperations(operations);
    expect(nodes.find((node) => node.command.startsWith('node collate.js'))!.cacheable).toBe(false);
    expect(
      nodes.filter((node) => node.command.startsWith('node test.js')).map((node) => node.cacheable)
    ).toEqual([undefined, undefined]);
  });

  it('exports explicit execution metadata without treating opaque no-op hashes as commands', async () => {
    const operations: Set<Operation> = await createShardedOperationsAsync(rushConfiguration);
    for (const operation of operations) {
      operation.runner!.getConfigHash = () => 'opaque-hash-not-a-command';
    }
    const plan = new Map(
      [...operations].map(
        (operation) =>
          [
            operation,
            { enabled: true, environmentOverrides: { PUBLIC_GENERATION: 'current-generation' } }
          ] as const
      )
    );
    const nodes: IGraphNode[] = graphParser.processOperations(operations, plan);
    expect(nodes).toHaveLength(4);
    expect(nodes.every((node) => node.command.startsWith('node '))).toBe(true);
    expect(nodes.every((node) => node.environmentVariables?.PUBLIC_GENERATION === 'current-generation')).toBe(
      true
    );
    expect(emittedErrors).toEqual([]);
  });

  it('refuses to export a runner without an explicit shell command', async () => {
    const operations: Set<Operation> = await createShardedOperationsAsync(rushConfiguration);
    [...operations].find((operation) => !operation.isNoOp)!.runner!.getCommandForExecution = undefined;
    expect(() => graphParser.processOperations(operations)).toThrow(/does not support command export/);
  });

  it('exports only declared metadata and copies it without reading the full environment', async () => {
    const operations: Set<Operation> = await createShardedOperationsAsync(rushConfiguration);
    const plan: Map<Operation, { enabled: boolean; environmentOverrides: Record<string, string> }> = new Map(
      [...operations].map(
        (operation) =>
          [
            operation,
            {
              enabled: true,
              environmentOverrides: { PUBLIC_IDENTITY: 'current' },
              get environment(): never {
                throw new Error('The computed environment must not be read');
              }
            }
          ] as const
      )
    );
    const shard: Operation = [...operations].find((operation) => operation.settings?.outputFolderNames)!;
    Object.defineProperty(shard.runner!, 'warningsAreAllowed', { value: true });
    const nodes: IGraphNode[] = graphParser.processOperations(operations, plan);
    const exported: IGraphNode = nodes.find((node) => node.id.endsWith(shard.logFilenameIdentifier))!;
    expect(exported.task).toBe('_phase:test');
    expect(exported).not.toHaveProperty('phase');
    expect(exported.environmentVariables).toEqual({ PUBLIC_IDENTITY: 'current' });
    expect(exported.outputFolderNames).toEqual(shard.settings!.outputFolderNames);
    expect(exported.outputFolderNames).not.toBe(shard.settings!.outputFolderNames);
    expect(exported.warningsAreAllowed).toBe(true);
    plan.get(shard)!.environmentOverrides.PUBLIC_IDENTITY = 'later';
    expect(exported.environmentVariables).toEqual({ PUBLIC_IDENTITY: 'current' });
  });

  it('prunes disabled nodes while preserving their transitive dependencies', async () => {
    const operations: Set<Operation> = await createShardedOperationsAsync(rushConfiguration);
    const shard: Operation = [...operations].find((operation) => operation.settings?.outputFolderNames)!;
    shard.runner!.getCommandForExecution = () => {
      throw new Error('Disabled commands must not be read');
    };
    const plan = new Map([...operations].map((operation) => [operation, { enabled: operation !== shard }]));
    const nodes: IGraphNode[] = graphParser.processOperations(operations, plan);
    expect(nodes).toHaveLength(3);
    const preparation: IGraphNode = nodes.find((node) => node.command.startsWith('node prepare.js'))!;
    const collator: IGraphNode = nodes.find((node) => node.command.startsWith('node collate.js'))!;
    const remainingShard: IGraphNode = nodes.find((node) => node.command.startsWith('node test.js'))!;
    expect(new Set(collator.dependencies)).toEqual(new Set([preparation.id, remainingShard.id]));
    expect(graphParser.validateGraph(nodes)).toBe(true);
  });

  it('rejects an incomplete execution plan', async () => {
    const operations: Set<Operation> = await createShardedOperationsAsync(rushConfiguration);
    expect(() => graphParser.processOperations(operations, new Map())).toThrow(/Missing execution plan/);
  });

  it('rejects duplicate operation identities rather than overwriting a command', () => {
    const operations: Operation[] = loadDebugGraph();
    const duplicate: Operation = new Operation({
      phase: operations[0].associatedPhase,
      project: operations[0].associatedProject,
      runner: operations[0].runner,
      logFilenameIdentifier: operations[0].logFilenameIdentifier
    });
    expect(() => graphParser.processOperations(new Set([...operations, duplicate]))).toThrow(
      /Duplicate operation ID/
    );
  });

  it('rejects cycles before pruning no-op operations', async () => {
    const operations: Set<Operation> = await createShardedOperationsAsync(rushConfiguration);
    const preShard: Operation = [...operations].find((operation) => operation.isNoOp)!;
    preShard.addDependency(preShard);
    expect(() => graphParser.processOperations(operations)).toThrow(/dependency cycle/);
  });

  it('rejects missing operation dependencies before pruning', async () => {
    const operations: Set<Operation> = await createShardedOperationsAsync(rushConfiguration);
    const operation: Operation = [...operations][0];
    operation.addDependency(
      new Operation({
        phase: {
          ...operation.associatedPhase,
          name: '_phase:missing',
          logFilenameIdentifier: '_phase_missing'
        },
        project: operation.associatedProject,
        runner: operation.runner,
        logFilenameIdentifier: '_phase_missing'
      })
    );
    expect(() => graphParser.processOperations(operations)).toThrow(/dependency .* which does not exist/);
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

    it('rejects duplicate node IDs', () => {
      expect(graphParser.validateGraph([...exampleGraph, exampleGraph[0]])).toBe(false);
      expect(emittedErrors.some((error) => error.message.includes('Duplicate operation ID'))).toBe(true);
    });

    it.each([false, true])('rejects dependency cycles (self-dependency=%s)', (selfDependency) => {
      const entries: IGraphNode[] = [
        {
          id: 'a',
          task: 'test',
          package: 'a',
          workingDirectory: '/repo',
          command: 'test',
          dependencies: [selfDependency ? 'a' : 'b']
        },
        {
          id: 'b',
          task: 'test',
          package: 'b',
          workingDirectory: '/repo',
          command: 'test',
          dependencies: ['a']
        }
      ];
      expect(graphParser.validateGraph(entries)).toBe(false);
      expect(emittedErrors.map((error) => error.message)).toEqual(['Graph contains a dependency cycle']);
    });
  });
});
