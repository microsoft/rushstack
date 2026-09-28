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
import { SubprocessTerminator } from '@rushstack/node-core-library';
import { MockWritable, StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IOperationSettings, RushProjectConfiguration } from '../../../api/RushProjectConfiguration';
import { PhasedCommandHooks, type IOperationGraphContext } from '../../../pluginFramework/PhasedCommandHooks';
import { Utilities } from '../../../utilities/Utilities';
import { InputsSnapshot, type IInputsSnapshotProjectMetadata } from '../../incremental/InputsSnapshot';
import { IncrementalExecutionGuardPlugin } from '../IncrementalExecutionGuardPlugin';
import {
  INPUTS_CHANGED_INVALIDATION_REASON,
  NATIVE_COMMAND_INVALIDATION_REASON
} from '../IncrementalExecutionState';
import type { IExecutionResult, IOperationExecutionResult } from '../IOperationExecutionResult';
import { LegacySkipPlugin } from '../LegacySkipPlugin';
import { NullOperationRunner } from '../NullOperationRunner';
import { Operation } from '../Operation';
import type { OperationExecutionRecord } from '../OperationExecutionRecord';
import { OperationGraph } from '../OperationGraph';
import { OperationStatus } from '../OperationStatus';
import { PhasedOperationPlugin } from '../PhasedOperationPlugin';
import { markResultUnverifiable } from '../RetainedResultVerification';
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
}

interface IWorkspaceOptions {
  /**
   * If set, like the phases of the rushstack repo, the build of each project depends only on a `_phase:lite-build`
   * operation of its own project, which has no script and depends on the builds of the project's dependencies.
   */
  readonly hasPassThroughPhase?: boolean;
  /**
   * If set, applies the skip detection that Rush uses when the build cache is not enabled.
   */
  readonly hasLegacySkipDetection?: boolean;
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
  executeAsync(environment?: Readonly<Record<string, string>>): Promise<ITestIteration>;
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

// Like a compiler: writes a file per source file, and its incremental mode neither cleans the output folder nor
// deletes the outputs of deleted source files. A source containing "emit:<name>" also emits "<name>.js", a
// source containing "error" fails the build, and after the output of a source containing "hang", the build runs
// until it is terminated (it returns undefined).
function build(projectFolder: string, isBundle: boolean, isIncremental: boolean): number | undefined {
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
    if (source.includes('hang')) {
      return undefined;
    }
  }
  if (isBundle) {
    fs.writeFileSync(`${outputFolder}/main.js`, bundle.join('\n'));
  }
  return 0;
}

async function createWorkspaceAsync(
  projectSpecs: ReadonlyArray<IProjectSpec>,
  { hasPassThroughPhase, hasLegacySkipDetection }: IWorkspaceOptions = {}
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
      const exitCode: number | undefined = build(workingDirectory, !!spec.isBundle, isIncremental);
      const child: childProcess.ChildProcess = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        stdio: []
      }) as unknown as childProcess.ChildProcess;
      if (exitCode === undefined) {
        for (const resolve of hangWaiters.splice(0)) {
          resolve();
        }
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

    const operation: Operation = new Operation({
      phase: buildPhase,
      project,
      settings,
      logFilenameIdentifier: '_phase_build',
      runner: new ShellOperationRunner({
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
  new IncrementalExecutionGuardPlugin().apply(hooks);
  if (hasLegacySkipDetection) {
    new LegacySkipPlugin({
      terminal: new Terminal(new StringBufferTerminalProvider()),
      changedProjectsOnly: false,
      isIncrementalBuildAllowed: true
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

  // Like `git hash-object` for each file, except the outputs, which are ignored by git.
  const createInputsSnapshot = (environment: Readonly<Record<string, string>>): InputsSnapshot => {
    const hashes: Map<string, string> = new Map();
    const hashFile = (file: string): void => {
      const content: Buffer = fs.readFileSync(`${rootFolder}/${file}`);
      hashes.set(file, createHash('sha1').update(content).digest('hex'));
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
      environment: { ...environment }
    });
  };

  return {
    rootFolder,
    graph,
    operations,
    writeFile,
    deleteFile: (relativePath: string) => fs.rmSync(`${rootFolder}/${relativePath}`),
    executeAsync: async (environment: Readonly<Record<string, string>> = {}): Promise<ITestIteration> => {
      commands.length = 0;
      destination.reset();
      const result: IExecutionResult = await graph.executeAsync({
        inputsSnapshot: createInputsSnapshot(environment),
        getOperationEnvironment: () => environment
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
});
