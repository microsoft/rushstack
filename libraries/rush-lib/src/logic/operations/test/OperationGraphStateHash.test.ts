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
import { LookupByPath } from '@rushstack/lookup-by-path';
import * as path from 'node:path';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import {
  InputsSnapshot,
  type IInputsSnapshot,
  type IRushConfigurationProjectForSnapshot,
  type InputSnapshotPolicy
} from '../../incremental/InputsSnapshot';
import type { RushProjectConfiguration } from '../../../api/RushProjectConfiguration';
import type { IOperationStateHashComponents } from '../IOperationExecutionResult';
import { Operation } from '../Operation';
import { calculateOperationStateHashEntry } from '../OperationExecutionRecord';
import { OperationGraph, type IOperationGraphOptions } from '../OperationGraph';
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
  public readonly inputsSnapshot: IInputsSnapshot;

  public constructor(localHashes: ReadonlyMap<string, string>, options?: Partial<IOperationGraphOptions>) {
    const operations: Map<string, Operation> = new Map();
    for (const name of ['a', 'b', 'c']) {
      operations.set(
        name,
        new Operation({
          runner: new MockOperationRunner(name),
          logFilenameIdentifier: name,
          phase: mockPhase,
          project: {
            packageName: name,
            projectFolder: path.resolve('/repo', name),
            projectRelativeFolder: name
          } as unknown as RushConfigurationProject
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
      abortController: new AbortController(),
      ...options
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

    this.inputsSnapshot = {
      inputSnapshotPolicyVersion: 1,
      hashes: new Map(),
      rootDirectory: '/repo',
      hasUncommittedChanges: false,
      getTrackedFileHashesForOperation: () => new Map(),
      getOperationOwnStateHash: (
        project: IRushConfigurationProjectForSnapshot,
        operationName?: string,
        environment?: Readonly<Record<string, string | undefined>>,
        policy?: InputSnapshotPolicy
      ) =>
        `${policy === 'strict-v1' ? 'strict:' : ''}${localHashes.get(
          (project as RushConfigurationProject).packageName
        )!}`
    };
  }

  public async executeAsync(): Promise<IStateHashes> {
    expect((await this.graph.executeAsync({ inputsSnapshot: this.inputsSnapshot })).status).toBe(
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
  const localHashes: ReadonlyMap<string, string> = new Map([
    ['a', 'local-a'],
    ['b', 'local-b'],
    ['c', 'local-c']
  ]);

  it('registers policy atomically and leaves unselected own hashes in the legacy namespace', async () => {
    const legacy: StateHashGraph = new StateHashGraph(localHashes);
    const strict: StateHashGraph = new StateHashGraph(localHashes);
    const [a, b] = Array.from(strict.graph.operations);
    expect(() =>
      strict.graph.setInputSnapshotPolicy([a, Array.from(legacy.graph.operations)[0]], 'strict-v1')
    ).toThrow('outside this graph');
    expect(strict.graph.getInputSnapshotPolicy(a)).toBe('legacy');
    expect(() =>
      Reflect.apply(strict.graph.setInputSnapshotPolicy, strict.graph, [[a], 'strict-v2'])
    ).toThrow('Unsupported');
    expect(strict.graph.getInputSnapshotPolicy(a)).toBe('legacy');
    strict.graph.setInputSnapshotPolicy([a], 'strict-v1');
    strict.graph.setInputSnapshotPolicy([a], 'strict-v1');
    const before: IStateHashes = await legacy.executeAsync();
    const after: IStateHashes = await strict.executeAsync();
    expect(after.components.get('a')!.local).not.toBe(before.components.get('a')!.local);
    expect(after.components.get('b')!.local).toBe(before.components.get('b')!.local);
    expect(after.hashes.get('b')).not.toBe(before.hashes.get('b'));
    expect(strict.graph.resultByOperation.get(a)!.inputSnapshotPolicy).toBe('strict-v1');
    expect(strict.graph.resultByOperation.get(b)!.inputSnapshotPolicy).toBe('legacy');
  });

  it('freezes registration before asynchronous snapshot acquisition', async () => {
    let provideSnapshot!: (snapshot: IInputsSnapshot) => void;
    const pending: Promise<IInputsSnapshot> = new Promise((resolve) => {
      provideSnapshot = resolve;
    });
    const fixture: StateHashGraph = new StateHashGraph(localHashes, {
      getInputsSnapshotAsync: () => pending
    });
    fixture.graph.setInputSnapshotPolicy(fixture.graph.operations, 'strict-v1');
    const scheduled: Promise<boolean> = fixture.graph.scheduleIterationAsync({});
    expect(() => fixture.graph.setInputSnapshotPolicy([], 'strict-v1')).toThrow('cannot change');
    expect(fixture.iterations).toHaveLength(0);
    provideSnapshot(fixture.inputsSnapshot);
    expect(await scheduled).toBe(true);
    expect(fixture.iterations).toHaveLength(1);
    fixture.graph.discardScheduledIteration();
  });

  it.each([false, true])(
    'fails closed before configuration for unsupported snapshots (missing: %s)',
    async (missing) => {
      const fixture: StateHashGraph = new StateHashGraph(localHashes);
      const snapshot: IInputsSnapshot = { ...fixture.inputsSnapshot, inputSnapshotPolicyVersion: undefined };
      fixture.graph.setInputSnapshotPolicy(fixture.graph.operations, 'strict-v1');
      await expect(
        fixture.graph.executeAsync({ inputsSnapshot: missing ? undefined : snapshot })
      ).rejects.toThrow('snapshot supporting');
      expect(fixture.iterations).toHaveLength(0);
      expect(() => fixture.graph.setInputSnapshotPolicy([], 'strict-v1')).toThrow('cannot change');
    }
  );

  it('accepts old snapshots for legacy graphs but checks capability again on every strict iteration', async () => {
    const fixture: StateHashGraph = new StateHashGraph(localHashes);
    const snapshot: IInputsSnapshot = { ...fixture.inputsSnapshot, inputSnapshotPolicyVersion: undefined };
    await fixture.graph.executeAsync({ inputsSnapshot: snapshot });
    expect(fixture.iterations).toHaveLength(1);
    const strict: StateHashGraph = new StateHashGraph(localHashes);
    strict.graph.setInputSnapshotPolicy(strict.graph.operations, 'strict-v1');
    await strict.executeAsync();
    await expect(strict.graph.executeAsync({ inputsSnapshot: snapshot })).rejects.toThrow(
      'snapshot supporting'
    );
    expect(strict.iterations).toHaveLength(1);
  });

  it('rejects strict additional/output conflicts before configuration or execution preparation', async () => {
    const fixture: StateHashGraph = new StateHashGraph(localHashes);
    const operations: Operation[] = Array.from(fixture.graph.operations);
    const a: Operation = operations[0];
    const projectConfig: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
      operationSettingsByOperationName: new Map([
        ['phase', { operationName: 'phase', outputFolderNames: ['lib'] }]
      ])
    };
    const inputsSnapshot: InputsSnapshot = new InputsSnapshot({
      rootDir: path.resolve('/repo'),
      hashes: new Map(),
      additionalHashes: new Map([['a/lib/sorter.js', 'input']]),
      hasUncommittedChanges: false,
      lookupByPath: new LookupByPath(
        operations.map(({ associatedProject: project }) => [project.projectRelativeFolder, project])
      ),
      projectMap: new Map(
        operations.map(({ associatedProject: project }) => [
          project,
          {
            projectConfig: projectConfig as RushProjectConfiguration,
            additionalFilesByOperationName:
              project === a.associatedProject ? new Map([['phase', new Set(['a/lib/sorter.js'])]]) : undefined
          }
        ])
      )
    });
    inputsSnapshot.getOperationOwnStateHash(a.associatedProject, 'phase');
    fixture.graph.setInputSnapshotPolicy([a], 'strict-v1');
    const prepare: jest.Mock = jest.fn();
    fixture.graph.hooks.beforeExecuteIterationAsync.tap('test', prepare);
    await expect(fixture.graph.executeAsync({ inputsSnapshot })).rejects.toThrow(
      'contains additional input file'
    );
    expect(fixture.iterations).toHaveLength(0);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('uses the frozen resolver and capability guard for joining request records', async () => {
    const hashes: Map<string, string> = new Map(localHashes);
    const fixture: StateHashGraph = new StateHashGraph(hashes);
    const [a, b, c] = Array.from(fixture.graph.operations);
    fixture.graph.setInputSnapshotPolicy([b], 'strict-v1');
    let started!: () => void;
    const whenStarted: Promise<void> = new Promise((resolve) => {
      started = resolve;
    });
    let finish!: () => void;
    const whenFinished: Promise<void> = new Promise((resolve) => {
      finish = resolve;
    });
    a.runner = new MockOperationRunner('a', async () => {
      started();
      await whenFinished;
      return OperationStatus.Success;
    });
    let joining: boolean = false;
    fixture.graph.hooks.configureIteration.tap('test-policy', (records) => {
      expect(records.get(b)!.inputSnapshotPolicy).toBe('strict-v1');
      expect(records.get(c)!.inputSnapshotPolicy).toBe('legacy');
      records.get(b)!.enabled = joining;
      records.get(c)!.enabled = false;
    });
    const run = fixture.graph.executeAsync({
      inputsSnapshot: fixture.inputsSnapshot,
      holdUnneededOperations: true
    });
    await whenStarted;
    try {
      joining = true;
      const count: number = fixture.iterations.length;
      expect(() =>
        fixture.graph.tryExtendCurrentIteration({
          inputsSnapshot: { ...fixture.inputsSnapshot, inputSnapshotPolicyVersion: undefined },
          neededOperations: [b]
        })
      ).toThrow('snapshot supporting');
      expect(fixture.iterations).toHaveLength(count);
      hashes.set('b', 'changed');
      expect(
        fixture.graph.tryExtendCurrentIteration({
          inputsSnapshot: fixture.inputsSnapshot,
          neededOperations: [b]
        }).extended
      ).toBe(true);
      expect(fixture.iterations.at(-1)!.components.get('b')!.local).toBe('strict:changed');
    } finally {
      finish();
      await run;
    }
  });

  it('reuses the state hash of each operation whose inputs did not change since the previous iteration', async () => {
    const changedHashes: Map<string, string> = new Map([
      ['a', 'local-a'],
      ['b', 'local-b'],
      ['c', 'local-c']
    ]);
    const graph: StateHashGraph = new StateHashGraph(changedHashes);

    const first: IStateHashes = await graph.executeAsync();
    const second: IStateHashes = await graph.executeAsync();
    expect(getReusedNames(first, second)).toEqual(['a', 'b', 'c']);
    expect(second.hashes).toEqual(first.hashes);

    changedHashes.set('a', 'local-a-edited');
    const third: IStateHashes = await graph.executeAsync();
    expect(getReusedNames(second, third)).toEqual(['c']);
    expect(third.hashes.get('a')).not.toBe(second.hashes.get('a'));
    expect(third.hashes.get('b')).not.toBe(second.hashes.get('b'));

    // A new graph has nothing to reuse, and calculates the same state hashes
    const uncached: IStateHashes = await new StateHashGraph(changedHashes).executeAsync();
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
