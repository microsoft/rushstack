// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IOperationSettings } from '../../../api/RushProjectConfiguration';
import type { IInputsSnapshot, IRushConfigurationProjectForSnapshot } from '../../incremental/InputsSnapshot';
import type { IOperationStateHashComponents } from '../IOperationExecutionResult';
import { Operation } from '../Operation';
import {
  type IOperationExecutionRecordContext,
  type IOperationStateHashCacheEntry,
  OperationExecutionRecord
} from '../OperationExecutionRecord';
import {
  getCommandExecution,
  setIncrementalExecutionGuard,
  wasExecutedIncrementally,
  type IIncrementalExecutionGuard
} from '../IncrementalExecutionState';
import { MockOperationRunner } from './MockOperationRunner';

const MOCK_PHASE: IPhase = {
  name: '_phase:test',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: {
    self: new Set(),
    upstream: new Set()
  },
  isSynthetic: false,
  logFilenameIdentifier: '_phase_test',
  missingScriptBehavior: 'silent'
};

function createProject(packageName: string): RushConfigurationProject {
  return {
    packageName
  } as RushConfigurationProject;
}

function createOperation(options: {
  project: RushConfigurationProject;
  settings?: IOperationSettings;
  isNoOp?: boolean;
}): Operation {
  const { project, settings, isNoOp } = options;
  return new Operation({
    phase: MOCK_PHASE,
    project,
    settings,
    runner: new MockOperationRunner(`${project.packageName} (${MOCK_PHASE.name})`, undefined, false, isNoOp),
    logFilenameIdentifier: `${project.packageName}_phase_test`
  });
}

function createRecord(operation: Operation, maxParallelism: number = 8): OperationExecutionRecord {
  return new OperationExecutionRecord(operation, {
    maxParallelism
  } as unknown as IOperationExecutionRecordContext);
}

class ConfigurableRunner extends MockOperationRunner {
  public configHash: string = 'config';
  public configHashRequests: number = 0;

  public override getConfigHash(): string {
    this.configHashRequests++;
    return this.configHash;
  }
}

/**
 * Operations a, b, c and d, where b depends on a, and c depends on a and b. The own state hash of each operation is
 * its entry in `localHashes`, and its config hash is its runner's `configHash`.
 */
class StateHashFixture {
  public readonly operations: Map<string, Operation> = new Map();
  public readonly runners: Map<string, ConfigurableRunner> = new Map();
  public readonly localHashes: Map<string, string> = new Map();
  public readonly ownStateHashRequests: string[] = [];
  public readonly inputsSnapshot: IInputsSnapshot;

  public constructor() {
    for (const name of ['a', 'b', 'c', 'd']) {
      const runner: ConfigurableRunner = new ConfigurableRunner(name);
      this.runners.set(name, runner);
      this.operations.set(
        name,
        new Operation({
          phase: MOCK_PHASE,
          project: createProject(name),
          runner,
          logFilenameIdentifier: name
        })
      );
      this.localHashes.set(name, `local-${name}`);
    }
    this.getOperation('b').addDependency(this.getOperation('a'));
    this.getOperation('c').addDependency(this.getOperation('a'));
    this.getOperation('c').addDependency(this.getOperation('b'));

    this.inputsSnapshot = {
      hashes: new Map(),
      rootDirectory: '/repo',
      hasUncommittedChanges: false,
      getTrackedFileHashesForOperation: () => new Map(),
      getOperationOwnStateHash: (project: IRushConfigurationProjectForSnapshot) => {
        const { packageName } = project as RushConfigurationProject;
        this.ownStateHashRequests.push(packageName);
        return this.localHashes.get(packageName)!;
      }
    };
  }

  public getOperation(name: string): Operation {
    return this.operations.get(name)!;
  }

  public getConfigHashRequests(): number[] {
    return Array.from(this.runners.values(), (runner: ConfigurableRunner) => runner.configHashRequests);
  }

  /**
   * Creates the records of one iteration the way that the graph does, and calculates every state hash.
   */
  public calculate(
    stateHashCache: WeakMap<Operation, IOperationStateHashCacheEntry> | undefined
  ): Map<string, OperationExecutionRecord> {
    const context: IOperationExecutionRecordContext = {
      maxParallelism: 1,
      inputsSnapshot: this.inputsSnapshot,
      stateHashCache
    } as unknown as IOperationExecutionRecordContext;
    const recordByOperation: Map<Operation, OperationExecutionRecord> = new Map();
    for (const operation of this.operations.values()) {
      recordByOperation.set(operation, new OperationExecutionRecord(operation, context));
    }
    for (const [operation, record] of recordByOperation) {
      for (const dependency of operation.dependencies) {
        record.dependencies.add(recordByOperation.get(dependency)!);
      }
    }
    const records: Map<string, OperationExecutionRecord> = new Map();
    for (const record of recordByOperation.values()) {
      record.getStateHash();
      records.set(record.name, record);
    }
    return records;
  }
}

function getHashes(records: ReadonlyMap<string, OperationExecutionRecord>): Record<string, string> {
  return Object.fromEntries(Array.from(records, ([name, record]) => [name, record.getStateHash()]));
}

function getComponents(
  records: ReadonlyMap<string, OperationExecutionRecord>
): Record<string, IOperationStateHashComponents> {
  return Object.fromEntries(Array.from(records, ([name, record]) => [name, record.getStateHashComponents()]));
}

/**
 * Checks that the records' hashes are the ones that records without a cache calculate, and returns the names of
 * the records that reused the components of `previous`.
 */
function getReusedNames(
  fixture: StateHashFixture,
  previous: ReadonlyMap<string, OperationExecutionRecord>,
  current: ReadonlyMap<string, OperationExecutionRecord>
): string[] {
  const uncached: Map<string, OperationExecutionRecord> = fixture.calculate(undefined);
  expect(getHashes(current)).toEqual(getHashes(uncached));
  expect(getComponents(current)).toEqual(getComponents(uncached));
  return Array.from(current.keys()).filter(
    (name: string) =>
      current.get(name)!.getStateHashComponents() === previous.get(name)!.getStateHashComponents()
  );
}

describe(OperationExecutionRecord.name, () => {
  describe('weight', () => {
    it('snapshots numeric operation weight for a normal (non-no-op) operation', () => {
      const project: RushConfigurationProject = createProject('project-normal');
      const operation: Operation = createOperation({
        project,
        settings: {
          operationName: MOCK_PHASE.name,
          weight: 3
        }
      });

      const record: OperationExecutionRecord = createRecord(operation);
      expect(record.weight).toBe(3);
    });

    it('coerces percentage weight to integer slots using maxParallelism', () => {
      // 25% of 8 slots = floor(0.25 * 8) = 2
      const project: RushConfigurationProject = createProject('project-percent');
      const operation: Operation = createOperation({
        project,
        settings: {
          operationName: MOCK_PHASE.name,
          weight: '25%'
        } as IOperationSettings
      });

      const record: OperationExecutionRecord = createRecord(operation, 8);
      expect(record.weight).toBe(2);
    });

    it('coerces weight to 0 for no-op operations regardless of operation weight', () => {
      const project: RushConfigurationProject = createProject('project-noop');
      const operation: Operation = createOperation({
        project,
        settings: {
          operationName: MOCK_PHASE.name,
          weight: 5
        },
        isNoOp: true
      });

      const record: OperationExecutionRecord = createRecord(operation);
      expect(record.weight).toBe(0);
    });

    it('snapshots default weight (1) for a normal operation with no weight setting', () => {
      const project: RushConfigurationProject = createProject('project-default');
      const operation: Operation = createOperation({ project });

      const record: OperationExecutionRecord = createRecord(operation);
      expect(record.weight).toBe(1);
    });

    it('coerces weight to 0 for no-op operations even with default weight', () => {
      const project: RushConfigurationProject = createProject('project-noop-default');
      const operation: Operation = createOperation({ project, isNoOp: true });

      const record: OperationExecutionRecord = createRecord(operation);
      expect(record.weight).toBe(0);
    });

    it('uses the graph maxParallelism (not OS core count) when coercing percentage weights', () => {
      // 50% of 4 slots = floor(0.5 * 4) = 2, not floor(0.5 * <os cores>)
      const project: RushConfigurationProject = createProject('project-graph-max');
      const operation: Operation = createOperation({
        project,
        settings: {
          operationName: MOCK_PHASE.name,
          weight: '50%'
        } as IOperationSettings
      });

      const record: OperationExecutionRecord = createRecord(operation, 4);
      expect(record.weight).toBe(2);
    });
  });

  describe('incremental execution', () => {
    it('returns the incremental execution guard that a plugin registered for the record', () => {
      const operation: Operation = createOperation({ project: createProject('project-guarded') });
      const record: OperationExecutionRecord = createRecord(operation);
      expect(record.getIncrementalExecutionGuard()).toBeUndefined();

      const guard: IIncrementalExecutionGuard = {
        getBlockReasonAsync: async () => undefined,
        verifyIncrementalResultAsync: async () => undefined
      };
      setIncrementalExecutionGuard(record, guard);
      expect(record.getIncrementalExecutionGuard()).toBe(guard);
      // The guard belongs to the record of one iteration, not to the operation.
      expect(createRecord(operation).getIncrementalExecutionGuard()).toBeUndefined();
    });

    it('records the command execution that the runner reports', () => {
      const record: OperationExecutionRecord = createRecord(
        createOperation({ project: createProject('project-reported') })
      );
      expect(getCommandExecution(record)).toBeUndefined();

      record.reportCommandExecution({ kind: 'incremental', hasIncrementalCommand: true });
      expect(getCommandExecution(record)).toEqual({ kind: 'incremental', hasIncrementalCommand: true });
      expect(wasExecutedIncrementally(record)).toBe(true);

      // The last report counts, e.g. when the guard made the runner run its initial command after the incremental one.
      record.reportCommandExecution({ kind: 'initial', hasIncrementalCommand: true });
      expect(wasExecutedIncrementally(record)).toBe(false);
    });

    it('records whether the runner reports that the command ran in a process that watches the input files', () => {
      const record: OperationExecutionRecord = createRecord(
        createOperation({ project: createProject('project-watching') })
      );

      record.reportCommandExecution({
        kind: 'incremental',
        hasIncrementalCommand: true,
        watchesInputs: true
      });
      expect(getCommandExecution(record)?.watchesInputs).toBe(true);

      record.reportCommandExecution({ kind: 'initial', hasIncrementalCommand: true });
      expect(getCommandExecution(record)?.watchesInputs).toBeUndefined();
    });
  });

  describe('state hash', () => {
    let fixture: StateHashFixture;
    let cache: WeakMap<Operation, IOperationStateHashCacheEntry>;

    beforeEach(() => {
      fixture = new StateHashFixture();
      cache = new WeakMap();
    });

    it('reuses the last state hash of every operation whose inputs did not change', () => {
      const first: Map<string, OperationExecutionRecord> = fixture.calculate(cache);
      expect(fixture.ownStateHashRequests).toEqual(['a', 'b', 'c', 'd']);
      expect(fixture.getConfigHashRequests()).toEqual([1, 1, 1, 1]);

      const second: Map<string, OperationExecutionRecord> = fixture.calculate(cache);
      // Every record still reads its own inputs to check the cached entry
      expect(fixture.ownStateHashRequests).toEqual(['a', 'b', 'c', 'd', 'a', 'b', 'c', 'd']);
      expect(fixture.getConfigHashRequests()).toEqual([2, 2, 2, 2]);
      expect(getHashes(second)).toEqual(getHashes(first));
      expect(getReusedNames(fixture, first, second)).toEqual(['a', 'b', 'c', 'd']);
    });

    it("calculates the state hashes again when an operation's own state hash changes, for it and its consumers", () => {
      const first: Map<string, OperationExecutionRecord> = fixture.calculate(cache);
      fixture.localHashes.set('a', 'local-a-edited');

      const second: Map<string, OperationExecutionRecord> = fixture.calculate(cache);
      expect(getReusedNames(fixture, first, second)).toEqual(['d']);
      for (const name of ['a', 'b', 'c']) {
        expect(second.get(name)!.getStateHash()).not.toBe(first.get(name)!.getStateHash());
      }
    });

    it("calculates the state hashes again when an operation's config hash changes, for it and its consumers", () => {
      const first: Map<string, OperationExecutionRecord> = fixture.calculate(cache);
      fixture.runners.get('b')!.configHash = 'config-edited';

      const second: Map<string, OperationExecutionRecord> = fixture.calculate(cache);
      expect(getReusedNames(fixture, first, second)).toEqual(['a', 'd']);
      expect(second.get('b')!.getStateHashComponents().config).toBe('config-edited');
    });

    it('calculates the state hash again when an operation gains or loses a dependency', () => {
      const first: Map<string, OperationExecutionRecord> = fixture.calculate(cache);
      fixture.getOperation('d').addDependency(fixture.getOperation('a'));

      const second: Map<string, OperationExecutionRecord> = fixture.calculate(cache);
      expect(getReusedNames(fixture, first, second)).toEqual(['a', 'b', 'c']);
      expect(second.get('d')!.getStateHashComponents().dependencies).toEqual([
        `a=${second.get('a')!.getStateHash()}`
      ]);

      // c keeps its first dependency, a, and loses its last one, b
      fixture.getOperation('c').deleteDependency(fixture.getOperation('b'));
      const third: Map<string, OperationExecutionRecord> = fixture.calculate(cache);
      expect(getReusedNames(fixture, second, third)).toEqual(['a', 'b', 'd']);
      expect(third.get('c')!.getStateHashComponents().dependencies).toEqual([
        `a=${third.get('a')!.getStateHash()}`
      ]);
    });

    it('calculates the state hash again when a dependency is replaced by one with the same state hash', () => {
      // a and d have the same inputs and no dependencies, so they have the same state hash
      fixture.localHashes.set('d', 'local-a');
      const first: Map<string, OperationExecutionRecord> = fixture.calculate(cache);
      expect(first.get('d')!.getStateHash()).toBe(first.get('a')!.getStateHash());
      fixture.getOperation('b').deleteDependency(fixture.getOperation('a'));
      fixture.getOperation('b').addDependency(fixture.getOperation('d'));

      const second: Map<string, OperationExecutionRecord> = fixture.calculate(cache);
      expect(getReusedNames(fixture, first, second)).toEqual(['a', 'd']);
      expect(second.get('b')!.getStateHashComponents().dependencies).toEqual([
        `d=${second.get('d')!.getStateHash()}`
      ]);
    });

    it('keeps the newest state hash, so that a later iteration without changes reuses it', () => {
      const first: Map<string, OperationExecutionRecord> = fixture.calculate(cache);
      fixture.localHashes.set('b', 'local-b-edited');
      const second: Map<string, OperationExecutionRecord> = fixture.calculate(cache);
      expect(getReusedNames(fixture, first, second)).toEqual(['a', 'd']);

      const third: Map<string, OperationExecutionRecord> = fixture.calculate(cache);
      expect(getReusedNames(fixture, second, third)).toEqual(['a', 'b', 'c', 'd']);

      // Going back to the first inputs calculates the first hashes again
      fixture.localHashes.set('b', 'local-b');
      const fourth: Map<string, OperationExecutionRecord> = fixture.calculate(cache);
      expect(getReusedNames(fixture, third, fourth)).toEqual(['a', 'd']);
      expect(getHashes(fourth)).toEqual(getHashes(first));
    });

    it('calculates every state hash when the context has no cache', () => {
      const first: Map<string, OperationExecutionRecord> = fixture.calculate(undefined);
      const second: Map<string, OperationExecutionRecord> = fixture.calculate(undefined);
      expect(getReusedNames(fixture, first, second)).toEqual([]);
      expect(getHashes(second)).toEqual(getHashes(first));
    });
  });
});
