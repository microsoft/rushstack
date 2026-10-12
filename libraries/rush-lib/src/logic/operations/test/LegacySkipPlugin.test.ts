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

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { MockWritable, StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { BuildCacheConfiguration } from '../../../api/BuildCacheConfiguration';
import type { RushProjectConfiguration } from '../../../api/RushProjectConfiguration';
import { PhasedCommandHooks, type IOperationGraphContext } from '../../../pluginFramework/PhasedCommandHooks';
import type { IInputsSnapshot } from '../../incremental/InputsSnapshot';
import { OperationBuildCache } from '../../buildCache/OperationBuildCache';
import { CacheableOperationPlugin } from '../CacheableOperationPlugin';
import { LegacySkipInvalidationPlugin, LegacySkipPlugin } from '../LegacySkipPlugin';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import { OperationGraph } from '../OperationGraph';
import { Operation } from '../Operation';
import { NullOperationRunner } from '../NullOperationRunner';
import { OperationStatus } from '../OperationStatus';
import { markResultUnverifiable } from '../RetainedResultVerification';
import type { IOperationRunner } from '../IOperationRunner';
import type { IExecutionResult, IOperationExecutionResult } from '../IOperationExecutionResult';

const mockPhase: IPhase = {
  name: 'phase',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: { self: new Set(), upstream: new Set() },
  isSynthetic: false,
  logFilenameIdentifier: 'phase',
  missingScriptBehavior: 'silent'
};

/**
 * The strategy of a command: legacy skip detection (the build cache is off), the build cache, or neither
 * (a command that disables the build cache).
 */
type Strategy = 'legacy-skip' | 'build-cache' | 'none';

/**
 * A checkout of projects, each with one operation.
 */
interface ICheckout {
  readonly folder: string;
  /**
   * The names of the projects that each project depends on
   */
  readonly dependencies: Map<string, string[]>;
  /**
   * The names of the projects that have no script for the phase, so that their operations are no-ops
   */
  readonly scriptlessNames: Set<string>;
  /**
   * The names of the projects whose operations don't support skip detection, like those of IPC runners
   */
  readonly nonCacheableNames: Set<string>;
  /**
   * The names of the projects whose operations succeed with warnings
   */
  readonly warningNames: Set<string>;
  /**
   * The hash of the configuration of each project's operation, such as its command line, if it isn't "config"
   */
  readonly configHashes: Map<string, string>;
  /**
   * The version of the input files of each project
   */
  readonly inputs: Map<string, string>;
  /**
   * The version of the input files that each project's outputs were built from
   */
  readonly outputs: Map<string, string>;
  /**
   * The outputs in the build cache, by project name and state hash
   */
  readonly cacheEntries: Map<string, string>;
  /**
   * The names of the projects that the last command executed
   */
  readonly executions: string[];
}

class MockRunner implements IOperationRunner {
  public readonly reportTiming: boolean = true;
  public readonly silent: boolean = false;
  public readonly cacheable: boolean;
  public readonly warningsAreAllowed: boolean = false;
  public readonly isNoOp: boolean = false;
  public readonly name: string;
  readonly #checkout: ICheckout;

  public constructor(name: string, checkout: ICheckout) {
    this.name = name;
    this.cacheable = !checkout.nonCacheableNames.has(name);
    this.#checkout = checkout;
  }

  public async executeAsync(): Promise<OperationStatus> {
    this.#checkout.executions.push(this.name);
    this.#checkout.outputs.set(this.name, this.#checkout.inputs.get(this.name)!);
    return this.#checkout.warningNames.has(this.name)
      ? OperationStatus.SuccessWithWarning
      : OperationStatus.Success;
  }

  public getConfigHash(): string {
    return this.#checkout.configHashes.get(this.name) ?? 'config';
  }
}

/**
 * Options of a command
 */
interface ICommandOptions {
  /**
   * The names of the projects whose operations the command doesn't execute, e.g. because of `--only` or because
   * the graph of a daemon's engine contains every operation in the repo
   */
  readonly disabledNames?: ReadonlySet<string>;
  /**
   * Whether the command may skip operations. It is false for `rush rebuild`.
   */
  readonly isIncrementalBuildAllowed?: boolean;
  /**
   * Whether the command ignores changes to the dependencies of an operation, as `--changed-projects-only` does
   */
  readonly changedProjectsOnly?: boolean;
  /**
   * The version that the input files of each of these projects change to while its operation executes. Like
   * IncrementalExecutionGuardPlugin, the command then marks the result of the operation unverifiable.
   */
  readonly inputsChangedWhileExecuting?: ReadonlyMap<string, string>;
}

/**
 * Runs a command in a new process, e.g. `rush build`, and returns the status of each project's operation.
 */
async function runCommandAsync(
  checkout: ICheckout,
  strategy: Strategy,
  options: ICommandOptions = {}
): Promise<Record<string, OperationStatus>> {
  const {
    disabledNames = new Set(),
    isIncrementalBuildAllowed = true,
    changedProjectsOnly = false,
    inputsChangedWhileExecuting = new Map()
  } = options;
  const { folder, dependencies, scriptlessNames, inputs, outputs, cacheEntries, executions } = checkout;
  const operations: Map<string, Operation> = new Map();
  const projectConfigurations: Map<RushConfigurationProject, RushProjectConfiguration> = new Map();
  for (const name of inputs.keys()) {
    const projectFolder: string = path.join(folder, name);
    const project: RushConfigurationProject = {
      packageName: name,
      projectFolder,
      projectRushTempFolder: path.join(projectFolder, '.rush', 'temp')
    } as unknown as RushConfigurationProject;
    projectConfigurations.set(project, {
      getCacheDisabledReason: () => undefined
    } as unknown as RushProjectConfiguration);
    operations.set(
      name,
      new Operation({
        runner: scriptlessNames.has(name)
          ? new NullOperationRunner({ name, result: OperationStatus.NoOp, silent: false })
          : new MockRunner(name, checkout),
        logFilenameIdentifier: name,
        phase: mockPhase,
        project,
        enabled: !disabledNames.has(name)
      })
    );
  }
  for (const [name, dependencyNames] of dependencies) {
    for (const dependencyName of dependencyNames) {
      operations.get(name)!.addDependency(operations.get(dependencyName)!);
    }
  }

  jest.mocked(OperationBuildCache.forOperation).mockImplementation((record) => {
    const { packageName } = record.operation.associatedProject;
    const getCacheKey = (): string => `${packageName}@${record.getStateHash()}`;
    return {
      tryRestoreFromCacheAsync: async () => {
        const cachedOutputs: string | undefined = cacheEntries.get(getCacheKey());
        if (cachedOutputs !== undefined) {
          outputs.set(packageName, cachedOutputs);
        }
        return cachedOutputs !== undefined;
      },
      trySetCacheEntryAsync: async () => {
        cacheEntries.set(getCacheKey(), outputs.get(packageName)!);
        return true;
      }
    } as unknown as OperationBuildCache;
  });

  const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
  const hooks: PhasedCommandHooks = new PhasedCommandHooks();
  new PhasedOperationPlugin().apply(hooks);
  if (strategy === 'legacy-skip') {
    new LegacySkipPlugin({
      allowWarningsInSuccessfulBuild: false,
      terminal,
      changedProjectsOnly,
      isIncrementalBuildAllowed
    }).apply(hooks);
  } else {
    if (strategy === 'build-cache') {
      new CacheableOperationPlugin({
        allowWarningsInSuccessfulBuild: false,
        buildCacheConfiguration: {
          buildCacheEnabled: true,
          cacheWriteEnabled: true
        } as unknown as BuildCacheConfiguration,
        cobuildConfiguration: undefined,
        terminal,
        excludeAppleDoubleFiles: false,
        useDirectFileTransfersForBuildCache: false
      }).apply(hooks);
    }
    // Applied after the build cache plugin, which must not restore outputs before this plugin runs.
    new LegacySkipInvalidationPlugin().apply(hooks);
  }

  const graph: OperationGraph = new OperationGraph(new Set(operations.values()), {
    quietMode: true,
    debugMode: false,
    parallelism: 1,
    allowOversubscription: true,
    destinations: [new MockWritable()],
    abortController: new AbortController()
  });
  await hooks.onGraphCreatedAsync.promise(graph, {
    isIncrementalBuildAllowed,
    projectConfigurations
  } as unknown as IOperationGraphContext);
  graph.hooks.afterExecuteOperationAsync.tap('TestPlugin', (record: IOperationExecutionResult) => {
    const { packageName } = record.operation.associatedProject;
    const changedInputs: string | undefined = inputsChangedWhileExecuting.get(packageName);
    if (changedInputs !== undefined) {
      inputs.set(packageName, changedInputs);
      markResultUnverifiable(record);
    }
  });

  // A snapshot only lists files that are in the working tree, so each project's input file is written with its
  // version as its content, and hashed as `git hash-object` does.
  const hashes: Map<string, string> = new Map();
  for (const [name, version] of inputs) {
    const inputFilePath: string = `${name}/src/index.ts`;
    fs.mkdirSync(path.join(folder, name, 'src'), { recursive: true });
    fs.writeFileSync(path.join(folder, inputFilePath), version);
    hashes.set(
      inputFilePath,
      createHash('sha1')
        .update(`blob ${Buffer.byteLength(version)}\0${version}`)
        .digest('hex')
    );
  }
  const inputsSnapshot: IInputsSnapshot = {
    hashes,
    rootDirectory: folder,
    hasUncommittedChanges: false,
    getTrackedFileHashesForOperation: (project: RushConfigurationProject) => {
      const inputFilePath: string = `${project.packageName}/src/index.ts`;
      return new Map([[inputFilePath, hashes.get(inputFilePath)!]]);
    },
    getOperationOwnStateHash: (project: RushConfigurationProject) => inputs.get(project.packageName)!
  };

  executions.length = 0;
  const result: IExecutionResult = await graph.executeAsync({ inputsSnapshot });
  const statuses: Record<string, OperationStatus> = {};
  for (const [name, operation] of operations) {
    statuses[name] = result.operationResults.get(operation)!.status;
  }
  return statuses;
}

describe(LegacySkipPlugin.name, () => {
  let checkout: ICheckout;

  beforeEach(() => {
    checkout = {
      folder: fs.mkdtempSync(path.join(os.tmpdir(), 'rush-lib-legacy-skip-')),
      dependencies: new Map(),
      scriptlessNames: new Set(),
      nonCacheableNames: new Set(),
      warningNames: new Set(),
      configHashes: new Map(),
      inputs: new Map([['a', 'A']]),
      outputs: new Map(),
      cacheEntries: new Map(),
      executions: []
    };
  });

  afterEach(() => {
    fs.rmSync(checkout.folder, { recursive: true, force: true });
  });

  it('skips an operation whose inputs are unchanged since it last succeeded', async () => {
    expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({ a: OperationStatus.Success });
    expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({ a: OperationStatus.Skipped });
    expect(checkout.executions).toEqual([]);

    checkout.inputs.set('a', 'B');
    expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({ a: OperationStatus.Success });
    expect(checkout.outputs.get('a')).toBe('B');
  });

  it('executes an operation whose outputs the build cache restored for other inputs since then', async () => {
    checkout.inputs.set('a', 'B');
    expect(await runCommandAsync(checkout, 'build-cache')).toEqual({ a: OperationStatus.Success });
    checkout.inputs.set('a', 'A');
    expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({ a: OperationStatus.Success });

    checkout.inputs.set('a', 'B');
    expect(await runCommandAsync(checkout, 'build-cache')).toEqual({ a: OperationStatus.FromCache });
    expect(checkout.outputs.get('a')).toBe('B');

    checkout.inputs.set('a', 'A');
    expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({ a: OperationStatus.Success });
    expect(checkout.outputs.get('a')).toBe('A');
    expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({ a: OperationStatus.Skipped });
  });

  it('executes an operation that the build cache plugin executed for other inputs since then', async () => {
    expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({ a: OperationStatus.Success });

    checkout.inputs.set('a', 'B');
    expect(await runCommandAsync(checkout, 'build-cache')).toEqual({ a: OperationStatus.Success });

    checkout.inputs.set('a', 'A');
    expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({ a: OperationStatus.Success });
    expect(checkout.outputs.get('a')).toBe('A');
  });

  it('executes an operation that a command without the build cache executed for other inputs since then', async () => {
    expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({ a: OperationStatus.Success });

    checkout.inputs.set('a', 'B');
    expect(await runCommandAsync(checkout, 'none')).toEqual({ a: OperationStatus.Success });

    checkout.inputs.set('a', 'A');
    expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({ a: OperationStatus.Success });
    expect(checkout.outputs.get('a')).toBe('A');
  });

  it('still skips an operation that a command with the build cache did not execute', async () => {
    checkout.inputs.set('b', 'A');
    expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
      a: OperationStatus.Success,
      b: OperationStatus.Success
    });

    // --only a
    checkout.inputs.set('a', 'B');
    expect(await runCommandAsync(checkout, 'build-cache', { disabledNames: new Set(['b']) })).toEqual({
      a: OperationStatus.Success,
      b: OperationStatus.Skipped
    });

    checkout.inputs.set('a', 'A');
    expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
      a: OperationStatus.Success,
      b: OperationStatus.Skipped
    });
    expect(checkout.executions).toEqual(['a']);
  });

  describe('with dependencies between projects', () => {
    beforeEach(() => {
      checkout.inputs.set('b', 'A');
      checkout.dependencies.set('b', ['a']);
    });

    it('keeps the record of a dependency that a rebuild does not execute', async () => {
      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Success
      });

      // rush rebuild --only b
      expect(
        await runCommandAsync(checkout, 'legacy-skip', {
          disabledNames: new Set(['a']),
          isIncrementalBuildAllowed: false
        })
      ).toEqual({ a: OperationStatus.Skipped, b: OperationStatus.Success });

      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Skipped,
        b: OperationStatus.Skipped
      });
      expect(checkout.executions).toEqual([]);
    });

    it('keeps the records of operations that a rebuild does not execute, if none of their dependencies executes', async () => {
      // b depends on a through n, which has no script.
      checkout.inputs.set('n', 'A');
      checkout.scriptlessNames.add('n');
      checkout.dependencies.set('n', ['a']);
      checkout.dependencies.set('b', ['n']);
      checkout.inputs.set('x', 'A');
      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Success,
        n: OperationStatus.NoOp,
        x: OperationStatus.Success
      });

      // rush rebuild --only x, on the graph of a daemon's engine
      expect(
        await runCommandAsync(checkout, 'legacy-skip', {
          disabledNames: new Set(['a', 'b', 'n']),
          isIncrementalBuildAllowed: false
        })
      ).toEqual({
        a: OperationStatus.Skipped,
        b: OperationStatus.Skipped,
        n: OperationStatus.NoOp,
        x: OperationStatus.Success
      });

      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Skipped,
        b: OperationStatus.Skipped,
        n: OperationStatus.NoOp,
        x: OperationStatus.Skipped
      });
      expect(checkout.executions).toEqual([]);
    });

    it('deletes the records of consumers that a rebuild does not execute after their dependency changed', async () => {
      checkout.inputs.set('c', 'A');
      checkout.dependencies.set('c', ['b']);
      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Success,
        c: OperationStatus.Success
      });

      // rush rebuild --only a, on the graph of a daemon's engine
      checkout.inputs.set('a', 'B');
      expect(
        await runCommandAsync(checkout, 'legacy-skip', {
          disabledNames: new Set(['b', 'c']),
          isIncrementalBuildAllowed: false
        })
      ).toEqual({ a: OperationStatus.Success, b: OperationStatus.Skipped, c: OperationStatus.Skipped });

      // rush build --only c: its outputs were built against outputs of b, which were built against outputs of a
      // that have since changed.
      expect(await runCommandAsync(checkout, 'legacy-skip', { disabledNames: new Set(['a', 'b']) })).toEqual({
        a: OperationStatus.Skipped,
        b: OperationStatus.Skipped,
        c: OperationStatus.Success
      });

      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Skipped,
        b: OperationStatus.Success,
        c: OperationStatus.Success
      });
      expect(checkout.executions).toEqual(['b', 'c']);
    });

    it('keeps the records of consumers that a rebuild does not execute, if the inputs of their dependency are unchanged', async () => {
      checkout.inputs.set('c', 'A');
      checkout.dependencies.set('c', ['b']);
      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Success,
        c: OperationStatus.Success
      });

      // rush rebuild --only a, on the graph of a daemon's engine. Like the same command in a process of its own,
      // whose graph doesn't contain b and c, it leaves their records as they were.
      expect(
        await runCommandAsync(checkout, 'legacy-skip', {
          disabledNames: new Set(['b', 'c']),
          isIncrementalBuildAllowed: false
        })
      ).toEqual({ a: OperationStatus.Success, b: OperationStatus.Skipped, c: OperationStatus.Skipped });

      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Skipped,
        b: OperationStatus.Skipped,
        c: OperationStatus.Skipped
      });
      expect(checkout.executions).toEqual([]);
    });

    it('deletes the record of a consumer that a rebuild does not execute, after a dependency of its dependency changed', async () => {
      checkout.inputs.set('c', 'A');
      checkout.dependencies.set('c', ['b']);
      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Success,
        c: OperationStatus.Success
      });

      // rush rebuild --only a --only b, on the graph of a daemon's engine: the inputs of b are unchanged, but it was
      // built again against outputs of a that changed.
      checkout.inputs.set('a', 'B');
      expect(
        await runCommandAsync(checkout, 'legacy-skip', {
          disabledNames: new Set(['c']),
          isIncrementalBuildAllowed: false
        })
      ).toEqual({ a: OperationStatus.Success, b: OperationStatus.Success, c: OperationStatus.Skipped });

      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Skipped,
        b: OperationStatus.Skipped,
        c: OperationStatus.Success
      });
      expect(checkout.executions).toEqual(['c']);
    });

    it.each(['b', 'c'])(
      'deletes the record of a consumer that a rebuild does not execute, after %s, one of its two dependencies, changed',
      async (changedName: string) => {
        // d depends on b and c, which both depend on a. One case changes b and the other changes c, so that in one of
        // them the dependency that changed finishes before the one that didn't, whatever order the two execute in.
        checkout.inputs.set('c', 'A');
        checkout.inputs.set('d', 'A');
        checkout.dependencies.set('c', ['a']);
        checkout.dependencies.set('d', ['b', 'c']);
        expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
          a: OperationStatus.Success,
          b: OperationStatus.Success,
          c: OperationStatus.Success,
          d: OperationStatus.Success
        });

        // rush rebuild --only b --only c, on the graph of a daemon's engine
        checkout.inputs.set(changedName, 'B');
        expect(
          await runCommandAsync(checkout, 'legacy-skip', {
            disabledNames: new Set(['a', 'd']),
            isIncrementalBuildAllowed: false
          })
        ).toEqual({
          a: OperationStatus.Skipped,
          b: OperationStatus.Success,
          c: OperationStatus.Success,
          d: OperationStatus.Skipped
        });

        expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
          a: OperationStatus.Skipped,
          b: OperationStatus.Skipped,
          c: OperationStatus.Skipped,
          d: OperationStatus.Success
        });
        expect(checkout.executions).toEqual(['d']);
      }
    );

    it.each([
      { kind: 'has no script', setName: 'scriptlessNames', statusOfN: OperationStatus.NoOp },
      {
        kind: 'does not support skip detection',
        setName: 'nonCacheableNames',
        statusOfN: OperationStatus.Skipped
      }
    ] as const)(
      'deletes the record of a consumer that a rebuild does not execute, through an operation that $kind, after their dependency changed',
      async ({ setName, statusOfN }) => {
        // b depends on a through n, which the commands below don't execute.
        checkout.inputs.set('n', 'A');
        checkout[setName].add('n');
        checkout.dependencies.set('n', ['a']);
        checkout.dependencies.set('b', ['n']);
        await runCommandAsync(checkout, 'legacy-skip');

        // rush rebuild --only a, on the graph of a daemon's engine
        checkout.inputs.set('a', 'B');
        expect(
          await runCommandAsync(checkout, 'legacy-skip', {
            disabledNames: new Set(['n', 'b']),
            isIncrementalBuildAllowed: false
          })
        ).toEqual({ a: OperationStatus.Success, b: OperationStatus.Skipped, n: statusOfN });

        // rush build --only b
        expect(
          await runCommandAsync(checkout, 'legacy-skip', { disabledNames: new Set(['a', 'n']) })
        ).toEqual({
          a: OperationStatus.Skipped,
          b: OperationStatus.Success,
          n: statusOfN
        });
        expect(checkout.executions).toEqual(['b']);
      }
    );

    it('deletes the record of a consumer that a rebuild does not execute, after its dependency was built with another configuration', async () => {
      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Success
      });

      // rush rebuild --only a, on the graph of a daemon's engine, with a parameter that changes the command line of
      // a: the files of a are unchanged, but its outputs aren't.
      checkout.configHashes.set('a', 'other-parameters');
      expect(
        await runCommandAsync(checkout, 'legacy-skip', {
          disabledNames: new Set(['b']),
          isIncrementalBuildAllowed: false
        })
      ).toEqual({ a: OperationStatus.Success, b: OperationStatus.Skipped });

      // rush build, with the same parameter
      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Skipped,
        b: OperationStatus.Success
      });
      expect(checkout.executions).toEqual(['b']);
    });

    it('deletes the record of a consumer that a rebuild does not execute, after its dependency succeeded with warnings', async () => {
      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Success
      });

      // rush rebuild --only a, on the graph of a daemon's engine
      checkout.inputs.set('a', 'B');
      checkout.warningNames.add('a');
      expect(
        await runCommandAsync(checkout, 'legacy-skip', {
          disabledNames: new Set(['b']),
          isIncrementalBuildAllowed: false
        })
      ).toEqual({ a: OperationStatus.SuccessWithWarning, b: OperationStatus.Skipped });

      // rush build --only b
      expect(await runCommandAsync(checkout, 'legacy-skip', { disabledNames: new Set(['a']) })).toEqual({
        a: OperationStatus.Skipped,
        b: OperationStatus.Success
      });
      expect(checkout.executions).toEqual(['b']);
    });

    it('deletes the record of a consumer that a rebuild does not execute, after the input files of its dependency changed while it executed', async () => {
      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Success
      });

      // rush rebuild --only a, on the graph of a daemon's engine. The inputs of a match its record when it
      // starts but change while it executes, so its outputs may differ from those that b was built against.
      expect(
        await runCommandAsync(checkout, 'legacy-skip', {
          disabledNames: new Set(['b']),
          isIncrementalBuildAllowed: false,
          inputsChangedWhileExecuting: new Map([['a', 'B']])
        })
      ).toEqual({ a: OperationStatus.Success, b: OperationStatus.Skipped });

      // rush build --only b
      expect(await runCommandAsync(checkout, 'legacy-skip', { disabledNames: new Set(['a']) })).toEqual({
        a: OperationStatus.Skipped,
        b: OperationStatus.Success
      });
      expect(checkout.executions).toEqual(['b']);
    });

    it('executes the consumers of an operation that executed only because its dependency changed', async () => {
      checkout.inputs.set('c', 'A');
      checkout.dependencies.set('c', ['b']);
      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Success,
        c: OperationStatus.Success
      });

      checkout.inputs.set('a', 'B');
      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Success,
        c: OperationStatus.Success
      });
      expect(checkout.executions).toEqual(['a', 'b', 'c']);
    });

    it('executes the consumers of an operation that does not support skip detection', async () => {
      checkout.nonCacheableNames.add('a');
      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Success
      });

      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Success
      });
      expect(checkout.executions).toEqual(['a', 'b']);
    });

    it('deletes the record of a consumer that a build does not execute after its dependency', async () => {
      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Success
      });

      // rush build --only a, on the graph of a daemon's engine
      checkout.inputs.set('a', 'B');
      expect(await runCommandAsync(checkout, 'legacy-skip', { disabledNames: new Set(['b']) })).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Skipped
      });

      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Skipped,
        b: OperationStatus.Success
      });
      expect(checkout.executions).toEqual(['b']);
    });

    it('keeps the record of a consumer that a build with changedProjectsOnly does not execute', async () => {
      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Success
      });

      // rush build --changed-projects-only --only a, on the graph of a daemon's engine. Like the same command in
      // a process of its own, whose graph doesn't contain b, it leaves the record of b as it was.
      checkout.inputs.set('a', 'B');
      expect(
        await runCommandAsync(checkout, 'legacy-skip', {
          disabledNames: new Set(['b']),
          changedProjectsOnly: true
        })
      ).toEqual({ a: OperationStatus.Success, b: OperationStatus.Skipped });

      expect(await runCommandAsync(checkout, 'legacy-skip', { changedProjectsOnly: true })).toEqual({
        a: OperationStatus.Skipped,
        b: OperationStatus.Skipped
      });
      expect(checkout.executions).toEqual([]);
    });

    it('executes a consumer whose dependency executed, through an operation that the command does not execute', async () => {
      checkout.inputs.set('c', 'A');
      checkout.dependencies.set('c', ['b']);
      expect(await runCommandAsync(checkout, 'legacy-skip')).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Success,
        c: OperationStatus.Success
      });

      // rush build --only a --only c
      checkout.inputs.set('a', 'B');
      expect(await runCommandAsync(checkout, 'legacy-skip', { disabledNames: new Set(['b']) })).toEqual({
        a: OperationStatus.Success,
        b: OperationStatus.Skipped,
        c: OperationStatus.Success
      });
      expect(checkout.executions).toEqual(['a', 'c']);
    });
  });
});
