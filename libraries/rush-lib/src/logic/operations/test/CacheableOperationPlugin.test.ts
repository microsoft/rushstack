// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../../../utilities/Utilities');
jest.mock('../OperationStateFile');
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
jest.mock('../OperationMetadataManager', () => {
  class MockOperationMetadataManager {
    public readonly logFilenameIdentifier: string;
    public readonly metadataFolderPath: string = '.rush/temp/operation/mock';
    public readonly stateFile: { state: undefined } = { state: undefined };
    public constructor({ operation }: { operation: { logFilenameIdentifier: string } }) {
      this.logFilenameIdentifier = operation.logFilenameIdentifier;
    }
    public async saveAsync(): Promise<void> {
      /* noop */
    }
    public async tryRestoreAsync(): Promise<void> {
      /* noop */
    }
    public tryRestoreStopwatch<T>(originalStopwatch: T): T {
      return originalStopwatch;
    }
  }
  return { OperationMetadataManager: MockOperationMetadataManager };
});
jest.mock('../../buildCache/OperationBuildCache', () => ({
  OperationBuildCache: { forOperation: jest.fn() }
}));
jest.mock('@rushstack/package-deps-hash', () => {
  const actual: typeof import('@rushstack/package-deps-hash') = jest.requireActual(
    '@rushstack/package-deps-hash'
  );
  return { ...actual, hashFilesAsync: jest.fn(actual.hashFilesAsync) };
});
jest.mock('../InputFilesStatSignature', () => {
  const actual: typeof import('../InputFilesStatSignature') = jest.requireActual(
    '../InputFilesStatSignature'
  );
  return { ...actual, captureInputFilesState: jest.fn(actual.captureInputFilesState) };
});

import * as child_process from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { hashFilesAsync } from '@rushstack/package-deps-hash';
import { MockWritable, StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { BuildCacheConfiguration } from '../../../api/BuildCacheConfiguration';
import type { CobuildConfiguration } from '../../../api/CobuildConfiguration';
import type { RushProjectConfiguration } from '../../../api/RushProjectConfiguration';
import { PhasedCommandHooks, type IOperationGraphContext } from '../../../pluginFramework/PhasedCommandHooks';
import type { IInputsSnapshot } from '../../incremental/InputsSnapshot';
import { OperationBuildCache } from '../../buildCache/OperationBuildCache';
import { CacheableOperationPlugin } from '../CacheableOperationPlugin';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import { OperationGraph } from '../OperationGraph';
import { Operation } from '../Operation';
import { OperationStatus } from '../OperationStatus';
import type { IOperationRunner, IOperationRunnerContext } from '../IOperationRunner';
import type { IExecutionResult, IOperationExecutionResult } from '../IOperationExecutionResult';
import type { IOperationGraphExtensionResult } from '../IOperationGraph';
import type { OperationExecutionRecord } from '../OperationExecutionRecord';
import {
  captureInputFilesState,
  FILE_TIME_TOLERANCE_MS,
  type IInputFilesState
} from '../InputFilesStatSignature';
import { areInputFilesChecked, CAPTURE_INPUT_FILES_STAGE } from '../RetainedResultVerification';

const mockPhase: IPhase = {
  name: 'phase',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: { self: new Set(), upstream: new Set() },
  isSynthetic: false,
  logFilenameIdentifier: 'phase',
  missingScriptBehavior: 'silent'
};

class CacheableMockRunner implements IOperationRunner {
  public readonly reportTiming: boolean = true;
  public readonly silent: boolean = false;
  public readonly cacheable: boolean = true;
  public readonly warningsAreAllowed: boolean = false;
  public readonly isNoOp: boolean = false;
  public readonly name: string;
  readonly #executions: string[];
  readonly #onExecute: ((name: string) => void) | undefined;

  public constructor(name: string, executions: string[], onExecute?: (name: string) => void) {
    this.name = name;
    this.#executions = executions;
    this.#onExecute = onExecute;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    this.#executions.push(this.name);
    this.#onExecute?.(this.name);
    return OperationStatus.Success;
  }

  public getConfigHash(): string {
    return 'config';
  }
}

interface ITestGraph {
  graph: OperationGraph;
  operations: Map<string, Operation>;
  localHashes: Map<string, string>;
  // The tracked input file hashes of each operation in the inputs snapshot, by name
  trackedFileHashes: Map<string, Map<string, string>>;
  // The reason that caching is disabled for each operation, by name. Undefined if caching is allowed.
  cacheDisabledReasons: Map<string, string>;
  // The names of the operations whose reason that caching is disabled was computed, in order
  cacheDisabledReasonComputations: string[];
  executions: string[];
  cacheWrites: string[];
  // The names of the operations that are restored from the build cache
  cacheHits: Set<string>;
  // The hashes of the inputs snapshot, by path relative to the root directory
  snapshotHashes: Map<string, string>;
  // Called when an operation executes, e.g. to save one of its input files while it executes
  onExecute: ((name: string) => void) | undefined;
  // An inputs snapshot of the current local hashes and tracked file hashes
  createInputsSnapshot(workingTreeReadStartTimeMs?: number): IInputsSnapshot;
  executeAsync(
    workingTreeReadStartTimeMs?: number,
    holdUnneededOperations?: boolean
  ): Promise<IExecutionResult>;
}

/**
 * Creates a linear chain of cacheable operations: names[0] <- names[1] <- ... (each depends on the previous).
 */
async function createTestGraphAsync(
  names: string[],
  rootDirectory: string = '/repo',
  cacheWriteEnabled: boolean = true,
  cobuildConfiguration: CobuildConfiguration | undefined = undefined
): Promise<ITestGraph> {
  const executions: string[] = [];
  const cacheWrites: string[] = [];
  const cacheHits: Set<string> = new Set();
  const snapshotHashes: Map<string, string> = new Map();
  const localHashes: Map<string, string> = new Map();
  const trackedFileHashes: Map<string, Map<string, string>> = new Map();
  const cacheDisabledReasons: Map<string, string> = new Map();
  const cacheDisabledReasonComputations: string[] = [];
  const operations: Map<string, Operation> = new Map();
  const projectConfigurations: Map<RushConfigurationProject, RushProjectConfiguration> = new Map();
  let onExecute: ((name: string) => void) | undefined;

  let previous: Operation | undefined;
  for (const name of names) {
    const project: RushConfigurationProject = {
      packageName: name,
      projectFolder: `${rootDirectory}/${name}`
    } as unknown as RushConfigurationProject;
    projectConfigurations.set(project, {
      getCacheDisabledReason: (trackedFileNames: Iterable<string>) => {
        cacheDisabledReasonComputations.push(name);
        // Like RushProjectConfiguration, which disables caching if Git tracks a file in an output folder
        const trackedOutputFile: string | undefined = [...trackedFileNames].find((file: string) =>
          file.startsWith(`${name}/lib/`)
        );
        return (
          cacheDisabledReasons.get(name) ??
          (trackedOutputFile ? `Git tracks the output file "${trackedOutputFile}".` : undefined)
        );
      }
    } as unknown as RushProjectConfiguration);
    const operation: Operation = new Operation({
      runner: new CacheableMockRunner(name, executions, (executedName: string) => onExecute?.(executedName)),
      logFilenameIdentifier: name,
      phase: mockPhase,
      project
    });
    if (previous) {
      operation.addDependency(previous);
    }
    previous = operation;
    operations.set(name, operation);
    localHashes.set(name, `${name}-v1`);
  }

  jest.mocked(OperationBuildCache.forOperation).mockImplementation(
    (record) =>
      ({
        tryRestoreFromCacheAsync: async () => cacheHits.has(record.operation.associatedProject.packageName),
        trySetCacheEntryAsync: async () => {
          cacheWrites.push(record.operation.associatedProject.packageName);
          return true;
        }
      }) as unknown as OperationBuildCache
  );

  const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
  const hooks: PhasedCommandHooks = new PhasedCommandHooks();
  new PhasedOperationPlugin().apply(hooks);
  new CacheableOperationPlugin({
    allowWarningsInSuccessfulBuild: false,
    buildCacheConfiguration: {
      buildCacheEnabled: true,
      cacheWriteEnabled
    } as unknown as BuildCacheConfiguration,
    cobuildConfiguration,
    terminal,
    excludeAppleDoubleFiles: false,
    useDirectFileTransfersForBuildCache: false
  }).apply(hooks);

  const graph: OperationGraph = new OperationGraph(new Set(operations.values()), {
    quietMode: true,
    debugMode: false,
    parallelism: 1,
    allowOversubscription: true,
    destinations: [new MockWritable()],
    abortController: new AbortController()
  });
  await hooks.onGraphCreatedAsync.promise(graph, {
    isIncrementalBuildAllowed: true,
    projectConfigurations
  } as unknown as IOperationGraphContext);

  const createInputsSnapshot = (workingTreeReadStartTimeMs?: number): IInputsSnapshot => {
    const snapshotLocalHashes: Map<string, string> = new Map(localHashes);
    const snapshotTrackedFileHashes: Map<string, Map<string, string>> = new Map(trackedFileHashes);
    return {
      hashes: new Map(snapshotHashes),
      rootDirectory,
      hasUncommittedChanges: false,
      workingTreeReadStartTimeMs,
      getTrackedFileHashesForOperation: (project: RushConfigurationProject) =>
        snapshotTrackedFileHashes.get(project.packageName) ?? new Map(),
      getOperationOwnStateHash: (project: RushConfigurationProject) =>
        snapshotLocalHashes.get(project.packageName)!
    };
  };

  return {
    graph,
    operations,
    localHashes,
    trackedFileHashes,
    cacheDisabledReasons,
    cacheDisabledReasonComputations,
    executions,
    cacheWrites,
    cacheHits,
    snapshotHashes,
    get onExecute(): ((name: string) => void) | undefined {
      return onExecute;
    },
    set onExecute(value: ((name: string) => void) | undefined) {
      onExecute = value;
    },
    createInputsSnapshot,
    executeAsync: async (workingTreeReadStartTimeMs?: number, holdUnneededOperations?: boolean) => {
      executions.length = 0;
      cacheWrites.length = 0;
      cacheDisabledReasonComputations.length = 0;
      return await graph.executeAsync({
        inputsSnapshot: createInputsSnapshot(workingTreeReadStartTimeMs),
        holdUnneededOperations
      });
    }
  };
}

function getGitBlobHash(content: string): string {
  return crypto
    .createHash('sha1')
    .update(`blob ${Buffer.byteLength(content)}\0${content}`)
    .digest('hex');
}

function getLatestFileTimeMs(filePath: string): number {
  const { mtimeNs, ctimeNs } = fs.statSync(filePath, { bigint: true });
  return Number((mtimeNs > ctimeNs ? mtimeNs : ctimeNs) / BigInt(1000000));
}

function getStatus(testGraph: ITestGraph, result: IExecutionResult, name: string): OperationStatus {
  return (result.operationResults.get(testGraph.operations.get(name)!) as OperationExecutionRecord).status;
}

describe(CacheableOperationPlugin.name, () => {
  beforeEach(() => {
    jest.mocked(hashFilesAsync).mockClear();
  });

  it('writes cache entries for all operations in a cold iteration', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);

    const result: IExecutionResult = await testGraph.executeAsync();

    expect(result.status).toBe(OperationStatus.Success);
    expect(testGraph.executions).toEqual(['a', 'b']);
    expect(testGraph.cacheWrites).toEqual(['a', 'b']);
  });

  it('writes a cache entry for an operation whose dependencies were retained from a previous iteration', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c']);
    await testGraph.executeAsync();

    testGraph.localHashes.set('c', 'c-v2');
    const result: IExecutionResult = await testGraph.executeAsync();

    expect(result.status).toBe(OperationStatus.Success);
    expect(getStatus(testGraph, result, 'a')).toBe(OperationStatus.Skipped);
    expect(getStatus(testGraph, result, 'b')).toBe(OperationStatus.Skipped);
    expect(testGraph.executions).toEqual(['c']);
    expect(testGraph.cacheWrites).toEqual(['c']);
  });

  it('keeps allowing cache writes across several warm iterations', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c']);
    await testGraph.executeAsync();

    testGraph.localHashes.set('b', 'b-v2');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b', 'c']);
    expect(testGraph.cacheWrites).toEqual(['b', 'c']);

    testGraph.localHashes.set('c', 'c-v2');
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['c']);
    expect(testGraph.cacheWrites).toEqual(['c']);
  });

  it('does not write a cache entry when a dependency that was not selected (e.g. --only) is trusted at its state hash', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    await testGraph.executeAsync();

    testGraph.operations.get('a')!.enabled = false;
    testGraph.localHashes.set('b', 'b-v2');
    const result: IExecutionResult = await testGraph.executeAsync();

    // The outputs of "a" are not part of its state hash, and this iteration did not verify them.
    expect(getStatus(testGraph, result, 'a')).toBe(OperationStatus.Skipped);
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual([]);
  });

  it('does not write a cache entry when a dependency that was not selected (e.g. --only) has changed', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    await testGraph.executeAsync();

    testGraph.operations.get('a')!.enabled = false;
    testGraph.localHashes.set('a', 'a-v2');
    testGraph.localHashes.set('b', 'b-v2');
    const result: IExecutionResult = await testGraph.executeAsync();

    expect(getStatus(testGraph, result, 'a')).toBe(OperationStatus.Skipped);
    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual([]);
  });

  it('does not write a cache entry when a dependency was never executed (cold --only)', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b']);
    testGraph.operations.get('a')!.enabled = false;

    await testGraph.executeAsync();

    expect(testGraph.executions).toEqual(['b']);
    expect(testGraph.cacheWrites).toEqual([]);
  });

  it('re-executes a retained result that was produced while one of its dependencies was skipped', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c']);
    const a: Operation = testGraph.operations.get('a')!;

    // Iteration 1: "a" is skipped by the user, so "b" and "c" execute without writing cache entries.
    a.enabled = false;
    await testGraph.executeAsync();
    expect(testGraph.executions).toEqual(['b', 'c']);
    expect(testGraph.cacheWrites).toEqual([]);

    // Iteration 2: "a" executes for the first time, "b" is retained (same state hash), "c" changed.
    a.enabled = true;
    testGraph.localHashes.set('c', 'c-v2');
    const result: IExecutionResult = await testGraph.executeAsync();

    // "b" was built against an unknown "a", so it must not be skipped now that "a" has executed.
    expect(getStatus(testGraph, result, 'b')).toBe(OperationStatus.Success);
    expect(testGraph.executions).toEqual(['a', 'b', 'c']);
    expect(testGraph.cacheWrites).toEqual(['a', 'b', 'c']);
  });

  it('does not trust results whose state hash changed without re-execution', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c']);
    await testGraph.executeAsync();

    // "b" ignores dependency changes, so it is not re-run when "a" changes, but its state hash changes.
    testGraph.operations.get('b')!.enabled = 'ignore-dependency-changes';
    testGraph.localHashes.set('a', 'a-v2');
    testGraph.localHashes.set('c', 'c-v2');
    const result: IExecutionResult = await testGraph.executeAsync();

    expect(getStatus(testGraph, result, 'b')).toBe(OperationStatus.Skipped);
    expect(testGraph.executions).toEqual(['a', 'c']);
    expect(testGraph.cacheWrites).toEqual(['a']);
  });

  describe('input files saved while the inputs snapshot was being taken', () => {
    const inputFile: string = 'a/src/index.ts';
    let rootDirectory: string;

    beforeEach(() => {
      rootDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rush-cacheable-')));
      fs.mkdirSync(path.join(rootDirectory, 'a', 'src'), { recursive: true });
      fs.writeFileSync(path.join(rootDirectory, inputFile), 'export const a = 2;');
    });

    afterEach(() => {
      fs.rmSync(rootDirectory, { recursive: true, force: true });
    });

    it('does not write cache entries if Git hashed the file before it was saved', async () => {
      const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b'], rootDirectory);
      testGraph.trackedFileHashes.set('a', new Map([[inputFile, getGitBlobHash('export const a = 1;')]]));

      await testGraph.executeAsync(Date.now());

      expect(testGraph.executions).toEqual(['a', 'b']);
      // "b" consumed outputs of "a" that do not match the state hash of "a", so it must not write either.
      expect(testGraph.cacheWrites).toEqual([]);
      expect(jest.mocked(hashFilesAsync)).toHaveBeenCalledTimes(1);
      expect(jest.mocked(hashFilesAsync).mock.calls[0].slice(0, 2)).toEqual([rootDirectory, [inputFile]]);

      // The next snapshot hashes the saved content, so the outputs are rebuilt and cached.
      testGraph.trackedFileHashes.set('a', new Map([[inputFile, getGitBlobHash('export const a = 2;')]]));
      testGraph.localHashes.set('a', 'a-v2');
      await testGraph.executeAsync(
        getLatestFileTimeMs(path.join(rootDirectory, inputFile)) + FILE_TIME_TOLERANCE_MS + 1
      );

      expect(testGraph.executions).toEqual(['a', 'b']);
      expect(testGraph.cacheWrites).toEqual(['a', 'b']);
    });

    it('writes cache entries if Git hashed the file after it was saved', async () => {
      const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b'], rootDirectory);
      testGraph.trackedFileHashes.set('a', new Map([[inputFile, getGitBlobHash('export const a = 2;')]]));

      await testGraph.executeAsync(Date.now());

      expect(testGraph.executions).toEqual(['a', 'b']);
      expect(testGraph.cacheWrites).toEqual(['a', 'b']);
      // The file has its snapshot hash, so Git is not asked about it
      expect(jest.mocked(hashFilesAsync)).not.toHaveBeenCalled();
    });

    it('does not hash files that were saved before the snapshot started', async () => {
      const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b'], rootDirectory);
      testGraph.trackedFileHashes.set('a', new Map([[inputFile, getGitBlobHash('export const a = 2;')]]));

      await testGraph.executeAsync(
        getLatestFileTimeMs(path.join(rootDirectory, inputFile)) + FILE_TIME_TOLERANCE_MS + 1
      );

      expect(testGraph.cacheWrites).toEqual(['a', 'b']);
      expect(jest.mocked(hashFilesAsync)).not.toHaveBeenCalled();
    });

    it.each([true, false])(
      'runs the operations again if a later snapshot has the same state hashes (cache writes enabled: %s)',
      async (cacheWriteEnabled: boolean) => {
        const testGraph: ITestGraph = await createTestGraphAsync(
          ['a', 'b'],
          rootDirectory,
          cacheWriteEnabled
        );
        const inputFilePath: string = path.join(rootDirectory, inputFile);
        testGraph.trackedFileHashes.set('a', new Map([[inputFile, getGitBlobHash('export const a = 1;')]]));

        await testGraph.executeAsync(Date.now());
        expect(testGraph.executions).toEqual(['a', 'b']);
        expect(testGraph.cacheWrites).toEqual([]);

        // Reverting the save gives the next snapshot the same state hashes, but the outputs of "a" and "b" were
        // built from the saved content.
        fs.writeFileSync(inputFilePath, 'export const a = 1;');
        const afterRevertMs: number = getLatestFileTimeMs(inputFilePath) + FILE_TIME_TOLERANCE_MS + 1;
        await testGraph.executeAsync(afterRevertMs);
        expect(testGraph.executions).toEqual(['a', 'b']);
        expect(testGraph.cacheWrites).toEqual(cacheWriteEnabled ? ['a', 'b'] : []);

        const hotResult: IExecutionResult = await testGraph.executeAsync(afterRevertMs);
        expect(hotResult.status).toBe(OperationStatus.NoOp);
        expect(testGraph.executions).toEqual([]);
      }
    );
  });

  describe('input files saved while an operation executes', () => {
    const inputFile: string = 'a/src/index.ts';
    let rootDirectory: string;
    let inputFilePath: string;

    beforeEach(() => {
      rootDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rush-cacheable-')));
      fs.mkdirSync(path.join(rootDirectory, 'a', 'src'), { recursive: true });
      inputFilePath = path.join(rootDirectory, inputFile);
      fs.writeFileSync(inputFilePath, 'export const a = 1;');
    });

    afterEach(() => {
      fs.rmSync(rootDirectory, { recursive: true, force: true });
    });

    it.each([true, false])(
      'runs the operations again if a later snapshot has the same state hashes (cache writes enabled: %s)',
      async (cacheWriteEnabled: boolean) => {
        const testGraph: ITestGraph = await createTestGraphAsync(
          ['a', 'b'],
          rootDirectory,
          cacheWriteEnabled
        );
        testGraph.trackedFileHashes.set('a', new Map([[inputFile, getGitBlobHash('export const a = 1;')]]));
        const afterWriteMs: number = getLatestFileTimeMs(inputFilePath) + FILE_TIME_TOLERANCE_MS + 1;
        testGraph.onExecute = (name: string) => {
          if (name === 'a') {
            // A different size, so that the save is detected even if the file time does not change
            fs.writeFileSync(inputFilePath, 'export const a = 22;');
          }
        };

        await testGraph.executeAsync(afterWriteMs);
        expect(testGraph.executions).toEqual(['a', 'b']);
        expect(testGraph.cacheWrites).toEqual([]);

        // Reverting the save gives the next snapshot the same state hashes, but the outputs of "a" and "b" may
        // have been built from the saved content.
        testGraph.onExecute = undefined;
        fs.writeFileSync(inputFilePath, 'export const a = 1;');
        const afterRevertMs: number = getLatestFileTimeMs(inputFilePath) + FILE_TIME_TOLERANCE_MS + 1;
        await testGraph.executeAsync(afterRevertMs);
        expect(testGraph.executions).toEqual(['a', 'b']);
        expect(testGraph.cacheWrites).toEqual(cacheWriteEnabled ? ['a', 'b'] : []);

        const hotResult: IExecutionResult = await testGraph.executeAsync(afterRevertMs);
        expect(hotResult.status).toBe(OperationStatus.NoOp);
        expect(testGraph.executions).toEqual([]);
      }
    );
  });

  describe('input files that change after the inputs snapshot and before an operation executes', () => {
    const names: string[] = ['a', 'b', 'c'];
    let rootDirectory: string;

    function getInputFile(name: string): string {
      return `${name}/src/index.ts`;
    }

    beforeEach(() => {
      rootDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rush-cacheable-')));
      for (const name of names) {
        fs.mkdirSync(path.join(rootDirectory, name, 'src'), { recursive: true });
        fs.writeFileSync(path.join(rootDirectory, getInputFile(name)), `export const ${name} = 1;`);
      }
      // So that Git can tell which new files are ignored
      child_process.execFileSync('git', ['init', '-q'], { cwd: rootDirectory, stdio: 'ignore' });
      fs.writeFileSync(path.join(rootDirectory, '.gitignore'), '*.log\n');
      jest.mocked(captureInputFilesState).mockClear();
    });

    afterEach(() => {
      fs.rmSync(rootDirectory, { recursive: true, force: true });
    });

    async function createGraphWithInputFilesAsync(): Promise<ITestGraph> {
      const testGraph: ITestGraph = await createTestGraphAsync(names, rootDirectory);
      for (const name of names) {
        const hash: string = getGitBlobHash(`export const ${name} = 1;`);
        testGraph.trackedFileHashes.set(name, new Map([[getInputFile(name), hash]]));
        testGraph.snapshotHashes.set(getInputFile(name), hash);
      }
      return testGraph;
    }

    // The names of the operations whose input files were captured, in order
    function getCapturedOperationNames(): string[] {
      return jest
        .mocked(captureInputFilesState)
        .mock.results.map(
          ({ value }) =>
            path.relative(rootDirectory, (value as IInputFilesState).filePaths[0]).split(path.sep)[0]
        );
    }

    // Like a save after the inputs snapshot read the working tree, and before the operation starts
    function changeBeforeExecuting(testGraph: ITestGraph, name: string, change: () => void): void {
      let pendingChange: (() => void) | undefined = change;
      testGraph.graph.hooks.beforeExecuteOperationAsync.tap(
        { name: 'changeBeforeExecuting', stage: CAPTURE_INPUT_FILES_STAGE - 1 },
        (record: IOperationRunnerContext & IOperationExecutionResult): undefined => {
          if (record.operation.associatedProject.packageName === name) {
            pendingChange?.();
            pendingChange = undefined;
          }
          return undefined;
        }
      );
    }

    it('captures the input files of only the operations that execute', async () => {
      const testGraph: ITestGraph = await createGraphWithInputFilesAsync();
      testGraph.cacheHits.add('a');
      // Like a plugin that skips an operation whose outputs are up to date, if there is no cache entry for it
      testGraph.graph.hooks.beforeExecuteOperationAsync.tap(
        { name: 'test', stage: 10 },
        (record: IOperationRunnerContext & IOperationExecutionResult): OperationStatus | undefined =>
          record.operation.associatedProject.packageName === 'b' ? OperationStatus.Skipped : undefined
      );

      const result: IExecutionResult = await testGraph.executeAsync();

      expect(getStatus(testGraph, result, 'a')).toBe(OperationStatus.FromCache);
      expect(getStatus(testGraph, result, 'b')).toBe(OperationStatus.Skipped);
      expect(testGraph.executions).toEqual(['c']);
      expect(getCapturedOperationNames()).toEqual(['c']);
    });

    it('checks the input files of an operation that a plugin made cacheable again after the iteration started', async () => {
      const testGraph: ITestGraph = await createGraphWithInputFilesAsync();
      const runner: { cacheable: boolean } = testGraph.operations.get('a')!.runner as { cacheable: boolean };
      // Like a plugin that marks the runner of an operation that it skips as not cacheable, and resets the runner
      // in a tap that runs after that of CacheableOperationPlugin.
      let skipsOperation: boolean = true;
      testGraph.graph.hooks.beforeExecuteIterationAsync.tap('test', (): undefined => {
        runner.cacheable = true;
        return undefined;
      });
      testGraph.graph.hooks.beforeExecuteOperationAsync.tap(
        { name: 'test', stage: -1000 },
        (record: IOperationRunnerContext & IOperationExecutionResult): OperationStatus | undefined => {
          if (skipsOperation && record.operation.associatedProject.packageName === 'a') {
            runner.cacheable = false;
            return OperationStatus.Skipped;
          }
          return undefined;
        }
      );
      await testGraph.executeAsync();
      expect(testGraph.executions).toEqual(['b', 'c']);
      expect(getCapturedOperationNames()).toEqual(['b', 'c']);

      skipsOperation = false;
      testGraph.localHashes.set('a', 'a-v2');
      testGraph.onExecute = (name: string) => {
        if (name === 'a') {
          fs.writeFileSync(path.join(rootDirectory, getInputFile('a')), 'export const a = 22;');
        }
      };
      jest.mocked(captureInputFilesState).mockClear();
      await testGraph.executeAsync();

      expect(testGraph.executions).toEqual(['a', 'b', 'c']);
      expect(getCapturedOperationNames()).toEqual(['a', 'b', 'c']);
      expect(testGraph.cacheWrites).toEqual([]);
    });

    it('does not write cache entries if an input file was deleted', async () => {
      const testGraph: ITestGraph = await createGraphWithInputFilesAsync();
      changeBeforeExecuting(testGraph, 'a', () => fs.unlinkSync(path.join(rootDirectory, getInputFile('a'))));

      await testGraph.executeAsync(Date.now());

      expect(testGraph.executions).toEqual(['a', 'b', 'c']);
      expect(testGraph.cacheWrites).toEqual([]);
    });

    it.each<[string, string, string[]]>([
      ['does not write cache entries if a file was created in an input folder', 'a/src/new.ts', []],
      [
        'writes cache entries if a file that Git ignores was created in an input folder',
        'a/src/debug.log',
        names
      ]
    ])('%s', async (title: string, newFile: string, expectedCacheWrites: string[]) => {
      const testGraph: ITestGraph = await createGraphWithInputFilesAsync();
      changeBeforeExecuting(testGraph, 'a', () =>
        fs.writeFileSync(path.join(rootDirectory, newFile), 'export const n = 1;')
      );

      await testGraph.executeAsync(Date.now());

      expect(testGraph.executions).toEqual(['a', 'b', 'c']);
      expect(testGraph.cacheWrites).toEqual(expectedCacheWrites);
    });

    it('writes cache entries if an untracked file that is not an input file was saved before the inputs snapshot hashed it', async () => {
      const testGraph: ITestGraph = await createGraphWithInputFilesAsync();
      // Like a file that matches `incrementalBuildIgnoredGlobs`
      const untrackedFile: string = 'a/src/notes.md';
      const content: string = 'Saved within the tolerance of the file times';
      fs.writeFileSync(path.join(rootDirectory, untrackedFile), content);
      testGraph.snapshotHashes.set(untrackedFile, getGitBlobHash(content));

      await testGraph.executeAsync(Date.now());

      expect(testGraph.executions).toEqual(['a', 'b', 'c']);
      expect(testGraph.cacheWrites).toEqual(['a', 'b', 'c']);
    });
  });

  describe('an operation that joins the iteration', () => {
    const inputFile: string = 'b/src/index.ts';
    let rootDirectory: string;
    let inputFilePath: string;

    beforeEach(() => {
      rootDirectory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rush-cacheable-')));
      fs.mkdirSync(path.join(rootDirectory, 'b', 'src'), { recursive: true });
      inputFilePath = path.join(rootDirectory, inputFile);
      fs.writeFileSync(inputFilePath, 'export const b = 1;');
      jest.mocked(captureInputFilesState).mockClear();
    });

    afterEach(() => {
      fs.rmSync(rootDirectory, { recursive: true, force: true });
    });

    // The name of each case, whether the input file of "b" changes while it executes, when the inputs snapshot of the
    // joining request began to read the working tree, after the save that it saw, and the cache writes
    it.each<[string, boolean, number, string[]]>([
      [
        'does not write its cache entry if they change while it executes',
        true,
        FILE_TIME_TOLERANCE_MS + 1,
        ['a']
      ],
      [
        'writes its cache entry if they do not change while it executes',
        false,
        FILE_TIME_TOLERANCE_MS + 1,
        ['a', 'b']
      ],
      [
        'writes its cache entry if they do not change while it executes, and it hashed a save within the tolerance of the file times',
        false,
        0,
        ['a', 'b']
      ]
    ])(
      'checks its input files against the inputs snapshot of the joining request, and %s',
      async (
        title: string,
        changesWhileExecuting: boolean,
        snapshotStartAfterSaveMs: number,
        expectedCacheWrites: string[]
      ) => {
        const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b'], rootDirectory);
        const hash: string = getGitBlobHash('export const b = 1;');
        testGraph.trackedFileHashes.set('b', new Map([[inputFile, hash]]));
        testGraph.snapshotHashes.set(inputFile, hash);
        const b: Operation = testGraph.operations.get('b')!;
        // Like an operation that only a later request needs, which the Rush daemon holds for that request
        b.enabled = false;
        const checkedOperations: string[] = [];
        // Like IncrementalExecutionGuardPlugin, which checks the input files of the other operations that execute
        testGraph.graph.hooks.beforeExecuteOperationAsync.tap(
          { name: 'test', stage: CAPTURE_INPUT_FILES_STAGE + 1 },
          (record: IOperationRunnerContext & IOperationExecutionResult): undefined => {
            if (areInputFilesChecked(record)) {
              checkedOperations.push(record.operation.associatedProject.packageName);
            }
            return undefined;
          }
        );
        let extension: IOperationGraphExtensionResult | undefined;
        let joiningSnapshotStartTimeMs: number | undefined;
        testGraph.onExecute = (name: string) => {
          if (name === 'a') {
            // The request that joins while "a" executes saw a save of the input file of "b", which the inputs
            // snapshot of the iteration did not. Its inputs snapshot hashed the saved file.
            const savedHash: string = getGitBlobHash('export const b = 2;');
            fs.writeFileSync(inputFilePath, 'export const b = 2;');
            testGraph.trackedFileHashes.set('b', new Map([[inputFile, savedHash]]));
            testGraph.snapshotHashes.set(inputFile, savedHash);
            testGraph.localHashes.set('b', 'b-v2');
            b.enabled = true;
            joiningSnapshotStartTimeMs = getLatestFileTimeMs(inputFilePath) + snapshotStartAfterSaveMs;
            extension = testGraph.graph.tryExtendCurrentIteration({
              inputsSnapshot: testGraph.createInputsSnapshot(joiningSnapshotStartTimeMs),
              neededOperations: [b]
            });
          } else if (changesWhileExecuting) {
            // A different size, so that the save is detected even if the file time does not change
            fs.writeFileSync(inputFilePath, 'export const b = 22;');
          }
        };
        const iterationSnapshotStartTimeMs: number = Date.now();

        const result: IExecutionResult = await testGraph.executeAsync(iterationSnapshotStartTimeMs, true);

        expect(extension?.extended).toBe(true);
        expect(result.status).toBe(OperationStatus.Success);
        expect(testGraph.executions).toEqual(['a', 'b']);
        expect(checkedOperations).toEqual(['a', 'b']);
        // The input files of "b" were captured for the inputs snapshot of the joining request. The save is in the window
        // of the inputs snapshot of the iteration, which did not hash it, so that snapshot would stop the cache write.
        expect(jest.mocked(captureInputFilesState).mock.calls.map((args) => args[2])).toEqual([
          iterationSnapshotStartTimeMs,
          joiningSnapshotStartTimeMs
        ]);
        expect(testGraph.cacheWrites).toEqual(expectedCacheWrites);
      }
    );

    it('reads the reason that caching is disabled from the inputs snapshot of the joining request', async () => {
      const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b'], rootDirectory);
      const hash: string = getGitBlobHash('export const b = 1;');
      testGraph.trackedFileHashes.set('b', new Map([[inputFile, hash]]));
      testGraph.snapshotHashes.set(inputFile, hash);
      const b: Operation = testGraph.operations.get('b')!;
      // Like an operation that only a later request needs, which the Rush daemon holds for that request
      b.enabled = false;
      // An output of an earlier build of "b", which is on disk, so that the input files of "b" would not change if
      // they were captured and checked
      const outputFile: string = 'b/lib/index.js';
      fs.mkdirSync(path.join(rootDirectory, 'b', 'lib'));
      fs.writeFileSync(path.join(rootDirectory, outputFile), 'exports.b = 1;');
      let extension: IOperationGraphExtensionResult | undefined;
      testGraph.onExecute = (name: string) => {
        if (name === 'a') {
          // The request that joins while "a" executes saw that Git tracks the output file of "b", which the inputs
          // snapshot of the iteration did not
          const outputHash: string = getGitBlobHash('exports.b = 1;');
          testGraph.trackedFileHashes.set(
            'b',
            new Map([
              [inputFile, hash],
              [outputFile, outputHash]
            ])
          );
          testGraph.snapshotHashes.set(outputFile, outputHash);
          testGraph.localHashes.set('b', 'b-v2');
          b.enabled = true;
          extension = testGraph.graph.tryExtendCurrentIteration({
            inputsSnapshot: testGraph.createInputsSnapshot(Date.now()),
            neededOperations: [b]
          });
        }
      };

      const iterationSnapshotStartTimeMs: number = Date.now();

      const result: IExecutionResult = await testGraph.executeAsync(iterationSnapshotStartTimeMs, true);

      expect(extension?.extended).toBe(true);
      expect(result.status).toBe(OperationStatus.Success);
      expect(testGraph.executions).toEqual(['a', 'b']);
      // Computed for "b" only once it executes, after the request joined
      expect(testGraph.cacheDisabledReasonComputations).toEqual(['a', 'b']);
      // Caching is disabled for "b", so its input files were not captured
      expect(jest.mocked(captureInputFilesState).mock.calls.map((args) => args[2])).toEqual([
        iterationSnapshotStartTimeMs
      ]);
      expect(testGraph.cacheWrites).toEqual(['a']);
    });
  });

  it('tells other plugins which operations it checks the input files of', async () => {
    const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c', 'd']);
    testGraph.cacheDisabledReasons.set('b', 'Caching has been disabled for this project.');
    // Like a runner whose results are never written to the build cache
    (testGraph.operations.get('c')!.runner as { cacheable: boolean }).cacheable = false;
    const checkedOperations: string[] = [];
    testGraph.graph.hooks.beforeExecuteIterationAsync.tap('test', (): undefined => {
      checkedOperations.length = 0;
      return undefined;
    });
    // Like IncrementalExecutionGuardPlugin, which checks the input files of the other operations that execute
    testGraph.graph.hooks.beforeExecuteOperationAsync.tap(
      { name: 'test', stage: CAPTURE_INPUT_FILES_STAGE + 1 },
      (record: IOperationRunnerContext & IOperationExecutionResult): undefined => {
        if (areInputFilesChecked(record)) {
          checkedOperations.push(record.operation.associatedProject.packageName);
        }
        return undefined;
      }
    );
    await testGraph.executeAsync();
    expect(checkedOperations.sort()).toEqual(['a', 'd']);

    testGraph.localHashes.set('d', 'd-v2');
    await testGraph.executeAsync();
    expect(checkedOperations).toEqual(['d']);
  });

  describe('reason that caching is disabled', () => {
    const cacheDisabledReason: string = 'Caching has been disabled for this project.';

    it('is only computed for the operations that execute', async () => {
      const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c']);
      await testGraph.executeAsync();
      expect(testGraph.cacheDisabledReasonComputations).toEqual(['a', 'b', 'c']);

      testGraph.localHashes.set('c', 'c-v2');
      const result: IExecutionResult = await testGraph.executeAsync();

      expect(getStatus(testGraph, result, 'a')).toBe(OperationStatus.Skipped);
      expect(getStatus(testGraph, result, 'b')).toBe(OperationStatus.Skipped);
      expect(testGraph.executions).toEqual(['c']);
      expect(testGraph.cacheWrites).toEqual(['c']);
      expect(testGraph.cacheDisabledReasonComputations).toEqual(['c']);
    });

    it('is computed once for each operation that executes', async () => {
      const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c']);
      testGraph.cacheDisabledReasons.set('b', cacheDisabledReason);

      const result: IExecutionResult = await testGraph.executeAsync();

      expect(result.status).toBe(OperationStatus.Success);
      expect(testGraph.executions).toEqual(['a', 'b', 'c']);
      expect(testGraph.cacheWrites).toEqual(['a', 'c']);
      expect(testGraph.cacheDisabledReasonComputations).toEqual(['a', 'b', 'c']);
    });

    it('is computed for every operation if cobuilds are enabled, to cluster the operations', async () => {
      const testGraph: ITestGraph = await createTestGraphAsync(['a', 'b', 'c'], '/repo', true, {
        cobuildFeatureEnabled: true,
        cobuildContextId: undefined
      } as unknown as CobuildConfiguration);
      // Without a build cache, an operation does not acquire a cobuild lock
      for (const name of ['a', 'b', 'c']) {
        testGraph.cacheDisabledReasons.set(name, cacheDisabledReason);
      }
      await testGraph.executeAsync();

      testGraph.localHashes.set('c', 'c-v2');
      const result: IExecutionResult = await testGraph.executeAsync();

      expect(getStatus(testGraph, result, 'a')).toBe(OperationStatus.Skipped);
      expect(getStatus(testGraph, result, 'b')).toBe(OperationStatus.Skipped);
      expect(testGraph.executions).toEqual(['c']);
      expect([...testGraph.cacheDisabledReasonComputations].sort()).toEqual(['a', 'b', 'c']);
    });
  });
});
