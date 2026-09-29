// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  Operation,
  OperationGraphHooks,
  OperationStatus,
  type IConfigurableOperation,
  type IInputsSnapshot,
  type IOperationExecutionResult,
  type IOperationRunnerContext,
  type IOperationSettings,
  type IPhase,
  type IOperationGraph,
  type RushConfigurationProject
} from '@microsoft/rush-lib';

import { OperationOutputFingerprints } from '../OperationOutputFingerprints';
import { digestOutputFolders, type IOutputFolderDigest, type IOutputFolderSet } from '../OutputFolderDigest';
import { OutputFolderDigester, type IBackgroundOutputFolderDigests } from '../OutputFolderDigestPool';
import { createDeferred, type IDeferred } from './DaemonRequestWireTestUtilities';

const PHASE: IPhase = { name: '_phase:build', logFilenameIdentifier: '_phase_build' } as IPhase;

interface IReconciliation {
  readonly inputsSnapshot: IInputsSnapshot;
}

interface ITestResult {
  readonly name: string;
  readonly status: OperationStatus;
  /** Defaults to true. */
  readonly enabled?: boolean;
}

function getNames(operations: ReadonlyArray<Operation>): string[] {
  return operations.map((operation: Operation) => operation.associatedProject.packageName);
}

function getProjectNames(folderSets: ReadonlyArray<IOutputFolderSet>): string {
  return folderSets.map(({ projectFolder }: IOutputFolderSet) => path.basename(projectFolder)).join(',');
}

function createInputsSnapshot(): IInputsSnapshot {
  return {} as IInputsSnapshot;
}

/** Digests on the calling thread and logs each call. `start` walks at once, as if the workers were quick. */
class RecordingDigester extends OutputFolderDigester {
  public readonly calls: string[] = [];

  public constructor() {
    super({ threadCount: 0 });
  }

  public override digest(folderSets: ReadonlyArray<IOutputFolderSet>): IOutputFolderDigest[] {
    this.calls.push(`digest ${getProjectNames(folderSets)}`);
    return super.digest(folderSets);
  }

  public override start(folderSets: ReadonlyArray<IOutputFolderSet>): IBackgroundOutputFolderDigests {
    this.calls.push(`start ${getProjectNames(folderSets)}`);
    const digests: IOutputFolderDigest[] = folderSets.map((folderSet: IOutputFolderSet) =>
      digestOutputFolders(folderSet)
    );
    return {
      finish: () => {
        this.calls.push('finish');
        return digests;
      },
      cancel: () => {
        this.calls.push('cancel');
      }
    };
  }

  public takeCalls(): string[] {
    return this.calls.splice(0);
  }
}

/** A graph whose operations have a `lib` output folder with the given number of files. */
class TestGraph {
  public readonly abortController: AbortController = new AbortController();
  public readonly hooks: OperationGraphHooks = new OperationGraphHooks();
  public readonly resultByOperation: Map<Operation, IOperationExecutionResult> = new Map();
  public readonly fingerprints: OperationOutputFingerprints;
  readonly #operations: Map<string, Operation> = new Map();
  readonly #root: string;

  public constructor(root: string, fileCounts: Record<string, number>, digester: OutputFolderDigester) {
    this.#root = root;
    for (const [name, fileCount] of Object.entries(fileCounts)) {
      for (let fileIndex: number = 0; fileIndex < fileCount; fileIndex++) {
        this.addFile(name, `lib/file-${fileIndex}.js`);
      }
      const projectFolder: string = path.join(root, name);
      const project: RushConfigurationProject = {
        packageName: name,
        projectFolder,
        projectRushTempFolder: path.join(projectFolder, 'temp')
      } as RushConfigurationProject;
      const settings: IOperationSettings = { operationName: PHASE.name, outputFolderNames: ['lib'] };
      this.#operations.set(
        name,
        new Operation({ phase: PHASE, project, settings, logFilenameIdentifier: `${name}_build` })
      );
    }
    this.fingerprints = new OperationOutputFingerprints(this as unknown as IOperationGraph, digester);
  }

  public getOperation(name: string): Operation {
    const operation: Operation | undefined = this.#operations.get(name);
    if (!operation) {
      throw new Error(`No operation ${name}`);
    }
    return operation;
  }

  public addFile(name: string, relativePath: string): void {
    const filePath: string = path.join(this.#root, name, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, relativePath);
  }

  /** Runs the operations successfully, which records the fingerprints of their outputs. */
  public async runAsync(...names: string[]): Promise<void> {
    await this.executeAsync(names.map((name: string) => ({ name, status: OperationStatus.Success })));
  }

  /**
   * Reports each result as Rush does: the `afterExecuteOperationAsync` taps run before Rush retains the result, and
   * Rush retains a skipped result only for an enabled operation. `beforeIterationEnds` runs after the last result.
   */
  public async executeAsync(
    results: ReadonlyArray<ITestResult>,
    beforeIterationEnds?: () => void
  ): Promise<void> {
    const records: Map<Operation, IOperationExecutionResult> = new Map();
    for (const { name, status, enabled = true } of results) {
      const operation: Operation = this.getOperation(name);
      const record: IOperationRunnerContext & IOperationExecutionResult = {
        operation,
        status,
        enabled
      } as IOperationRunnerContext & IOperationExecutionResult;
      await this.hooks.afterExecuteOperationAsync.promise(record);
      if (enabled || status !== OperationStatus.Skipped) {
        this.resultByOperation.set(operation, record);
      }
      records.set(operation, record);
    }
    beforeIterationEnds?.();
    await this.hooks.afterExecuteIterationAsync.promise(OperationStatus.Success, records, {});
  }

  public async reconcileAsync(inputsSnapshot: IInputsSnapshot, whileReconciling?: () => void): Promise<void> {
    await this.fingerprints.walkWhileReconcilingAsync(async (): Promise<IReconciliation> => {
      whileReconciling?.();
      return { inputsSnapshot };
    });
  }

  /**
   * Configures an iteration in which Rush would skip every operation but the given ones, and returns the
   * operations that are enabled.
   */
  public configure(
    inputsSnapshot: IInputsSnapshot | undefined,
    enabledByRush: ReadonlyArray<string> = []
  ): string[] {
    const states: Map<Operation, IConfigurableOperation> = new Map();
    for (const [name, operation] of this.#operations) {
      states.set(operation, { enabled: enabledByRush.includes(name) } as IConfigurableOperation);
    }
    this.hooks.configureIteration.call(states, this.resultByOperation, { inputsSnapshot });
    return [...states]
      .filter(([, { enabled }]: [Operation, IConfigurableOperation]) => enabled)
      .map(([operation]: [Operation, IConfigurableOperation]) => operation.associatedProject.packageName);
  }
}

describe(OperationOutputFingerprints.name, () => {
  let root: string;
  let digester: RecordingDigester;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-output-fingerprints-'));
    digester = new RecordingDigester();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function createGraphAsync(): Promise<TestGraph> {
    const graph: TestGraph = new TestGraph(root, { a: 1, b: 2, c: 4 }, digester);
    await graph.runAsync('a', 'b', 'c');
    expect(digester.takeCalls()).toEqual(['digest a', 'digest b', 'digest c']);
    return graph;
  }

  describe('walks while the inputs are reconciled', () => {
    it('uses the digests of that walk for an iteration with the same inputs snapshot', async () => {
      const graph: TestGraph = await createGraphAsync();
      const first: IInputsSnapshot = createInputsSnapshot();
      // The walk ran before this change, so the check misses it, as the inputs snapshot can.
      await graph.reconcileAsync(first, () => graph.addFile('b', 'lib/new.js'));
      expect(graph.configure(first)).toEqual([]);
      expect(digester.takeCalls()).toEqual(['start c,b,a', 'finish']);

      // The operation keeps its recorded fingerprint, so the next request finds the change.
      const second: IInputsSnapshot = createInputsSnapshot();
      await graph.reconcileAsync(second);
      expect(graph.configure(second)).toEqual(['b']);
      expect(digester.takeCalls()).toEqual(['start c,b,a', 'finish']);
    });

    it.each<[string, IInputsSnapshot | undefined, IInputsSnapshot | undefined]>([
      ['another inputs snapshot', createInputsSnapshot(), createInputsSnapshot()],
      ['no inputs snapshot', createInputsSnapshot(), undefined],
      ['no inputs snapshot from the reconciliation', undefined, undefined]
    ])(
      'walks again for an iteration with %s',
      async (
        description: string,
        reconciled: IInputsSnapshot | undefined,
        iteration: IInputsSnapshot | undefined
      ) => {
        const graph: TestGraph = await createGraphAsync();
        await graph.reconcileAsync(reconciled as IInputsSnapshot, () => graph.addFile('b', 'lib/new.js'));
        expect(graph.configure(iteration)).toEqual(['b']);
        expect(digester.takeCalls()).toEqual(['start c,b,a', 'cancel', 'digest c,b,a']);
      }
    );

    it('cancels the walk if the reconciliation fails', async () => {
      const graph: TestGraph = await createGraphAsync();
      await expect(
        graph.fingerprints.walkWhileReconcilingAsync(async (): Promise<IReconciliation> => {
          throw new Error('The reconciliation failed');
        })
      ).rejects.toThrow('The reconciliation failed');
      expect(digester.takeCalls()).toEqual(['start c,b,a', 'cancel']);
      expect(graph.configure(createInputsSnapshot())).toEqual([]);
      expect(digester.takeCalls()).toEqual(['digest c,b,a']);
    });

    it('cancels the walk of a reconciliation that a later one replaced', async () => {
      const graph: TestGraph = await createGraphAsync();
      const earlier: IDeferred<IReconciliation> = createDeferred();
      const earlierReconciliation: Promise<IReconciliation> = graph.fingerprints.walkWhileReconcilingAsync(
        () => earlier.promise
      );
      const later: IInputsSnapshot = createInputsSnapshot();
      await graph.reconcileAsync(later);
      expect(digester.takeCalls()).toEqual(['start c,b,a', 'cancel', 'start c,b,a']);

      earlier.resolve({ inputsSnapshot: createInputsSnapshot() });
      await earlierReconciliation;
      expect(graph.configure(later)).toEqual([]);
      expect(digester.takeCalls()).toEqual(['finish']);
    });

    it('cancels the walk when the graph is closed, and starts none after that', async () => {
      const graph: TestGraph = await createGraphAsync();
      const reconciliation: IDeferred<IReconciliation> = createDeferred();
      const reconciliationPromise: Promise<IReconciliation> = graph.fingerprints.walkWhileReconcilingAsync(
        () => reconciliation.promise
      );
      graph.abortController.abort();
      expect(digester.takeCalls()).toEqual(['start c,b,a', 'cancel']);

      const inputsSnapshot: IInputsSnapshot = createInputsSnapshot();
      reconciliation.resolve({ inputsSnapshot });
      await reconciliationPromise;
      expect(graph.configure(inputsSnapshot)).toEqual([]);
      expect(digester.takeCalls()).toEqual(['digest c,b,a']);

      await graph.reconcileAsync(createInputsSnapshot());
      expect(digester.takeCalls()).toEqual([]);
    });

    it('walks the output folders that the last iteration walked, and others when they are checked', async () => {
      const graph: TestGraph = new TestGraph(root, { a: 1, b: 2, c: 4, d: 8 }, digester);
      await graph.runAsync('a', 'b', 'c', 'd');
      expect(digester.takeCalls()).toEqual(['digest a', 'digest b', 'digest c', 'digest d']);
      const select = (...names: string[]): void => {
        for (const name of ['a', 'b', 'c', 'd']) {
          graph.getOperation(name).enabled = names.includes(name);
        }
      };

      select('a', 'b', 'c');
      const first: IInputsSnapshot = createInputsSnapshot();
      await graph.reconcileAsync(first);
      expect(graph.configure(first)).toEqual([]);
      expect(digester.takeCalls()).toEqual(['start d,c,b,a', 'finish']);

      select('a', 'd');
      graph.addFile('d', 'lib/new.js');
      const second: IInputsSnapshot = createInputsSnapshot();
      await graph.reconcileAsync(second);
      expect(graph.configure(second)).toEqual(['d']);
      expect(digester.takeCalls()).toEqual(['start c,b,a', 'finish', 'digest d']);

      // The walk covers none of the checks.
      select('b');
      const third: IInputsSnapshot = createInputsSnapshot();
      await graph.reconcileAsync(third);
      expect(graph.configure(third)).toEqual([]);
      expect(digester.takeCalls()).toEqual(['start d,a', 'cancel', 'digest b']);
    });

    it('walks only operations that keep a recorded fingerprint and a retained result', async () => {
      const graph: TestGraph = await createGraphAsync();
      fs.rmSync(path.join(root, 'b', 'lib'), { recursive: true });
      expect(
        graph.fingerprints
          .getOperationsWithChangedOutputs()
          .map((operation: Operation) => operation.associatedProject.packageName)
      ).toEqual(['b']);
      graph.resultByOperation.set(graph.getOperation('c'), {
        status: OperationStatus.Failure
      } as IOperationExecutionResult);

      const inputsSnapshot: IInputsSnapshot = createInputsSnapshot();
      await graph.reconcileAsync(inputsSnapshot);
      expect(graph.configure(inputsSnapshot)).toEqual([]);
      expect(digester.takeCalls()).toEqual(['start a', 'finish']);
    });

    it('walks the output folders of operations that ran', async () => {
      const graph: TestGraph = await createGraphAsync();
      const first: IInputsSnapshot = createInputsSnapshot();
      await graph.reconcileAsync(first);
      // Rush runs c, so c is not checked.
      expect(graph.configure(first, ['c'])).toEqual(['c']);
      expect(digester.takeCalls()).toEqual(['start c,b,a', 'finish']);
      await graph.runAsync('c');
      expect(digester.takeCalls()).toEqual(['digest c']);

      const second: IInputsSnapshot = createInputsSnapshot();
      await graph.reconcileAsync(second);
      expect(graph.configure(second)).toEqual([]);
      expect(digester.takeCalls()).toEqual(['start c,b,a', 'finish']);
    });

    it('does not use the digest of other output folders', async () => {
      const graph: TestGraph = await createGraphAsync();
      const inputsSnapshot: IInputsSnapshot = createInputsSnapshot();
      await graph.reconcileAsync(inputsSnapshot);
      graph.addFile('b', 'dist/bundle.js');
      graph.getOperation('b').settings?.outputFolderNames?.push('dist');
      graph.addFile('c', 'dist/bundle.js');
      graph.getOperation('c').settings?.outputFolderNames?.splice(0, 1, 'dist');
      expect(graph.configure(inputsSnapshot)).toEqual(['b', 'c']);
      expect(digester.takeCalls()).toEqual(['start c,b,a', 'finish', 'digest c,b']);
    });

    it('does not start without a pool', async () => {
      const serialDigester: OutputFolderDigester = new OutputFolderDigester({ threadCount: 0 });
      const graph: TestGraph = new TestGraph(root, { a: 1, b: 2 }, serialDigester);
      await graph.runAsync('a', 'b');
      graph.addFile('a', 'lib/new.js');
      const inputsSnapshot: IInputsSnapshot = createInputsSnapshot();
      await graph.reconcileAsync(inputsSnapshot);
      expect(graph.configure(inputsSnapshot)).toEqual(['a']);
    });

    it('finds changes made before the reconciliation with a pool', async () => {
      const poolDigester: OutputFolderDigester = new OutputFolderDigester({
        threadCount: 2,
        poolStartThresholdMs: -1
      });
      try {
        const graph: TestGraph = new TestGraph(root, { a: 1, b: 2, c: 4, d: 8 }, poolDigester);
        await graph.runAsync('a', 'b', 'c', 'd');
        expect(poolDigester.isParallel).toBe(true);

        graph.addFile('b', 'lib/new.js');
        graph.addFile('d', 'lib/nested/new.js');
        const first: IInputsSnapshot = createInputsSnapshot();
        await graph.reconcileAsync(first);
        expect(graph.configure(first)).toEqual(['b', 'd']);

        await graph.runAsync('b', 'd');
        const second: IInputsSnapshot = createInputsSnapshot();
        await graph.reconcileAsync(second);
        expect(graph.configure(second)).toEqual([]);
      } finally {
        poolDigester.dispose();
      }
    });
  });

  describe('records the outputs of each operation when Rush reports its result', () => {
    it('finds a change to an output folder that was made before the iteration ended', async () => {
      const graph: TestGraph = new TestGraph(root, { c: 1, d: 2 }, digester);
      await graph.executeAsync(
        [
          { name: 'd', status: OperationStatus.Success },
          { name: 'c', status: OperationStatus.Success }
        ],
        () => graph.addFile('d', 'lib/race.js')
      );
      expect(getNames(graph.fingerprints.getOperationsWithChangedOutputs())).toEqual(['d']);
      expect(digester.takeCalls()).toEqual(['digest d', 'digest c']);
    });

    it('finds an output file that was edited in place before the iteration ended', async () => {
      const graph: TestGraph = new TestGraph(root, { c: 1, d: 2 }, digester);
      await graph.executeAsync(
        [
          { name: 'd', status: OperationStatus.Success },
          { name: 'c', status: OperationStatus.Success }
        ],
        () => fs.appendFileSync(path.join(root, 'd', 'lib', 'file-0.js'), ' edited')
      );
      // The output folder itself did not change.
      expect(graph.fingerprints.getOperationsWithChangedOutputs()).toEqual([]);
      const first: IInputsSnapshot = createInputsSnapshot();
      await graph.reconcileAsync(first);
      expect(graph.configure(first)).toEqual(['d']);

      await graph.runAsync('d');
      const second: IInputsSnapshot = createInputsSnapshot();
      await graph.reconcileAsync(second);
      expect(graph.configure(second)).toEqual([]);
    });

    it('records restored and up-to-date results, but not failed ones', async () => {
      const graph: TestGraph = new TestGraph(root, { a: 1, b: 2, c: 4 }, digester);
      await graph.runAsync('a', 'b', 'c');
      digester.takeCalls();
      await graph.executeAsync(
        [
          { name: 'a', status: OperationStatus.FromCache },
          { name: 'b', status: OperationStatus.Skipped },
          { name: 'c', status: OperationStatus.Failure }
        ],
        () => {
          for (const name of ['a', 'b', 'c']) {
            graph.addFile(name, 'lib/race.js');
          }
        }
      );
      expect(getNames(graph.fingerprints.getOperationsWithChangedOutputs())).toEqual(['a', 'b']);
      expect(digester.takeCalls()).toEqual(['digest a', 'digest b']);
    });

    it("records a result after Rush's own taps, which use stages up to 1, with the status that they leave", async () => {
      const graph: TestGraph = new TestGraph(root, { a: 1, b: 2 }, digester);
      // A tap of Rush can still change the status of a result, e.g. to one that the graph does not skip.
      graph.hooks.afterExecuteOperationAsync.tap(
        { name: 'LastRushTap', stage: 1 },
        (record: IOperationRunnerContext & IOperationExecutionResult) => {
          const name: string = record.operation.associatedProject.packageName;
          digester.calls.push(`tap ${name}`);
          if (name === 'a') {
            record.status = OperationStatus.SuccessWithWarning;
          }
        }
      );
      await graph.runAsync('a', 'b');
      expect(digester.takeCalls()).toEqual(['tap a', 'tap b', 'digest b']);
    });

    it('keeps the fingerprint of an operation that was skipped while it was disabled', async () => {
      const graph: TestGraph = new TestGraph(root, { a: 1, b: 2 }, digester);
      await graph.runAsync('a', 'b');
      digester.takeCalls();
      await graph.executeAsync([{ name: 'b', status: OperationStatus.Skipped, enabled: false }]);
      expect(digester.takeCalls()).toEqual([]);
      fs.appendFileSync(path.join(root, 'b', 'lib', 'file-0.js'), ' edited');
      expect(graph.configure(undefined)).toEqual(['b']);
    });

    it('records a retained result when the iteration ends if Rush did not report it', async () => {
      const graph: TestGraph = new TestGraph(root, { a: 1 }, digester);
      const operation: Operation = graph.getOperation('a');
      const record: IOperationExecutionResult = {
        operation,
        status: OperationStatus.Success,
        enabled: true
      } as IOperationExecutionResult;
      graph.resultByOperation.set(operation, record);
      await graph.hooks.afterExecuteIterationAsync.promise(
        OperationStatus.Success,
        new Map([[operation, record]]),
        {}
      );
      expect(digester.takeCalls()).toEqual(['digest a']);
      graph.addFile('a', 'lib/new.js');
      expect(getNames(graph.fingerprints.getOperationsWithChangedOutputs())).toEqual(['a']);
    });
  });
});
