// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import {
  type IOperationRunner,
  type IOperationRunnerContext,
  Operation,
  OperationExecutionManager as LibraryOperationExecutionManager,
  OperationGroupRecord,
  OperationStatus
} from '@rushstack/operation-graph';

import { OperationExecutionManager as HeftOperationExecutionManager } from '../OperationExecutionManager';

// Heft's OperationExecutionManager is meant to behave exactly like the one in @rushstack/operation-graph,
// except for how quickly it starts newly-ready operations. These tests run both on the same graphs and
// compare everything that is observable: hook calls, log output, operation states and the overall result.

interface IOperationSpec {
  name: string;
  group?: string;
  dependencies?: string[];
  silent?: boolean;
  weight?: number;
  result?: OperationStatus | 'throw';
  // Number of microtask turns the runner takes to complete
  ticks?: number;
}

interface IRunOptions {
  parallelism: number;
  abortAfter?: string;
  preAborted?: boolean;
}

interface IExecutionRecord {
  events: string[];
  output: string;
  status: OperationStatus;
  states: string[];
}

interface IExecutionManager {
  executeAsync: LibraryOperationExecutionManager['executeAsync'];
}

type ExecutionManagerFactory = (operations: ReadonlySet<Operation>) => IExecutionManager;

const createLibraryExecutionManager: ExecutionManagerFactory = (operations) =>
  new LibraryOperationExecutionManager(operations);
const createHeftExecutionManager: ExecutionManagerFactory = (operations) =>
  new HeftOperationExecutionManager(operations);

class RecordingRunner implements IOperationRunner {
  public readonly name: string;
  public readonly silent: boolean;
  readonly #spec: IOperationSpec;
  readonly #events: string[];
  readonly #onDone: (name: string) => void;

  public constructor(spec: IOperationSpec, events: string[], onDone: (name: string) => void) {
    this.name = spec.name;
    this.silent = !!spec.silent;
    this.#spec = spec;
    this.#events = events;
    this.#onDone = onDone;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    this.#events.push(`run:${this.name}:${context.isFirstRun}`);
    for (let i: number = 0; i < (this.#spec.ticks ?? 0); i++) {
      await Promise.resolve();
    }
    this.#events.push(`done:${this.name}`);
    this.#onDone(this.name);
    if (this.#spec.result === 'throw') {
      throw new Error(`${this.name} threw`);
    }
    return this.#spec.result ?? OperationStatus.Success;
  }
}

async function runAsync(
  createExecutionManager: ExecutionManagerFactory,
  specs: IOperationSpec[],
  options: IRunOptions
): Promise<IExecutionRecord> {
  const events: string[] = [];
  const abortController: AbortController = new AbortController();
  const onDone = (name: string): void => {
    if (name === options.abortAfter) {
      abortController.abort();
    }
  };

  const groups: Map<string, OperationGroupRecord> = new Map();
  const operations: Map<string, Operation> = new Map();
  for (const spec of specs) {
    let group: OperationGroupRecord | undefined;
    if (spec.group) {
      group = groups.get(spec.group);
      if (!group) {
        group = new OperationGroupRecord(spec.group);
        groups.set(spec.group, group);
      }
    }
    operations.set(
      spec.name,
      new Operation({
        name: spec.name,
        group,
        weight: spec.weight,
        runner: new RecordingRunner(spec, events, onDone)
      })
    );
  }
  for (const spec of specs) {
    for (const dependency of spec.dependencies ?? []) {
      operations.get(spec.name)!.addDependency(operations.get(dependency)!);
    }
  }

  const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
  const manager: IExecutionManager = createExecutionManager(new Set(operations.values()));
  if (options.preAborted) {
    abortController.abort();
  }
  const status: OperationStatus = await manager.executeAsync({
    abortSignal: abortController.signal,
    parallelism: options.parallelism,
    terminal: new Terminal(terminalProvider),
    beforeExecuteOperation: (operation: Operation) => events.push(`before:${operation.name}`),
    afterExecuteOperation: (operation: Operation) => events.push(`after:${operation.name}`),
    beforeExecuteOperationGroup: (group: OperationGroupRecord) => events.push(`group-start:${group.name}`),
    afterExecuteOperationGroup: (group: OperationGroupRecord) => events.push(`group-end:${group.name}`)
  });

  const output: string = [
    terminalProvider.getOutput({ normalizeSpecialCharacters: true }),
    terminalProvider.getVerboseOutput({ normalizeSpecialCharacters: true }),
    terminalProvider.getErrorOutput({ normalizeSpecialCharacters: true })
  ]
    .join('\n')
    .replace(/\(\d+\.\d+s\)/g, '(<duration>)');
  const states: string[] = Array.from(operations.values(), (operation: Operation) => {
    return `${operation.name}:${operation.state?.status}:${operation.state?.error?.message ?? ''}`;
  });
  return { events, output, status, states };
}

async function expectSameBehaviorAsync(
  specs: IOperationSpec[],
  options: IRunOptions
): Promise<IExecutionRecord> {
  const expected: IExecutionRecord = await runAsync(createLibraryExecutionManager, specs, options);
  const actual: IExecutionRecord = await runAsync(createHeftExecutionManager, specs, options);
  expect(actual).toEqual(expected);
  return actual;
}

// A two-phase graph shaped like the one that heft generates: a silent operation per phase, which the
// phase's tasks depend on, and which depends on all tasks of the phases it consumes.
const heftLikeGraph: IOperationSpec[] = [
  { name: 'build', group: 'build', silent: true },
  { name: 'typescript', group: 'build', dependencies: ['build'], ticks: 3 },
  { name: 'lint', group: 'build', dependencies: ['build', 'typescript'], ticks: 1 },
  { name: 'api-extractor', group: 'build', dependencies: ['build', 'typescript'], ticks: 2 },
  { name: 'copy', group: 'build', dependencies: ['build'] },
  { name: 'test', group: 'test', silent: true, dependencies: ['build', 'typescript', 'lint', 'copy'] },
  { name: 'jest', group: 'test', dependencies: ['test'], ticks: 4 },
  { name: 'report', group: 'test', dependencies: ['test', 'jest'] }
];

describe('OperationExecutionManager (heft)', () => {
  it('matches @rushstack/operation-graph for a heft-like graph', async () => {
    for (const parallelism of [1, 2, 8]) {
      const record: IExecutionRecord = await expectSameBehaviorAsync(heftLikeGraph, { parallelism });
      expect(record.status).toEqual(OperationStatus.Success);
    }
  });

  it('matches @rushstack/operation-graph when many operations become ready at the same time', async () => {
    const specs: IOperationSpec[] = [{ name: 'root', group: 'g', silent: true }];
    for (let i: number = 0; i < 20; i++) {
      specs.push({ name: `op${i}`, group: 'g', dependencies: ['root'], weight: (i * 7) % 5, ticks: i % 3 });
    }
    for (let i: number = 0; i < 10; i++) {
      specs.push({ name: `tail${i}`, group: 'h', dependencies: [`op${i}`, `op${19 - i}`], ticks: i % 2 });
    }
    for (const parallelism of [1, 3, 16]) {
      await expectSameBehaviorAsync(specs, { parallelism });
    }
  });

  it('matches @rushstack/operation-graph when operations fail or throw', async () => {
    const specs: IOperationSpec[] = heftLikeGraph.map((spec: IOperationSpec) => {
      if (spec.name === 'typescript') {
        return { ...spec, result: OperationStatus.Failure };
      } else if (spec.name === 'copy') {
        return { ...spec, result: 'throw' };
      } else {
        return spec;
      }
    });
    const record: IExecutionRecord = await expectSameBehaviorAsync(specs, { parallelism: 4 });
    expect(record.status).toEqual(OperationStatus.Failure);
  });

  it('matches @rushstack/operation-graph when execution is aborted', async () => {
    const record: IExecutionRecord = await expectSameBehaviorAsync(heftLikeGraph, {
      parallelism: 2,
      abortAfter: 'lint'
    });
    expect(record.status).toEqual(OperationStatus.Aborted);

    const preAbortedRecord: IExecutionRecord = await expectSameBehaviorAsync(heftLikeGraph, {
      parallelism: 2,
      preAborted: true
    });
    expect(preAbortedRecord.status).toEqual(OperationStatus.Aborted);
  });

  it('matches @rushstack/operation-graph when there is nothing to run', async () => {
    const record: IExecutionRecord = await expectSameBehaviorAsync(
      [{ name: 'only-silent', group: 'g', silent: true }],
      { parallelism: 4 }
    );
    expect(record.status).toEqual(OperationStatus.NoOp);
  });

  it('reports dependency cycles like @rushstack/operation-graph', () => {
    const createCycle = (): Set<Operation> => {
      const a: Operation = new Operation({ name: 'a' });
      const b: Operation = new Operation({ name: 'b' });
      const c: Operation = new Operation({ name: 'c' });
      a.addDependency(b);
      b.addDependency(c);
      c.addDependency(a);
      return new Set([a, b, c]);
    };

    let expectedMessage: string | undefined;
    try {
      createLibraryExecutionManager(createCycle());
    } catch (e) {
      expectedMessage = (e as Error).message;
    }
    expect(expectedMessage).toMatch(/^A cyclic dependency was encountered:/);
    expect(() => createHeftExecutionManager(createCycle())).toThrow(expectedMessage);
  });

  it('rejects dependencies that are not in the set of operations like @rushstack/operation-graph', () => {
    const createOperations = (): Set<Operation> => {
      const a: Operation = new Operation({ name: 'a' });
      const b: Operation = new Operation({ name: 'b' });
      a.addDependency(b);
      return new Set([a]);
    };
    const expectedMessage: string =
      'Operation "a" declares a dependency on operation "b" that is not in the set of operations to execute.';
    expect(() => createLibraryExecutionManager(createOperations())).toThrow(expectedMessage);
    expect(() => createHeftExecutionManager(createOperations())).toThrow(expectedMessage);
  });
});
