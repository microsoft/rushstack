// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../OperationStateFile');
// Mock project log file creation to avoid filesystem writes.
jest.mock('../ProjectLogWritable', () => {
  const actual = jest.requireActual('../ProjectLogWritable');
  const { TerminalWritable } = jest.requireActual('@rushstack/terminal');
  class MockTerminalWritable extends TerminalWritable {
    protected onWriteChunk(): void {
      /* noop */
    }
    protected onClose(): void {
      /* noop */
    }
  }
  return {
    ...actual,
    initializeProjectLogFilesAsync: jest.fn(async () => new MockTerminalWritable())
  };
});

import { MockWritable } from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IInputsSnapshot, IRushConfigurationProjectForSnapshot } from '../../incremental/InputsSnapshot';
import type { IOperationStateHashComponents } from '../IOperationExecutionResult';
import { Operation } from '../Operation';
import { calculateOperationStateHashEntry } from '../OperationExecutionRecord';
import { OperationGraph } from '../OperationGraph';
import { OperationStatus } from '../OperationStatus';
import { MockOperationRunner } from './MockOperationRunner';

const mockPhase: IPhase = {
  name: 'phase',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: {
    self: new Set(),
    upstream: new Set()
  },
  isSynthetic: false,
  logFilenameIdentifier: 'phase',
  missingScriptBehavior: 'silent'
};

interface IStateHashes {
  readonly components: ReadonlyMap<string, IOperationStateHashComponents>;
  readonly hashes: ReadonlyMap<string, string>;
}

/**
 * A graph of operations a, b and c, where b depends on a. Each iteration hashes the own inputs of each operation as
 * its entry in `localHashes`.
 */
class StateHashGraph {
  public readonly iterations: IStateHashes[] = [];
  public readonly graph: OperationGraph;
  readonly #inputsSnapshot: IInputsSnapshot;

  public constructor(localHashes: ReadonlyMap<string, string>) {
    const operations: Map<string, Operation> = new Map();
    for (const name of ['a', 'b', 'c']) {
      operations.set(
        name,
        new Operation({
          runner: new MockOperationRunner(name),
          logFilenameIdentifier: name,
          phase: mockPhase,
          project: { packageName: name } as unknown as RushConfigurationProject
        })
      );
    }
    operations.get('b')!.addDependency(operations.get('a')!);

    this.graph = new OperationGraph(new Set(operations.values()), {
      quietMode: false,
      debugMode: false,
      parallelism: 1,
      allowOversubscription: true,
      destinations: [new MockWritable()],
      abortController: new AbortController()
    });
    this.graph.hooks.configureIteration.tap('test', (records) => {
      const components: Map<string, IOperationStateHashComponents> = new Map();
      const hashes: Map<string, string> = new Map();
      for (const [operation, record] of records) {
        components.set(operation.name, record.getStateHashComponents());
        hashes.set(operation.name, record.getStateHash());
      }
      this.iterations.push({ components, hashes });
    });

    this.#inputsSnapshot = {
      hashes: new Map(),
      rootDirectory: '/repo',
      hasUncommittedChanges: false,
      getTrackedFileHashesForOperation: () => new Map(),
      getOperationOwnStateHash: (project: IRushConfigurationProjectForSnapshot) =>
        localHashes.get((project as RushConfigurationProject).packageName)!
    };
  }

  public async executeAsync(): Promise<IStateHashes> {
    expect((await this.graph.executeAsync({ inputsSnapshot: this.#inputsSnapshot })).status).toBe(
      OperationStatus.Success
    );
    return this.iterations[this.iterations.length - 1];
  }
}

function getReusedNames(previous: IStateHashes, current: IStateHashes): string[] {
  return Array.from(current.components.keys()).filter(
    (name: string) => current.components.get(name) === previous.components.get(name)
  );
}

describe('OperationGraph state hashes', () => {
  it('reuses the state hash of each operation whose inputs did not change since the previous iteration', async () => {
    const localHashes: Map<string, string> = new Map([
      ['a', 'local-a'],
      ['b', 'local-b'],
      ['c', 'local-c']
    ]);
    const graph: StateHashGraph = new StateHashGraph(localHashes);

    const first: IStateHashes = await graph.executeAsync();
    const second: IStateHashes = await graph.executeAsync();
    expect(getReusedNames(first, second)).toEqual(['a', 'b', 'c']);
    expect(second.hashes).toEqual(first.hashes);

    localHashes.set('a', 'local-a-edited');
    const third: IStateHashes = await graph.executeAsync();
    expect(getReusedNames(second, third)).toEqual(['c']);
    expect(third.hashes.get('a')).not.toBe(second.hashes.get('a'));
    expect(third.hashes.get('b')).not.toBe(second.hashes.get('b'));

    // A new graph has nothing to reuse, and calculates the same state hashes
    const uncached: IStateHashes = await new StateHashGraph(localHashes).executeAsync();
    expect(third.hashes).toEqual(uncached.hashes);
    expect(third.components).toEqual(uncached.components);
  });
});

describe(calculateOperationStateHashEntry.name, () => {
  it('returns the previous entry if it was calculated from the same inputs', () => {
    const entry: ReturnType<typeof calculateOperationStateHashEntry> = calculateOperationStateHashEntry(
      ['a', 'hash-a', 'b', 'hash-b'],
      'local',
      'config',
      undefined
    );
    expect(calculateOperationStateHashEntry(['a', 'hash-a', 'b', 'hash-b'], 'local', 'config', entry)).toBe(
      entry
    );

    for (const [dependencies, local, config] of [
      [['a', 'hash-a', 'b', 'hash-b2'], 'local', 'config'],
      [['a', 'hash-a'], 'local', 'config'],
      [['a', 'hash-a', 'b', 'hash-b'], 'local2', 'config'],
      [['a', 'hash-a', 'b', 'hash-b'], 'local', 'config2']
    ] as [string[], string, string][]) {
      const changed: ReturnType<typeof calculateOperationStateHashEntry> = calculateOperationStateHashEntry(
        dependencies,
        local,
        config,
        entry
      );
      expect(changed).toEqual(calculateOperationStateHashEntry(dependencies, local, config, undefined));
      expect(changed.hash).not.toBe(entry.hash);
    }
  });

  it('does not depend on the order of the dependencies', () => {
    expect(
      calculateOperationStateHashEntry(['b', 'hash-b', 'a', 'hash-a'], 'local', 'config', undefined).hash
    ).toBe(
      calculateOperationStateHashEntry(['a', 'hash-a', 'b', 'hash-b'], 'local', 'config', undefined).hash
    );
  });

  it('calculates an entry without a previous entry whatever the local state hash is', () => {
    const local: string = undefined as unknown as string;
    expect(calculateOperationStateHashEntry([], local, 'config', undefined).components).toEqual({
      dependencies: [],
      local,
      config: 'config'
    });
  });
});
