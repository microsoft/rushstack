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
import { OperationStatus } from '../OperationStatus';
import type { IOperationRunner } from '../IOperationRunner';
import type { IExecutionResult } from '../IOperationExecutionResult';

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
 * A checkout of independent projects, each with one operation.
 */
interface ICheckout {
  readonly folder: string;
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
  public readonly cacheable: boolean = true;
  public readonly warningsAreAllowed: boolean = false;
  public readonly isNoOp: boolean = false;
  public readonly name: string;
  readonly #checkout: ICheckout;

  public constructor(name: string, checkout: ICheckout) {
    this.name = name;
    this.#checkout = checkout;
  }

  public async executeAsync(): Promise<OperationStatus> {
    this.#checkout.executions.push(this.name);
    this.#checkout.outputs.set(this.name, this.#checkout.inputs.get(this.name)!);
    return OperationStatus.Success;
  }

  public getConfigHash(): string {
    return 'config';
  }
}

/**
 * Runs a command in a new process, e.g. `rush build`, and returns the status of each project's operation.
 */
async function runCommandAsync(
  checkout: ICheckout,
  strategy: Strategy,
  disabledNames: ReadonlySet<string> = new Set()
): Promise<Record<string, OperationStatus>> {
  const { folder, inputs, outputs, cacheEntries, executions } = checkout;
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
        runner: new MockRunner(name, checkout),
        logFilenameIdentifier: name,
        phase: mockPhase,
        project,
        enabled: !disabledNames.has(name)
      })
    );
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
      changedProjectsOnly: false,
      isIncrementalBuildAllowed: true
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
    isIncrementalBuildAllowed: true,
    projectConfigurations
  } as unknown as IOperationGraphContext);

  const inputsSnapshot: IInputsSnapshot = {
    hashes: new Map(),
    rootDirectory: folder,
    hasUncommittedChanges: false,
    getTrackedFileHashesForOperation: (project: RushConfigurationProject) =>
      new Map([[`${project.packageName}/src/index.ts`, inputs.get(project.packageName)!]]),
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
    expect(await runCommandAsync(checkout, 'build-cache', new Set(['b']))).toEqual({
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
});
