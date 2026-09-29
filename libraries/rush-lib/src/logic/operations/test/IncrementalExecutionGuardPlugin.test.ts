// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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

import type * as childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';

import { LookupByPath } from '@rushstack/lookup-by-path';
import { Executable, SubprocessTerminator } from '@rushstack/node-core-library';
import { type ITerminal, MockWritable, StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import { EnvironmentConfiguration } from '../../../api/EnvironmentConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IOperationSettings, RushProjectConfiguration } from '../../../api/RushProjectConfiguration';
import type {
  IIncrementalExecutionGuard,
  IOperationCommandExecution,
  IOperationLastState,
  IOperationRunner,
  IOperationRunnerContext
} from '../../../index';
import { PhasedCommandHooks, type IOperationGraphContext } from '../../../pluginFramework/PhasedCommandHooks';
import { Utilities } from '../../../utilities/Utilities';
import { InputsSnapshot, type IInputsSnapshotProjectMetadata } from '../../incremental/InputsSnapshot';
import { IncrementalExecutionGuardPlugin } from '../IncrementalExecutionGuardPlugin';
import {
  getCommandExecution,
  getIncrementalExecutionGuard,
  INPUTS_CHANGED_INVALIDATION_REASON,
  NATIVE_COMMAND_INVALIDATION_REASON,
  setCommandExecution,
  setIncrementalExecutionGuard,
  wasExecutedIncrementally,
  type ICommandExecution,
  type IIncrementalExecutionGuardOptions
} from '../IncrementalExecutionState';
import type { IExecutionResult, IOperationExecutionResult } from '../IOperationExecutionResult';
import { type ILegacySkipPluginOptions, LegacySkipPlugin } from '../LegacySkipPlugin';
import { NullOperationRunner } from '../NullOperationRunner';
import { Operation } from '../Operation';
import type { OperationExecutionRecord } from '../OperationExecutionRecord';
import { OperationGraph } from '../OperationGraph';
import { OperationStatus } from '../OperationStatus';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import { markInputFilesChecked, markResultUnverifiable } from '../RetainedResultVerification';
import { ShellOperationRunner } from '../ShellOperationRunner';

const PHASE_NAME: string = '_phase:build';
const INITIAL_COMMAND: string = 'node build.js';
const INCREMENTAL_COMMAND: string = 'node build.js --incremental';

const buildPhase: IPhase = {
  name: PHASE_NAME,
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: { self: new Set(), upstream: new Set() },
  isSynthetic: false,
  logFilenameIdentifier: '_phase_build',
  missingScriptBehavior: 'error'
};

const liteBuildPhase: IPhase = {
  ...buildPhase,
  name: '_phase:lite-build',
  logFilenameIdentifier: '_phase_lite-build',
  missingScriptBehavior: 'silent'
};

interface IProjectSpec {
  readonly name: string;
  readonly dependencies?: ReadonlyArray<string>;
  readonly devDependencies?: ReadonlyArray<string>;
  /**
   * If set, the build writes a single bundle `dist/main.js` instead of a `lib` file per source file.
   */
  readonly isBundle?: boolean;
  readonly dependsOnEnvVars?: ReadonlyArray<string>;
  /**
   * If set, the project has a `profiles` folder, like a rig package.
   */
  readonly isRig?: boolean;
  /**
   * Files outside of the project that its build depends on, like `dependsOnAdditionalFiles` in rush-project.json
   */
  readonly additionalFiles?: ReadonlyArray<string>;
  /**
   * If set, the operation runs in a runner like that of a Rush plugin, which uses only the public API of Rush and runs
   * the build itself. An `unreported` runner asks the guard, but never reports which command it runs.
   */
  readonly pluginRunner?: 'reported' | 'unreported';
}

interface IWorkspaceOptions {
  /**
   * If set, like the phases of the rushstack repo, the build of each project depends only on a `_phase:lite-build`
   * operation of its own project, which has no script and depends on the builds of the project's dependencies.
   */
  readonly hasPassThroughPhase?: boolean;
  /**
   * If set, the runners pass these options to the guard, like `WarmWorkerOperationRunner`.
   */
  readonly guardOptions?: IIncrementalExecutionGuardOptions;
  /**
   * If set, applies the skip detection that Rush uses when the build cache is not enabled.
   */
  readonly hasLegacySkipDetection?: boolean;
  /**
   * Options of the skip detection of `hasLegacySkipDetection`, e.g. `isIncrementalBuildAllowed: false`, like
   * `rush rebuild`
   */
  readonly legacySkipOptions?: Partial<ILegacySkipPluginOptions>;
  /**
   * If false, the guard is not applied, like in `rush build` without the Rush daemon, or in a Rush daemon whose
   * `daemon.incrementalBuilds` setting is off. Defaults to true.
   */
  readonly hasIncrementalExecutionGuard?: boolean;
  /**
   * If set, the runners report that each command ran in a process that keeps watching the input files, like
   * `WarmWorkerOperationRunner`.
   */
  readonly watchesInputs?: boolean;
  /**
   * If set, each inputs snapshot records when it began reading the working tree, like one that Git computes.
   */
  readonly recordsWorkingTreeReadStartTime?: boolean;
}

interface ITestIteration {
  readonly result: IExecutionResult;
  /**
   * Each command that ran, as `<project>:initial` or `<project>:incremental`
   */
  readonly commands: ReadonlyArray<string>;
  readonly output: string;
  getStatus(name: string): OperationStatus;
}

interface ITestWorkspace {
  readonly rootFolder: string;
  readonly graph: OperationGraph;
  readonly operations: ReadonlyMap<string, Operation>;
  writeFile(relativePath: string, content: string): void;
  deleteFile(relativePath: string): void;
  /**
   * Deletes a folder and writes its files again, like a branch switch that removed the folder and restored it.
   */
  recreateFolder(relativePath: string): void;
  executeAsync(
    environment?: Readonly<Record<string, string>>,
    isIncrementalBuildAllowed?: boolean
  ): Promise<ITestIteration>;
  /**
   * Resolves when the next command that hangs has written its outputs. It runs until it is terminated.
   */
  waitForHangAsync(): Promise<void>;
}

const workspaceFolders: string[] = [];

afterEach(() => {
  jest.restoreAllMocks();
  for (const folder of workspaceFolders.splice(0)) {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

function listFiles(folder: string, exclude: ReadonlySet<string> = new Set()): string[] {
  const files: string[] = [];
  const visit = (relativeFolder: string): void => {
    for (const entry of fs.readdirSync(path.join(folder, relativeFolder), { withFileTypes: true })) {
      const relativePath: string = relativeFolder ? `${relativeFolder}/${entry.name}` : entry.name;
      if (exclude.has(relativePath)) {
        continue;
      }
      if (entry.isDirectory()) {
        visit(relativePath);
      } else {
        files.push(relativePath);
      }
    }
  };
  visit('');
  return files.sort();
}

function recreateFolder(folder: string): void {
  const contentByFile: Map<string, Buffer> = new Map(
    listFiles(folder).map((file: string) => [file, fs.readFileSync(`${folder}/${file}`)])
  );
  fs.rmSync(folder, { recursive: true });
  for (const [file, content] of contentByFile) {
    fs.mkdirSync(path.dirname(`${folder}/${file}`), { recursive: true });
    fs.writeFileSync(`${folder}/${file}`, content);
  }
}

// Recreates a folder by moving its entries into a new folder, which keeps the identity, size and times of each file.
function moveFolder(folder: string): void {
  const newFolder: string = `${folder}.new`;
  fs.mkdirSync(newFolder);
  for (const entry of fs.readdirSync(folder)) {
    fs.renameSync(`${folder}/${entry}`, `${newFolder}/${entry}`);
  }
  fs.rmdirSync(folder);
  fs.renameSync(newFolder, folder);
}

// Like a compiler: writes a file per source file, and its incremental mode neither cleans the output folder nor
// deletes the outputs of deleted source files. A source containing "emit:<name>" also emits "<name>.js", a
// source containing "recreate:<folder>" deletes and recreates that folder of the project while the build runs, a
// source containing "move:<folder>" recreates that folder by moving its files while the build runs, a source
// containing "warning" adds a warning to `warnings`, a source containing "error" fails the build, and after the
// output of a source containing "hang", the build runs until it is terminated (it returns undefined).
function build(
  projectFolder: string,
  isBundle: boolean,
  isIncremental: boolean,
  warnings: string[] = []
): number | undefined {
  const outputFolder: string = `${projectFolder}/${isBundle ? 'dist' : 'lib'}`;
  if (!isIncremental) {
    fs.rmSync(outputFolder, { recursive: true, force: true });
  }
  fs.mkdirSync(outputFolder, { recursive: true });
  const bundle: string[] = [];
  for (const sourcePath of listFiles(`${projectFolder}/src`)) {
    const source: string = fs.readFileSync(`${projectFolder}/src/${sourcePath}`, 'utf8');
    if (source.includes('error')) {
      return 1;
    }
    if (source.includes('warning')) {
      warnings.push(`Warning in ${sourcePath}`);
    }
    bundle.push(source);
    if (!isBundle) {
      const outputPath: string = `${outputFolder}/${sourcePath.replace(/\.ts$/, '.js')}`;
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, source);
    }
    const emitted: RegExpExecArray | null = /emit:(\w+)/.exec(source);
    if (emitted) {
      fs.writeFileSync(`${outputFolder}/${emitted[1]}.js`, '');
    }
    const recreated: RegExpExecArray | null = /recreate:([\w/]+)/.exec(source);
    if (recreated) {
      recreateFolder(`${projectFolder}/${recreated[1]}`);
    }
    const moved: RegExpExecArray | null = /move:([\w/]+)/.exec(source);
    if (moved) {
      moveFolder(`${projectFolder}/${moved[1]}`);
    }
    if (source.includes('hang')) {
      return undefined;
    }
  }
  if (isBundle) {
    fs.writeFileSync(`${outputFolder}/main.js`, bundle.join('\n'));
  }
  return 0;
}

/**
 * Runs the build itself, like the runner of a Rush plugin, and uses only the public API of Rush. It follows the steps
 * that the documentation of `IOperationRunnerContext.getIncrementalExecutionGuard` describes.
 */
class PluginOperationRunner implements IOperationRunner {
  public readonly name: string;
  public readonly cacheable: boolean = true;
  public readonly reportTiming: boolean = true;
  public readonly silent: boolean = false;
  public readonly warningsAreAllowed: boolean = false;
  readonly #runBuild: (kind: IOperationCommandExecution['kind']) => number | undefined;
  readonly #reportsCommandExecutions: boolean;

  public constructor(
    name: string,
    runBuild: (kind: IOperationCommandExecution['kind']) => number | undefined,
    reportsCommandExecutions: boolean
  ) {
    this.name = name;
    this.#runBuild = runBuild;
    this.#reportsCommandExecutions = reportsCommandExecutions;
  }

  public async executeAsync(
    context: IOperationRunnerContext,
    lastState?: IOperationLastState
  ): Promise<OperationStatus> {
    return await context.runWithTerminalAsync(
      async (terminal: ITerminal): Promise<OperationStatus> => {
        const guard: IIncrementalExecutionGuard | undefined = lastState
          ? context.getIncrementalExecutionGuard?.()
          : undefined;
        if (!guard) {
          return this.#run(context, 'initial');
        }
        const blockReason: string | undefined = await guard.getBlockReasonAsync();
        if (blockReason !== undefined) {
          terminal.writeLine(`Not using the incremental command because ${blockReason}.`);
          return this.#run(context, 'initial');
        }
        const status: OperationStatus = this.#run(context, 'incremental');
        if (status !== OperationStatus.Success) {
          return status;
        }
        const rerunReason: string | undefined = await guard.verifyIncrementalResultAsync();
        if (rerunReason === undefined) {
          return status;
        }
        terminal.writeLine(`Running the initial command, because ${rerunReason}.`);
        return this.#run(context, 'initial');
      },
      { createLogFile: false }
    );
  }

  public getConfigHash(): string {
    return INITIAL_COMMAND;
  }

  #run(context: IOperationRunnerContext, kind: IOperationCommandExecution['kind']): OperationStatus {
    if (this.#reportsCommandExecutions) {
      context.reportCommandExecution?.({ kind, hasIncrementalCommand: true });
    }
    return this.#runBuild(kind) === 0 ? OperationStatus.Success : OperationStatus.Failure;
  }
}

async function createWorkspaceAsync(
  projectSpecs: ReadonlyArray<IProjectSpec>,
  {
    hasPassThroughPhase,
    guardOptions,
    hasLegacySkipDetection,
    legacySkipOptions,
    hasIncrementalExecutionGuard = true,
    watchesInputs,
    recordsWorkingTreeReadStartTime
  }: IWorkspaceOptions = {}
): Promise<ITestWorkspace> {
  const rootFolder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-incremental-guard-'));
  workspaceFolders.push(rootFolder);

  const writeFile = (relativePath: string, content: string): void => {
    const filePath: string = `${rootFolder}/${relativePath}`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  };

  const commands: string[] = [];
  const hangWaiters: (() => void)[] = [];
  const specByFolder: Map<string, IProjectSpec> = new Map();
  const close = (child: childProcess.ChildProcess, exitCode: number | null, signal: string | null): void => {
    queueMicrotask(() => {
      (child.stdout as PassThrough).end();
      (child.stderr as PassThrough).end();
      child.emit('close', exitCode, signal);
    });
  };
  jest
    .spyOn(Utilities, 'executeLifecycleCommandAsync')
    .mockImplementation((command: string, { workingDirectory }: { workingDirectory: string }) => {
      const spec: IProjectSpec = specByFolder.get(workingDirectory)!;
      const isIncremental: boolean = command === INCREMENTAL_COMMAND;
      commands.push(`${spec.name}:${isIncremental ? 'incremental' : 'initial'}`);
      const warnings: string[] = [];
      const exitCode: number | undefined = build(workingDirectory, !!spec.isBundle, isIncremental, warnings);
      const child: childProcess.ChildProcess = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        stdio: []
      }) as unknown as childProcess.ChildProcess;
      if (exitCode === undefined) {
        for (const resolve of hangWaiters.splice(0)) {
          resolve();
        }
      } else if (warnings.length > 0) {
        (child.stderr as PassThrough).write(warnings.join('\n'));
        // The runner reads the warnings after it starts to listen for output, so the process closes afterwards.
        setImmediate(() => close(child, exitCode, null));
      } else {
        close(child, exitCode, null);
      }
      return child;
    });
  jest
    .spyOn(SubprocessTerminator, 'killProcessTree')
    .mockImplementation((child: childProcess.ChildProcess) => close(child, null, 'SIGTERM'));

  const operations: Map<string, Operation> = new Map();
  const passThroughOperations: Operation[] = [];
  const projectMap: Map<RushConfigurationProject, IInputsSnapshotProjectMetadata> = new Map();
  const projectConfigurations: Map<RushConfigurationProject, RushProjectConfiguration> = new Map();
  const lookupByPath: LookupByPath<RushConfigurationProject> = new LookupByPath();
  const outputFolderByPrefix: Map<string, string> = new Map();
  const additionalFiles: Set<string> = new Set();
  for (const spec of projectSpecs) {
    const {
      name,
      dependencies = [],
      devDependencies = [],
      isBundle,
      dependsOnEnvVars,
      isRig,
      additionalFiles: projectAdditionalFiles = []
    } = spec;
    const projectFolder: string = `${rootFolder}/${name}`;
    const toVersions = (names: ReadonlyArray<string>): Record<string, string> =>
      Object.fromEntries(names.map((dependencyName: string) => [dependencyName, 'workspace:*']));
    const packageJson: RushConfigurationProject['packageJson'] = {
      name,
      version: '1.0.0',
      dependencies: toVersions(dependencies),
      devDependencies: toVersions(devDependencies)
    };
    writeFile(`${name}/package.json`, JSON.stringify(packageJson));
    writeFile(`${name}/tsconfig.json`, '{}');
    writeFile(`${name}/src/one.ts`, 'one');
    writeFile(`${name}/src/sub/two.ts`, 'two');
    if (isRig) {
      writeFile(`${name}/profiles/default/config/heft.json`, '{}');
    }
    for (const file of projectAdditionalFiles) {
      writeFile(file, '{}');
      additionalFiles.add(file);
    }

    const project: RushConfigurationProject = {
      packageName: name,
      projectFolder,
      projectRelativeFolder: name,
      // Outside of the project folder, so that its files are not inputs
      projectRushTempFolder: `${rootFolder}/common/temp/projects/${name}`,
      packageJson,
      rushConfiguration: { commonTempFolder: `${rootFolder}/common/temp` }
    } as unknown as RushConfigurationProject;
    const outputFolderName: string = isBundle ? 'dist' : 'lib';
    const settings: IOperationSettings = {
      operationName: PHASE_NAME,
      outputFolderNames: [outputFolderName],
      dependsOnEnvVars: dependsOnEnvVars ? [...dependsOnEnvVars] : undefined
    };
    const projectConfiguration: RushProjectConfiguration = {
      operationSettingsByOperationName: new Map([[PHASE_NAME, settings]]),
      getCacheDisabledReason: () => undefined
    } as unknown as RushProjectConfiguration;
    projectConfigurations.set(project, projectConfiguration);
    projectMap.set(project, {
      projectConfig: projectConfiguration,
      additionalFilesByOperationName: new Map([[PHASE_NAME, new Set(projectAdditionalFiles)]])
    });
    lookupByPath.setItem(name, project);
    outputFolderByPrefix.set(name, outputFolderName);
    specByFolder.set(projectFolder, spec);

    const runBuild = (kind: IOperationCommandExecution['kind']): number | undefined => {
      commands.push(`${name}:${kind}`);
      return build(projectFolder, !!isBundle, kind === 'incremental');
    };
    const operation: Operation = new Operation({
      phase: buildPhase,
      project,
      settings,
      logFilenameIdentifier: '_phase_build',
      runner: spec.pluginRunner
        ? new PluginOperationRunner(name, runBuild, spec.pluginRunner === 'reported')
        : new ShellOperationRunner({
            phase: buildPhase,
            rushProject: project,
            displayName: name,
            initialCommand: INITIAL_COMMAND,
            incrementalCommand: INCREMENTAL_COMMAND,
            incrementalCommandRequiresGuard: true,
            commandForHash: INITIAL_COMMAND,
            ignoredParameterValues: []
          })
    });
    let dependent: Operation = operation;
    if (hasPassThroughPhase) {
      dependent = new Operation({
        phase: liteBuildPhase,
        project,
        logFilenameIdentifier: liteBuildPhase.logFilenameIdentifier,
        runner: new NullOperationRunner({
          name: `${name} (lite-build)`,
          result: OperationStatus.NoOp,
          silent: true
        })
      });
      operation.addDependency(dependent);
      passThroughOperations.push(dependent);
    }
    for (const dependencyName of [...dependencies, ...devDependencies]) {
      dependent.addDependency(operations.get(dependencyName)!);
    }
    operations.set(name, operation);
  }

  const hooks: PhasedCommandHooks = new PhasedCommandHooks();
  new PhasedOperationPlugin().apply(hooks);
  if (hasIncrementalExecutionGuard) {
    new IncrementalExecutionGuardPlugin().apply(hooks);
  }
  if (hasLegacySkipDetection) {
    new LegacySkipPlugin({
      terminal: new Terminal(new StringBufferTerminalProvider()),
      changedProjectsOnly: false,
      isIncrementalBuildAllowed: true,
      ...legacySkipOptions
    }).apply(hooks);
  }
  const destination: MockWritable = new MockWritable();
  const graphOperations: Set<Operation> = new Set([...operations.values(), ...passThroughOperations]);
  const graph: OperationGraph = new OperationGraph(graphOperations, {
    quietMode: false,
    debugMode: false,
    parallelism: 1,
    allowOversubscription: true,
    destinations: [destination],
    abortController: new AbortController(),
    // Like the graphs of the Rush daemon
    supportsTerminateRunning: true
  });
  await hooks.onGraphCreatedAsync.promise(graph, {
    isIncrementalBuildAllowed: true,
    isWatch: false,
    projectConfigurations
  } as unknown as IOperationGraphContext);
  if (guardOptions) {
    // After the guard plugin registered the guards of the iteration.
    graph.hooks.beforeExecuteIterationAsync.tap(
      { name: 'guardOptions', stage: 1 },
      (records: ReadonlyMap<Operation, IOperationExecutionResult>): void => {
        for (const record of records.values()) {
          const guard: IIncrementalExecutionGuard | undefined = getIncrementalExecutionGuard(record);
          if (guard) {
            setIncrementalExecutionGuard(record, {
              getBlockReasonAsync: () => guard.getBlockReasonAsync(guardOptions),
              verifyIncrementalResultAsync: () => guard.verifyIncrementalResultAsync(guardOptions)
            });
          }
        }
      }
    );
  }
  if (watchesInputs) {
    // Before the guard's taps
    graph.hooks.afterExecuteOperationAsync.tap(
      { name: 'watchesInputs', stage: -2 },
      (record: IOperationExecutionResult): void => {
        const execution: ICommandExecution | undefined = getCommandExecution(record);
        if (execution) {
          setCommandExecution(record, { ...execution, watchesInputs: true });
        }
      }
    );
  }

  // Like `git hash-object` for each file, except the outputs, which are ignored by git.
  const createInputsSnapshot = (environment: Readonly<Record<string, string>>): InputsSnapshot => {
    const workingTreeReadStartTimeMs: number | undefined = recordsWorkingTreeReadStartTime
      ? Date.now()
      : undefined;
    const hashes: Map<string, string> = new Map();
    const hashFile = (file: string): void => {
      const content: Buffer = fs.readFileSync(`${rootFolder}/${file}`);
      hashes.set(file, createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex'));
    };
    for (const [prefix, outputFolderName] of outputFolderByPrefix) {
      for (const file of listFiles(`${rootFolder}/${prefix}`, new Set([outputFolderName]))) {
        hashFile(`${prefix}/${file}`);
      }
    }
    for (const file of additionalFiles) {
      hashFile(file);
    }
    return new InputsSnapshot({
      rootDir: rootFolder,
      hashes,
      hasUncommittedChanges: false,
      lookupByPath,
      projectMap,
      environment: { ...environment },
      workingTreeReadStartTimeMs
    });
  };

  return {
    rootFolder,
    graph,
    operations,
    writeFile,
    deleteFile: (relativePath: string) => fs.rmSync(`${rootFolder}/${relativePath}`),
    recreateFolder: (relativePath: string) => recreateFolder(`${rootFolder}/${relativePath}`),
    executeAsync: async (
      environment: Readonly<Record<string, string>> = {},
      isIncrementalBuildAllowed?: boolean
    ): Promise<ITestIteration> => {
      commands.length = 0;
      destination.reset();
      const result: IExecutionResult = await graph.executeAsync({
        inputsSnapshot: createInputsSnapshot(environment),
        getOperationEnvironment: () => environment,
        isIncrementalBuildAllowed
      });
      return {
        result,
        commands: [...commands],
        output: destination.getAllOutput(),
        getStatus: (name: string) =>
          (result.operationResults.get(operations.get(name)!) as OperationExecutionRecord).status
      };
    },
    waitForHangAsync: () => new Promise<void>((resolve: () => void) => hangWaiters.push(resolve))
  };
}

// Like an editor that saves a file while the command of the operation reads the input files
function changeWhileExecuting(workspace: ITestWorkspace, change: () => void): void {
  let pendingChange: (() => void) | undefined = change;
  workspace.graph.hooks.beforeExecuteOperationAsync.tap('changeWhileExecuting', (): undefined => {
    pendingChange?.();
    pendingChange = undefined;
    return undefined;
  });
}

function readOutput(workspace: ITestWorkspace, relativePath: string): string | undefined {
  const outputPath: string = `${workspace.rootFolder}/${relativePath}`;
  return fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : undefined;
}

describe(IncrementalExecutionGuardPlugin.name, () => {
  it('runs the incremental command for edits of built files, and the initial command otherwise', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }]);
    expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);

    workspace.writeFile('a/src/one.ts', 'one 2');
    const edited: ITestIteration = await workspace.executeAsync();
    expect(edited.commands).toEqual(['a:incremental']);
    expect(edited.getStatus('a')).toBe(OperationStatus.Success);
    expect(edited.output).toContain(`Invoking (incremental): ${INCREMENTAL_COMMAND}`);

    // The result of the incremental command is the base of the next one.
    workspace.writeFile('a/src/sub/two.ts', 'two 2');
    expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);

    // An unchanged workspace runs nothing.
    expect((await workspace.executeAsync()).commands).toEqual([]);
  });

  it('runs the initial command in an iteration that allows no incremental build, and uses its result as the base', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }]);
    await workspace.executeAsync();

    // Like `rush rebuild`, served by a graph of `rush build`: the runner gets no last result.
    workspace.writeFile('a/tsconfig.json', '{ "compilerOptions": {} }');
    const rebuilt: ITestIteration = await workspace.executeAsync({}, false);
    expect(rebuilt.commands).toEqual(['a:initial']);
    expect(rebuilt.output).not.toContain('Not using the incremental command');
    expect((await workspace.executeAsync({}, false)).commands).toEqual(['a:initial']);

    // The configuration file changed after the first iteration, but before the base.
    workspace.writeFile('a/src/one.ts', 'one 2');
    expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);
  });

  interface IInputChangeCase {
    /**
     * The project, `{ name: 'a' }` by default
     */
    readonly spec?: IProjectSpec;
    /**
     * Runs before the first build
     */
    readonly prepare?: (workspace: ITestWorkspace) => void;
    readonly change: (workspace: ITestWorkspace) => void;
    readonly reason: string;
    /**
     * A source file that exists after the change
     */
    readonly sourceFile: string;
  }

  it.each<[string, IInputChangeCase]>([
    [
      'a file is added',
      {
        change: (workspace: ITestWorkspace) => workspace.writeFile('a/src/three.ts', 'three'),
        reason: 'input files were added, deleted or renamed ("a/src/three.ts")',
        sourceFile: 'a/src/three.ts'
      }
    ],
    [
      'a file is deleted',
      {
        change: (workspace: ITestWorkspace) => workspace.deleteFile('a/src/sub/two.ts'),
        reason: 'input files were added, deleted or renamed ("a/src/sub/two.ts")',
        sourceFile: 'a/src/one.ts'
      }
    ],
    [
      'a file is renamed',
      {
        change: (workspace: ITestWorkspace) =>
          fs.renameSync(`${workspace.rootFolder}/a/src/one.ts`, `${workspace.rootFolder}/a/src/uno.ts`),
        reason: 'input files were added, deleted or renamed ("a/src/one.ts", "a/src/uno.ts")',
        sourceFile: 'a/src/uno.ts'
      }
    ],
    [
      'a configuration file changes',
      {
        change: (workspace: ITestWorkspace) => {
          workspace.writeFile('a/src/one.ts', 'one 2');
          workspace.writeFile('a/tsconfig.json', '{ "compilerOptions": {} }');
        },
        reason: 'a configuration file changed ("a/tsconfig.json")',
        sourceFile: 'a/src/one.ts'
      }
    ],
    [
      'a configuration file in a subfolder changes',
      {
        prepare: (workspace: ITestWorkspace) => workspace.writeFile('a/test/tsconfig.json', '{}'),
        change: (workspace: ITestWorkspace) =>
          workspace.writeFile('a/test/tsconfig.json', '{ "compilerOptions": {} }'),
        reason: 'a configuration file changed ("a/test/tsconfig.json")',
        sourceFile: 'a/src/one.ts'
      }
    ],
    [
      'a file in the root folder of the project changes',
      {
        prepare: (workspace: ITestWorkspace) => workspace.writeFile('a/build.js', '// build'),
        change: (workspace: ITestWorkspace) => workspace.writeFile('a/build.js', '// build 2'),
        reason: 'a configuration file changed ("a/build.js")',
        sourceFile: 'a/src/one.ts'
      }
    ],
    [
      'a file in the config folder of the project changes',
      {
        prepare: (workspace: ITestWorkspace) => workspace.writeFile('a/config/heft.json', '{}'),
        change: (workspace: ITestWorkspace) =>
          workspace.writeFile('a/config/heft.json', '{ "phasesByName": {} }'),
        reason: 'a configuration file changed ("a/config/heft.json")',
        sourceFile: 'a/src/one.ts'
      }
    ],
    [
      'a file outside of the project that it depends on changes',
      {
        spec: { name: 'a', additionalFiles: ['tools/shared/data.json'] },
        change: (workspace: ITestWorkspace) =>
          workspace.writeFile('tools/shared/data.json', '{ "edited": true }'),
        reason: 'a configuration file changed ("tools/shared/data.json")',
        sourceFile: 'a/src/one.ts'
      }
    ]
  ])(
    'runs the initial command if %s',
    async (description: string, { spec = { name: 'a' }, prepare, change, reason, sourceFile }) => {
      const workspace: ITestWorkspace = await createWorkspaceAsync([spec]);
      prepare?.(workspace);
      await workspace.executeAsync();

      change(workspace);
      const changed: ITestIteration = await workspace.executeAsync();
      expect(changed.commands).toEqual(['a:initial']);
      expect(changed.output).toContain(`Not using the incremental command because ${reason}.`);

      // The result of the initial command is the new base.
      workspace.writeFile(sourceFile, 'edited');
      expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);
    }
  );

  it('runs the initial command if an environment variable that the operation depends on changes', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a', dependsOnEnvVars: ['MODE'] }]);
    await workspace.executeAsync({ MODE: 'debug' });

    const changed: ITestIteration = await workspace.executeAsync({ MODE: 'ship' });
    expect(changed.commands).toEqual(['a:initial']);
    expect(changed.output).toContain(
      'Not using the incremental command because an environment variable that it depends on changed.'
    );
  });

  it('runs the incremental command of a project whose production dependency changed', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([
      { name: 'a' },
      { name: 'b', dependencies: ['a'] }
    ]);
    await workspace.executeAsync();

    workspace.writeFile('a/src/one.ts', 'one 2');
    expect((await workspace.executeAsync()).commands).toEqual(['a:incremental', 'b:incremental']);
  });

  it.each([
    [
      'a dev dependency',
      [{ name: 'a' }, { name: 'b', devDependencies: ['a'] }],
      'its dependency "a" changed, and it is not a production dependency'
    ],
    [
      'a rig',
      [
        { name: 'a', isRig: true },
        { name: 'b', dependencies: ['a'] }
      ],
      'its dependency "a" changed, and it is a build tool'
    ]
  ])(
    'runs the initial command of a project if %s changed',
    async (description, projectSpecs: IProjectSpec[], reason: string) => {
      const workspace: ITestWorkspace = await createWorkspaceAsync(projectSpecs);
      await workspace.executeAsync();

      workspace.writeFile('a/src/one.ts', 'one 2');
      const changed: ITestIteration = await workspace.executeAsync();
      expect(changed.commands).toEqual(['a:incremental', 'b:initial']);
      expect(changed.output).toContain(`Not using the incremental command because ${reason}.`);
    }
  );

  it('checks the dependencies that an operation has through a phase of its own project without a script', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync(
      [{ name: 'a' }, { name: 'b', devDependencies: ['a'] }, { name: 'c', dependencies: ['a'] }],
      { hasPassThroughPhase: true }
    );
    expect([...(await workspace.executeAsync()).commands].sort()).toEqual([
      'a:initial',
      'b:initial',
      'c:initial'
    ]);

    workspace.writeFile('a/src/one.ts', 'one 2');
    const changed: ITestIteration = await workspace.executeAsync();
    expect([...changed.commands].sort()).toEqual(['a:incremental', 'b:initial', 'c:incremental']);
    expect(changed.output).toContain(
      'Not using the incremental command because its dependency "a" changed, and it is not a production dependency.'
    );

    // A change in the project of the phase without a script is judged by the operation's own inputs.
    workspace.writeFile('b/src/one.ts', 'one 2');
    workspace.writeFile('c/src/one.ts', 'one 2');
    expect([...(await workspace.executeAsync()).commands].sort()).toEqual(['b:incremental', 'c:incremental']);
  });

  it('runs the initial command if the output folders changed since the last run', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }]);
    await workspace.executeAsync();

    // E.g. another tool atomically replaced an output file.
    workspace.writeFile('a/lib/sub/two.js.tmp', 'tampered');
    fs.renameSync(`${workspace.rootFolder}/a/lib/sub/two.js.tmp`, `${workspace.rootFolder}/a/lib/sub/two.js`);
    workspace.writeFile('a/src/one.ts', 'one 2');
    const changed: ITestIteration = await workspace.executeAsync();
    expect(changed.commands).toEqual(['a:initial']);
    expect(changed.output).toContain(
      'Not using the incremental command because its output folders changed since its last successful run.'
    );
  });

  it('runs the initial command if an output file was rewritten in place since the last run', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }]);
    await workspace.executeAsync();

    // E.g. a debugging edit through the symbolic link to the project in node_modules, which keeps the inode.
    fs.appendFileSync(`${workspace.rootFolder}/a/lib/sub/two.js`, '\nconsole.log("debug");');
    workspace.writeFile('a/src/one.ts', 'one 2');
    const changed: ITestIteration = await workspace.executeAsync();
    expect(changed.commands).toEqual(['a:initial']);
    expect(changed.output).toContain(
      'Not using the incremental command because its output folders changed since its last successful run.'
    );
  });

  it('always runs the initial command of an operation that builds a bundle', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a', isBundle: true }]);
    await workspace.executeAsync();

    for (const content of ['one 2', 'one 3']) {
      workspace.writeFile('a/src/one.ts', content);
      const changed: ITestIteration = await workspace.executeAsync();
      expect(changed.commands).toEqual(['a:initial']);
      expect(changed.output).toContain(
        'Not using the incremental command because its outputs include the bundle "dist/main.js".'
      );
    }
  });

  it('runs the initial command after an incremental command that changed which output files exist', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }]);
    await workspace.executeAsync();

    workspace.writeFile('a/src/one.ts', 'one emit:chunk');
    const changed: ITestIteration = await workspace.executeAsync();
    expect(changed.commands).toEqual(['a:incremental', 'a:initial']);
    expect(changed.getStatus('a')).toBe(OperationStatus.Success);
    expect(changed.output).toContain(
      'Running the initial command, because the incremental command changed which output files it has: 1 added ("lib/chunk.js").'
    );

    // Its outputs may be named after their content, so it never runs its incremental command again.
    workspace.writeFile('a/src/sub/two.ts', 'two 2');
    const next: ITestIteration = await workspace.executeAsync();
    expect(next.commands).toEqual(['a:initial']);
    expect(next.output).toContain(
      'Not using the incremental command because its incremental command changed which output files it has in an earlier run: 1 added ("lib/chunk.js").'
    );
  });

  it('runs the incremental command of an operation that builds a bundle for a runner that allows bundles', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a', isBundle: true }], {
      guardOptions: { outputsMayBeBundles: true }
    });
    await workspace.executeAsync();

    for (const content of ['one 2', 'one 3']) {
      workspace.writeFile('a/src/one.ts', content);
      const changed: ITestIteration = await workspace.executeAsync();
      expect(changed.commands).toEqual(['a:incremental']);
      expect(changed.getStatus('a')).toBe(OperationStatus.Success);
      expect(changed.output).not.toContain('Not using the incremental command');
    }
  });

  it('runs only the initial command after an incremental command renamed a content-hashed file, for a runner that allows bundles', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], {
      guardOptions: { outputsMayBeBundles: true }
    });
    await workspace.executeAsync();

    // Like a chunk with webpack's default hash length, which a bundler renames whenever its content changes.
    workspace.writeFile('a/src/one.ts', 'one emit:chunk_0123456789abcdef0123');
    const changed: ITestIteration = await workspace.executeAsync();
    expect(changed.commands).toEqual(['a:incremental', 'a:initial']);
    expect(changed.output).toContain(
      'Running the initial command, because the incremental command changed which output files it has: 1 added ("lib/chunk_0123456789abcdef0123.js").'
    );

    workspace.writeFile('a/src/sub/two.ts', 'two 2');
    const next: ITestIteration = await workspace.executeAsync();
    expect(next.commands).toEqual(['a:initial']);
    expect(next.output).toContain(
      'Not using the incremental command because its incremental command changed which output files it has in an earlier run: 1 added ("lib/chunk_0123456789abcdef0123.js").'
    );
  });

  it('runs the initial command only once after an incremental command that changed which output files exist, for a runner that allows bundles', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], {
      guardOptions: { outputsMayBeBundles: true }
    });
    await workspace.executeAsync();

    workspace.writeFile('a/src/one.ts', 'one emit:chunk');
    const changed: ITestIteration = await workspace.executeAsync();
    expect(changed.commands).toEqual(['a:incremental', 'a:initial']);
    expect(changed.output).toContain(
      'Running the initial command, because the incremental command changed which output files it has: 1 added ("lib/chunk.js").'
    );

    // The initial command removed any stale outputs, and the runner keeps its build state in memory.
    workspace.writeFile('a/src/sub/two.ts', 'two 2');
    expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);
  });

  it('runs the initial command after a folder of its input files was recreated, for a runner that watches its inputs', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], { watchesInputs: true });
    await workspace.executeAsync();

    // Unlike an editor that saves a file by renaming a new file over it
    workspace.writeFile('a/src/sub/two.ts.tmp', 'two 1');
    fs.renameSync(`${workspace.rootFolder}/a/src/sub/two.ts.tmp`, `${workspace.rootFolder}/a/src/sub/two.ts`);
    expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);

    // The input files did not change, but a watcher of the old folder misses later edits of its files.
    workspace.recreateFolder('a/src/sub');
    expect((await workspace.executeAsync()).commands).toEqual([]);
    workspace.writeFile('a/src/sub/two.ts', 'two 2');
    const changed: ITestIteration = await workspace.executeAsync();
    expect(changed.commands).toEqual(['a:initial']);
    expect(changed.output).toContain(
      'Not using the incremental command because folders that held its input files were deleted or recreated since its last run ("a/src/sub").'
    );

    // The process of the initial command watches the new folder.
    workspace.writeFile('a/src/sub/two.ts', 'two 3');
    expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);
  });

  it('names only the top folder of recreated folders of its input files, for a runner that watches its inputs', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], { watchesInputs: true });
    await workspace.executeAsync();

    // Recreates "a/src/sub" as well
    workspace.recreateFolder('a/src');
    workspace.writeFile('a/src/sub/two.ts', 'two 2');
    const changed: ITestIteration = await workspace.executeAsync();
    expect(changed.commands).toEqual(['a:initial']);
    expect(changed.output).toContain(
      'Not using the incremental command because folders that held its input files were deleted or recreated since its last run ("a/src").'
    );
  });

  it('runs the initial command after a folder of its input files was recreated while it ran, for a runner that watches its inputs', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], { watchesInputs: true });
    await workspace.executeAsync();

    // The input files keep their identity, so the result is the base of the next run.
    workspace.writeFile('a/src/one.ts', 'one move:src/sub');
    expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);

    workspace.writeFile('a/src/one.ts', 'one 3');
    const next: ITestIteration = await workspace.executeAsync();
    expect(next.commands).toEqual(['a:initial']);
    expect(next.output).toContain(
      'Not using the incremental command because folders that held its input files were deleted or recreated since its last run ("a/src/sub").'
    );
  });

  it('runs the incremental command after a folder of its input files was recreated, for a runner that does not watch its inputs', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }]);
    await workspace.executeAsync();

    workspace.recreateFolder('a/src/sub');
    workspace.writeFile('a/src/sub/two.ts', 'two 2');
    expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);
  });

  it('runs the incremental command after a folder of its input files was recreated, if its last run was not in a process that watches its inputs', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }]);
    let watchesInputs: boolean = true;
    workspace.graph.hooks.afterExecuteOperationAsync.tap(
      { name: 'watchesInputs', stage: -2 },
      (record: IOperationExecutionResult): void => {
        const execution: ICommandExecution | undefined = getCommandExecution(record);
        if (execution && watchesInputs) {
          setCommandExecution(record, { ...execution, watchesInputs: true });
        }
      }
    );
    await workspace.executeAsync();
    workspace.writeFile('a/src/sub/two.ts', 'two 2');
    expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);

    // E.g. a runner that closed its worker ran the command in a shell. The next process watches the new folder.
    watchesInputs = false;
    workspace.writeFile('a/src/sub/two.ts', 'two 3');
    expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);
    workspace.recreateFolder('a/src/sub');
    workspace.writeFile('a/src/sub/two.ts', 'two 4');
    expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);
  });

  it('runs the initial command after an incremental command that emitted a content-hashed file', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }]);
    await workspace.executeAsync();

    // Like a chunk with webpack's default hash length. Comparing the output files ignores such names.
    workspace.writeFile('a/src/one.ts', 'one emit:chunk_0123456789abcdef0123');
    const changed: ITestIteration = await workspace.executeAsync();
    expect(changed.commands).toEqual(['a:incremental', 'a:initial']);
    expect(changed.getStatus('a')).toBe(OperationStatus.Success);
    expect(changed.output).toContain(
      'Running the initial command, because its outputs include the content-hashed file "lib/chunk_0123456789abcdef0123.js".'
    );

    workspace.writeFile('a/src/sub/two.ts', 'two 2');
    const next: ITestIteration = await workspace.executeAsync();
    expect(next.commands).toEqual(['a:initial']);
    expect(next.output).toContain(
      'Not using the incremental command because its outputs include the content-hashed file "lib/chunk_0123456789abcdef0123.js".'
    );
  });

  it('does not let a later command skip an operation after its incremental command', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], {
      hasLegacySkipDetection: true
    });
    const packageDepsPath: string = `${workspace.rootFolder}/common/temp/projects/a/package-deps__phase_build.json`;
    expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
    expect(fs.existsSync(packageDepsPath)).toBe(true);

    // The outputs of the incremental command can differ from those of the initial command, so a later command,
    // e.g. one that does not use the Rush daemon, must not skip the operation.
    workspace.writeFile('a/src/one.ts', 'one 2');
    expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);
    expect(fs.existsSync(packageDepsPath)).toBe(false);

    workspace.graph.invalidateOperations(undefined, NATIVE_COMMAND_INVALIDATION_REASON);
    expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
    expect(fs.existsSync(packageDepsPath)).toBe(true);
  });

  it('runs the initial command after a failure', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }]);
    await workspace.executeAsync();

    workspace.writeFile('a/src/one.ts', 'error');
    const failed: ITestIteration = await workspace.executeAsync();
    expect(failed.commands).toEqual(['a:incremental']);
    expect(failed.getStatus('a')).toBe(OperationStatus.Failure);

    workspace.writeFile('a/src/one.ts', 'one 2');
    const fixed: ITestIteration = await workspace.executeAsync();
    expect(fixed.commands).toEqual(['a:initial']);
    expect(fixed.output).toContain(
      'Not using the incremental command because its outputs were not built by a successful run of its own command in this process.'
    );
  });

  it('runs the initial command after a command that was terminated, but not for operations that did not start', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([
      { name: 'a' },
      { name: 'b', dependencies: ['a'] }
    ]);
    await workspace.executeAsync();

    // Its incremental command rewrites "lib/one.js" in place, so its output folders list the same files.
    workspace.writeFile('a/src/one.ts', 'one hang');
    const hung: Promise<void> = workspace.waitForHangAsync();
    const execution: Promise<ITestIteration> = workspace.executeAsync();
    await hung;
    await workspace.graph.abortCurrentIterationAsync({ terminateRunning: true });
    const aborted: ITestIteration = await execution;
    expect(aborted.commands).toEqual(['a:incremental']);
    expect(aborted.getStatus('a')).toBe(OperationStatus.Aborted);
    expect(aborted.getStatus('b')).toBe(OperationStatus.Aborted);

    // An aborted operation keeps its last successful result, but not its base if its command started.
    workspace.writeFile('a/src/one.ts', 'one 3');
    const next: ITestIteration = await workspace.executeAsync();
    expect(next.commands).toEqual(['a:initial', 'b:incremental']);
    expect(next.output).toContain(
      'Not using the incremental command because its outputs were not built by a successful run of its own command in this process.'
    );
  });

  it('runs the initial command after a run whose input files changed while it ran', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([
      { name: 'a' },
      { name: 'b', dependencies: ['a'] }
    ]);
    // Like CacheableOperationPlugin, e.g. when the command of "a" rewrites an API report that is one of its inputs.
    let unverifiableProjectName: string | undefined = 'a';
    workspace.graph.hooks.afterExecuteOperationAsync.tap('test', (record: IOperationExecutionResult) => {
      if (record.operation.associatedProject.packageName === unverifiableProjectName) {
        markResultUnverifiable(record);
      }
    });
    expect((await workspace.executeAsync()).commands).toEqual(['a:initial', 'b:initial']);

    unverifiableProjectName = undefined;
    workspace.writeFile('a/src/one.ts', 'one 2');
    const next: ITestIteration = await workspace.executeAsync();
    expect(next.commands).toEqual(['a:initial', 'b:incremental']);
    expect(next.output).toContain(
      'Not using the incremental command because its outputs were not built by a successful run of its own command in this process.'
    );

    workspace.writeFile('a/src/one.ts', 'one 3');
    expect((await workspace.executeAsync()).commands).toEqual(['a:incremental', 'b:incremental']);
  });

  describe('with input files that change while the operation executes', () => {
    it.each<
      [string, (workspace: ITestWorkspace) => void, (workspace: ITestWorkspace) => void, string, string]
    >([
      [
        'a file was edited',
        (workspace: ITestWorkspace) => workspace.writeFile('a/src/sub/two.ts', 'two edited'),
        (workspace: ITestWorkspace) => workspace.writeFile('a/src/sub/two.ts', 'two'),
        'a/lib/sub/two.js',
        'two'
      ],
      [
        'a file was added',
        (workspace: ITestWorkspace) => workspace.writeFile('a/src/three.ts', 'three'),
        (workspace: ITestWorkspace) => workspace.deleteFile('a/src/three.ts'),
        'a/lib/three.js',
        'none'
      ]
    ])(
      'runs the operation again if %s while it executed and was changed back',
      async (
        name: string,
        change: (workspace: ITestWorkspace) => void,
        changeBack: (workspace: ITestWorkspace) => void,
        outputFile: string,
        expectedOutput: string
      ) => {
        const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }]);
        changeWhileExecuting(workspace, () => change(workspace));
        expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
        expect(readOutput(workspace, outputFile) ?? 'none').not.toBe(expectedOutput);

        // The inputs snapshot is the same as that of the last run, but the outputs were built from other inputs.
        changeBack(workspace);
        const next: ITestIteration = await workspace.executeAsync();
        expect(next.commands).toEqual(['a:initial']);
        expect(next.output).toContain(
          'Not using the incremental command because its outputs were not built by a successful run of its own command in this process.'
        );
        expect(readOutput(workspace, outputFile) ?? 'none').toBe(expectedOutput);

        expect((await workspace.executeAsync()).commands).toEqual([]);
      }
    );

    it('runs the operation again if a file was edited while it executed with warnings and was changed back', async () => {
      const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }]);
      workspace.writeFile('a/src/one.ts', 'one warning');
      changeWhileExecuting(workspace, () => workspace.writeFile('a/src/sub/two.ts', 'two edited'));
      const first: ITestIteration = await workspace.executeAsync();
      expect(first.commands).toEqual(['a:initial']);
      expect(first.getStatus('a')).toBe(OperationStatus.SuccessWithWarning);

      workspace.writeFile('a/src/sub/two.ts', 'two');
      const next: ITestIteration = await workspace.executeAsync();
      expect(next.commands).toEqual(['a:initial']);
      expect(next.getStatus('a')).toBe(OperationStatus.SuccessWithWarning);
      expect(readOutput(workspace, 'a/lib/sub/two.js')).toBe('two');
    });

    it('counts a file that was added while it executed as an input file if Git is not found', async () => {
      jest.spyOn(EnvironmentConfiguration, 'gitBinaryPath', 'get').mockReturnValue(undefined);
      jest.spyOn(Executable, 'tryResolve').mockReturnValue(undefined);
      const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }]);
      changeWhileExecuting(workspace, () => workspace.writeFile('a/src/three.ts', 'three'));
      expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);

      workspace.deleteFile('a/src/three.ts');
      expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
      expect(readOutput(workspace, 'a/lib/three.js')).toBeUndefined();
    });

    it.each<[string, string, ReadonlyArray<string>]>([
      [
        'counts a file that was added while it executed as an input file if Git does not ignore it',
        'a/src/three.ts',
        ['a:initial']
      ],
      [
        'does not count a file that was added while it executed as an input file if Git ignores it',
        'a/src/three.log',
        []
      ]
    ])('%s', async (name: string, addedFile: string, expectedCommands: ReadonlyArray<string>) => {
      const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }]);
      expect(
        Executable.spawnSync('git', ['init', '--quiet'], { currentWorkingDirectory: workspace.rootFolder })
          .status
      ).toBe(0);
      workspace.writeFile('.gitignore', '*.log\n');
      changeWhileExecuting(workspace, () => workspace.writeFile(addedFile, 'three'));
      expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);

      // The inputs snapshot is the same as that of the last run.
      workspace.deleteFile(addedFile);
      expect((await workspace.executeAsync()).commands).toEqual(expectedCommands);
    });

    it.each([false, true])(
      'runs the initial command after an incremental command whose input files changed while it ran (watches inputs: %s)',
      async (watchesInputs: boolean) => {
        const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], { watchesInputs });
        await workspace.executeAsync();

        workspace.writeFile('a/src/one.ts', 'one 2');
        changeWhileExecuting(workspace, () => workspace.writeFile('a/src/sub/two.ts', 'two 2'));
        expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);

        workspace.writeFile('a/src/one.ts', 'one 3');
        const next: ITestIteration = await workspace.executeAsync();
        expect(next.commands).toEqual(['a:initial']);
        expect(next.output).toContain(
          'Not using the incremental command because its outputs were not built by a successful run of its own command in this process.'
        );

        workspace.writeFile('a/src/one.ts', 'one 4');
        expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);
      }
    );

    it('runs the initial command after a folder of its input files was recreated while its first run ran, for a runner that watches its inputs', async () => {
      const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], { watchesInputs: true });
      // The folders that held its input files are read after the first run, so they cannot show the change.
      workspace.writeFile('a/src/one.ts', 'one recreate:src/sub');
      expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);

      workspace.writeFile('a/src/one.ts', 'one 2');
      const next: ITestIteration = await workspace.executeAsync();
      expect(next.commands).toEqual(['a:initial']);
      expect(next.output).toContain(
        'Not using the incremental command because its outputs were not built by a successful run of its own command in this process.'
      );
    });

    it('runs the operation again if a file was saved while the inputs snapshot was being taken', async () => {
      const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], {
        recordsWorkingTreeReadStartTime: true
      });
      // Saved after it was hashed, and before its state was captured, so its state does not change afterwards
      let isSaved: boolean = false;
      workspace.graph.hooks.beforeExecuteIterationAsync.tap('saveWhileSnapshotting', (): undefined => {
        if (!isSaved) {
          workspace.writeFile('a/src/sub/two.ts', 'two saved');
          isSaved = true;
        }
        return undefined;
      });
      expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
      expect(readOutput(workspace, 'a/lib/sub/two.js')).toBe('two saved');

      workspace.writeFile('a/src/sub/two.ts', 'two');
      expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
      expect(readOutput(workspace, 'a/lib/sub/two.js')).toBe('two');

      // The files saved since the last snapshot started have the hashes that it recorded.
      expect((await workspace.executeAsync()).commands).toEqual([]);
    });

    it('does not let a later command skip the operation', async () => {
      const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], {
        hasLegacySkipDetection: true
      });
      const packageDepsPath: string = `${workspace.rootFolder}/common/temp/projects/a/package-deps__phase_build.json`;
      changeWhileExecuting(workspace, () => workspace.writeFile('a/src/sub/two.ts', 'two edited'));
      expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
      expect(fs.existsSync(packageDepsPath)).toBe(false);

      workspace.writeFile('a/src/sub/two.ts', 'two');
      expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
      expect(fs.existsSync(packageDepsPath)).toBe(true);
      expect(readOutput(workspace, 'a/lib/sub/two.js')).toBe('two');
    });

    it('does not let a later command skip the operation if a plugin that is applied later finds the change', async () => {
      const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], {
        hasLegacySkipDetection: true
      });
      const packageDepsPath: string = `${workspace.rootFolder}/common/temp/projects/a/package-deps__phase_build.json`;
      // After the taps of the plugins of the workspace
      workspace.graph.hooks.afterExecuteOperationAsync.tap('test', (record: IOperationExecutionResult) =>
        markResultUnverifiable(record)
      );
      expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
      expect(fs.existsSync(packageDepsPath)).toBe(false);
    });

    it('leaves the check to another plugin that checks the input files', async () => {
      const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }]);
      // Like CacheableOperationPlugin
      workspace.graph.hooks.beforeExecuteIterationAsync.tap(
        'checksInputFiles',
        (records: ReadonlyMap<Operation, IOperationExecutionResult>): undefined => {
          for (const record of records.values()) {
            markInputFilesChecked(record);
          }
          return undefined;
        }
      );
      changeWhileExecuting(workspace, () => workspace.writeFile('a/src/sub/two.ts', 'two edited'));
      expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);

      // The other plugin did not mark the result as unverifiable.
      workspace.writeFile('a/src/sub/two.ts', 'two');
      expect((await workspace.executeAsync()).commands).toEqual([]);
    });
  });

  it('forgets every base after a native command, but not after an input change', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }, { name: 'b' }]);
    await workspace.executeAsync();

    workspace.graph.invalidateOperations(
      [workspace.operations.get('a')!],
      INPUTS_CHANGED_INVALIDATION_REASON
    );
    workspace.writeFile('a/src/one.ts', 'one 2');
    expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);

    workspace.graph.invalidateOperations(undefined, NATIVE_COMMAND_INVALIDATION_REASON);
    workspace.writeFile('a/src/one.ts', 'one 3');
    workspace.writeFile('b/src/one.ts', 'one 3');
    expect([...(await workspace.executeAsync()).commands].sort()).toEqual(['a:initial', 'b:initial']);
  });

  it('forgets the base of an operation that is invalidated for another reason', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }, { name: 'b' }]);
    await workspace.executeAsync();

    // E.g. a client of the Rush daemon that invalidates the operation.
    workspace.graph.invalidateOperations([workspace.operations.get('a')!], 'daemon graph invalidate');
    workspace.writeFile('a/src/one.ts', 'one 2');
    workspace.writeFile('b/src/one.ts', 'one 2');
    const next: ITestIteration = await workspace.executeAsync();
    expect([...next.commands].sort()).toEqual(['a:initial', 'b:incremental']);
    expect(next.output).toContain(
      'Not using the incremental command because its outputs were not built by a successful run of its own command in this process.'
    );
  });

  describe('with a runner that uses the public API, like that of a Rush plugin', () => {
    const wasIterationIncremental = (workspace: ITestWorkspace, iteration: ITestIteration): boolean =>
      wasExecutedIncrementally(iteration.result.operationResults.get(workspace.operations.get('a')!)!);

    it('runs its incremental command when the guard allows it, and its initial command otherwise', async () => {
      const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a', pluginRunner: 'reported' }]);
      expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);

      workspace.writeFile('a/src/one.ts', 'one 2');
      const edited: ITestIteration = await workspace.executeAsync();
      expect(edited.commands).toEqual(['a:incremental']);
      expect(edited.getStatus('a')).toBe(OperationStatus.Success);
      // So the build cache and legacy skip detection ignore its outputs.
      expect(wasIterationIncremental(workspace, edited)).toBe(true);

      workspace.writeFile('a/src/three.ts', 'three');
      const added: ITestIteration = await workspace.executeAsync();
      expect(added.commands).toEqual(['a:initial']);
      expect(added.output).toContain(
        'Not using the incremental command because input files were added, deleted or renamed ("a/src/three.ts").'
      );
      expect(wasIterationIncremental(workspace, added)).toBe(false);

      workspace.writeFile('a/src/one.ts', 'one emit:chunk');
      const changed: ITestIteration = await workspace.executeAsync();
      expect(changed.commands).toEqual(['a:incremental', 'a:initial']);
      expect(changed.output).toContain(
        'Running the initial command, because the incremental command changed which output files it has: 1 added ("lib/chunk.js").'
      );
      expect(wasIterationIncremental(workspace, changed)).toBe(false);
    });

    it('never runs its incremental command if it does not report which command it runs', async () => {
      const workspace: ITestWorkspace = await createWorkspaceAsync([
        { name: 'a', pluginRunner: 'unreported' }
      ]);
      await workspace.executeAsync();

      workspace.writeFile('a/src/one.ts', 'one 2');
      const edited: ITestIteration = await workspace.executeAsync();
      expect(edited.commands).toEqual(['a:initial']);
      expect(edited.output).toContain(
        'Not using the incremental command because its outputs were not built by a successful run of its own command in this process.'
      );
      expect(wasIterationIncremental(workspace, edited)).toBe(false);
    });
  });
});

describe(LegacySkipPlugin.name, () => {
  // Like `rush build` without the Rush daemon, or a Rush daemon whose `daemon.incrementalBuilds` setting is off
  const legacyOptions: IWorkspaceOptions = {
    hasLegacySkipDetection: true,
    hasIncrementalExecutionGuard: false
  };
  const getPackageDepsPath = (workspace: ITestWorkspace): string =>
    `${workspace.rootFolder}/common/temp/projects/a/package-deps__phase_build.json`;
  // Like a later Rush command, which creates a new graph, so that only the package-deps files remain.
  const startLaterCommand = (workspace: ITestWorkspace): void =>
    workspace.graph.deleteResults(workspace.graph.operations);

  it('skips the operation in a later command if its input files did not change', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], legacyOptions);
    expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
    expect(fs.existsSync(getPackageDepsPath(workspace))).toBe(true);

    startLaterCommand(workspace);
    const next: ITestIteration = await workspace.executeAsync();
    expect(next.commands).toEqual([]);
    expect(next.getStatus('a')).toBe(OperationStatus.Skipped);
  });

  it.each<[string, (workspace: ITestWorkspace) => void, (workspace: ITestWorkspace) => void, string, string]>(
    [
      [
        'a file was edited',
        (workspace: ITestWorkspace) => workspace.writeFile('a/src/sub/two.ts', 'two edited'),
        (workspace: ITestWorkspace) => workspace.writeFile('a/src/sub/two.ts', 'two'),
        'a/lib/sub/two.js',
        'two'
      ],
      [
        'a file was added',
        (workspace: ITestWorkspace) => workspace.writeFile('a/src/three.ts', 'three'),
        (workspace: ITestWorkspace) => workspace.deleteFile('a/src/three.ts'),
        'a/lib/three.js',
        'none'
      ]
    ]
  )(
    'runs the operation in a later command if %s while it executed and was changed back',
    async (
      name: string,
      change: (workspace: ITestWorkspace) => void,
      changeBack: (workspace: ITestWorkspace) => void,
      outputFile: string,
      expectedOutput: string
    ) => {
      const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], legacyOptions);
      changeWhileExecuting(workspace, () => change(workspace));
      expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
      expect(fs.existsSync(getPackageDepsPath(workspace))).toBe(false);

      // The inputs snapshot is the same as that of the last run, but the outputs were built from other inputs.
      changeBack(workspace);
      startLaterCommand(workspace);
      expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
      expect(readOutput(workspace, outputFile) ?? 'none').toBe(expectedOutput);
      expect(fs.existsSync(getPackageDepsPath(workspace))).toBe(true);
    }
  );

  it('runs the operation again in a long-lived graph if a file was edited while it executed and was changed back', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], legacyOptions);
    changeWhileExecuting(workspace, () => workspace.writeFile('a/src/sub/two.ts', 'two edited'));
    expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);

    workspace.writeFile('a/src/sub/two.ts', 'two');
    expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
    expect(readOutput(workspace, 'a/lib/sub/two.js')).toBe('two');

    expect((await workspace.executeAsync()).commands).toEqual([]);
  });

  it('runs the operation in a later command if a file was saved while the inputs snapshot was being taken', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], {
      ...legacyOptions,
      recordsWorkingTreeReadStartTime: true
    });
    // Saved after it was hashed, and before its state was captured, so its state does not change afterwards
    let isSaved: boolean = false;
    workspace.graph.hooks.beforeExecuteIterationAsync.tap(
      { name: 'saveWhileSnapshotting', stage: -1 },
      (): undefined => {
        if (!isSaved) {
          workspace.writeFile('a/src/sub/two.ts', 'two saved');
          isSaved = true;
        }
        return undefined;
      }
    );
    expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
    expect(readOutput(workspace, 'a/lib/sub/two.js')).toBe('two saved');
    expect(fs.existsSync(getPackageDepsPath(workspace))).toBe(false);

    workspace.writeFile('a/src/sub/two.ts', 'two');
    startLaterCommand(workspace);
    expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
    expect(readOutput(workspace, 'a/lib/sub/two.js')).toBe('two');
  });

  it('runs the operation in a later command if a file was edited while it executed with allowed warnings', async () => {
    jest.spyOn(EnvironmentConfiguration, 'allowWarningsInSuccessfulBuild', 'get').mockReturnValue(true);
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], {
      ...legacyOptions,
      legacySkipOptions: { allowWarningsInSuccessfulBuild: true }
    });
    workspace.writeFile('a/src/one.ts', 'one warning');
    changeWhileExecuting(workspace, () => workspace.writeFile('a/src/sub/two.ts', 'two edited'));
    const first: ITestIteration = await workspace.executeAsync();
    expect(first.commands).toEqual(['a:initial']);
    expect(first.getStatus('a')).toBe(OperationStatus.SuccessWithWarning);
    expect(fs.existsSync(getPackageDepsPath(workspace))).toBe(false);

    workspace.writeFile('a/src/sub/two.ts', 'two');
    startLaterCommand(workspace);
    const next: ITestIteration = await workspace.executeAsync();
    expect(next.commands).toEqual(['a:initial']);
    expect(next.getStatus('a')).toBe(OperationStatus.SuccessWithWarning);
    expect(readOutput(workspace, 'a/lib/sub/two.js')).toBe('two');
    // The warnings are allowed, so a later command can skip the operation.
    expect(fs.existsSync(getPackageDepsPath(workspace))).toBe(true);
  });

  it('does not write the package-deps file of a rebuild whose input files changed while it executed', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], {
      ...legacyOptions,
      legacySkipOptions: { isIncrementalBuildAllowed: false }
    });
    changeWhileExecuting(workspace, () => workspace.writeFile('a/src/sub/two.ts', 'two edited'));
    expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
    expect(fs.existsSync(getPackageDepsPath(workspace))).toBe(false);

    startLaterCommand(workspace);
    expect((await workspace.executeAsync()).commands).toEqual(['a:initial']);
    // So that a later build can skip the operation
    expect(fs.existsSync(getPackageDepsPath(workspace))).toBe(true);
  });

  it('checks the input files of an incremental command for IncrementalExecutionGuardPlugin', async () => {
    const workspace: ITestWorkspace = await createWorkspaceAsync([{ name: 'a' }], {
      hasLegacySkipDetection: true
    });
    await workspace.executeAsync();

    workspace.writeFile('a/src/one.ts', 'one 2');
    changeWhileExecuting(workspace, () => workspace.writeFile('a/src/sub/two.ts', 'two 2'));
    expect((await workspace.executeAsync()).commands).toEqual(['a:incremental']);

    workspace.writeFile('a/src/one.ts', 'one 3');
    const next: ITestIteration = await workspace.executeAsync();
    expect(next.commands).toEqual(['a:initial']);
    expect(next.output).toContain(
      'Not using the incremental command because its outputs were not built by a successful run of its own command in this process.'
    );
  });
});
