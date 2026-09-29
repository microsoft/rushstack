// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash, type Hash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { FileSystem, InternalError, Path } from '@rushstack/node-core-library';

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IInputsSnapshot } from '../incremental/InputsSnapshot';
import type {
  IOperationGraphContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
import type { IOperationGraph, IOperationGraphIterationOptions } from './IOperationGraph';
import type { IOperationRunnerContext } from './IOperationRunner';
import type { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';
import {
  getCommandExecution,
  INPUTS_CHANGED_INVALIDATION_REASON,
  NATIVE_COMMAND_INVALIDATION_REASON,
  setIncrementalExecutionGuard,
  type ICommandExecution,
  type IIncrementalExecutionGuard,
  type IIncrementalExecutionGuardOptions
} from './IncrementalExecutionState';
import {
  describeOutputFileChanges,
  hasContentHashedOutputChange,
  readOperationOutputManifestAsync,
  type IOperationOutputManifest
} from './OperationOutputManifest';
import { isResultUnverifiable } from './RetainedResultVerification';

const PLUGIN_NAME: 'IncrementalExecutionGuardPlugin' = 'IncrementalExecutionGuardPlugin';

// Runs after the default-stage taps, e.g. CacheableOperationPlugin's input file checks, which can mark a result as
// unverifiable.
const RECORD_RESULT_STAGE: number = 1;
// Runs before those checks, so that a folder that was recreated before the input folders were read makes the result
// unverifiable, if the build cache checks the operation's input files.
const READ_INPUT_FOLDERS_STAGE: number = -1;

const MAX_EXAMPLE_PATHS: number = 3;

// Project files that configure a build rather than being built by it.
const CONFIG_INPUT_FILE_NAME_REGEXP: RegExp =
  /^(?:package\.json|tsconfig[^/]*\.json|\.eslintrc[^/]*|eslint\.config\.[^/]+|\.eslintignore|\.babelrc[^/]*|babel\.config\.[^/]+|[^/]+\.config\.(?:[cm]?[jt]s|json)|\.npmrc|\.browserslistrc|\.gitignore)$/;
const CONFIG_INPUT_FOLDER_REGEXP: RegExp = /^(?:config|\.rush)\//;
// Dependencies that are part of the build toolchain, even when they are production dependencies.
const TOOLING_PACKAGE_NAME_REGEXP: RegExp =
  /(?:^|[/-])(?:eslint-(?:config|plugin)|tsconfig|prettier-config|babel-(?:preset|plugin))(?:-|$)/;

/**
 * The inputs of an operation that decide whether it may run its incremental command, as of one inputs snapshot.
 */
export interface IIncrementalInputState {
  /**
   * The path of the operation's project folder relative to the root of the inputs snapshot, with a trailing `/`,
   * or an empty string for a project at the root.
   */
  readonly projectPrefix: string;
  /**
   * The configuration hash of the operation's runner, e.g. its command line.
   */
  readonly configHash: string;
  /**
   * The values of the environment variables that the operation depends on.
   */
  readonly environment: string;
  /**
   * The state hash of each dependency of the operation, including the dependencies that it has through operations
   * of its own project, by operation name.
   */
  readonly dependencyStateHashes: ReadonlyMap<string, string>;
  /**
   * Covers the paths of the operation's input files.
   */
  readonly inputPathsDigest: string;
  /**
   * Covers the paths and hashes of the operation's configuration input files.
   */
  readonly configInputsDigest: string;
  /**
   * The operation's input files and their hashes, used to name changed files while the snapshot is in memory.
   */
  readonly inputFiles: WeakRef<ReadonlyMap<string, string>>;
}

/**
 * Captures the inputs of an operation that decide whether it may run its incremental command.
 *
 * @param record - The operation's result or execution record in the iteration that uses `inputsSnapshot`
 * @param inputsSnapshot - The inputs snapshot of the iteration
 * @param environment - The environment that the operation runs with in the iteration
 * @param records - The results or execution records of the iteration, by operation
 */
export function captureIncrementalInputState(
  record: IOperationExecutionResult,
  inputsSnapshot: IInputsSnapshot,
  environment: Readonly<Record<string, string | undefined>>,
  records: ReadonlyMap<Operation, IOperationExecutionResult>
): IIncrementalInputState {
  const { operation } = record;
  const { associatedProject: project, associatedPhase: phase, settings } = operation;
  const { config } = record.getStateHashComponents();

  const inputFiles: ReadonlyMap<string, string> = inputsSnapshot.getTrackedFileHashesForOperation(
    project,
    phase.name
  );
  const projectPrefix: string = getProjectPrefix(inputsSnapshot, project);
  const inputPathsHash: Hash = createHash('sha1');
  const configInputsHash: Hash = createHash('sha1');
  for (const filePath of Array.from(inputFiles.keys()).sort()) {
    inputPathsHash.update(`${filePath}\n`);
    if (isConfigInput(filePath, projectPrefix)) {
      configInputsHash.update(`${filePath}\0${inputFiles.get(filePath)}\n`);
    }
  }

  const dependencyStateHashes: Map<string, string> = new Map();
  for (const [name, dependency] of getGuardedDependencies(operation)) {
    const dependencyRecord: IOperationExecutionResult | undefined = records.get(dependency);
    if (!dependencyRecord) {
      throw new InternalError(`The iteration has no record of the operation "${name}".`);
    }
    dependencyStateHashes.set(name, dependencyRecord.getStateHash());
  }

  return {
    projectPrefix,
    configHash: config,
    environment: (settings?.dependsOnEnvVars ?? [])
      .map((name: string) => `${name}=${environment[name] || ''}`)
      .join('\n'),
    dependencyStateHashes,
    inputPathsDigest: inputPathsHash.digest('hex'),
    configInputsDigest: configInputsHash.digest('hex'),
    inputFiles: new WeakRef(inputFiles)
  };
}

/**
 * Returns why an operation must not run its incremental command on top of the outputs of its last successful run,
 * judging by how its inputs changed since that run, or `undefined` if the inputs allow it.
 *
 * @remarks
 * The incremental command is only trusted to handle edits of the files that the operation builds. It may keep the
 * outputs of deleted or renamed files, and it may not notice a change to the configuration or the tools of the
 * build. The inputs therefore only allow it if these are unchanged:
 *
 * - the operation's command line and the environment variables that it depends on;
 * - the set of its input files, so that no file was added, deleted or renamed;
 * - its configuration input files: any file outside of the project folder (e.g. the shrinkwrap file or a global
 *   additional file), any file in the project's root folder, `config/` or `.rush/` folders, and configuration files
 *   such as `tsconfig*.json`, `.eslintrc*` or `*.config.js` anywhere in the project;
 * - the set of its dependencies, and each dependency that belongs to another project and is not a production
 *   dependency (`dependencies`, `optionalDependencies` or `peerDependencies` in package.json), or that is a build
 *   tool such as a rig, a Heft plugin or a lint configuration. This includes the dependencies that the operation has
 *   through operations of its own project, e.g. through a phase without a script that only orders its build after
 *   the builds of other projects.
 *
 * @param operation - The operation
 * @param lastState - The inputs of the operation's last successful run
 * @param currentState - The inputs of the run that is about to start
 */
export function getIncrementalInputChangeReason(
  operation: Operation,
  lastState: IIncrementalInputState,
  currentState: IIncrementalInputState
): string | undefined {
  if (lastState.configHash !== currentState.configHash) {
    return 'its command line changed';
  }
  if (lastState.environment !== currentState.environment) {
    return 'an environment variable that it depends on changed';
  }
  if (lastState.inputPathsDigest !== currentState.inputPathsDigest) {
    return `input files were added, deleted or renamed${describeInputFileChanges(
      lastState,
      currentState,
      (lastHash: string | undefined, currentHash: string | undefined) =>
        (lastHash === undefined) !== (currentHash === undefined)
    )}`;
  }
  if (lastState.configInputsDigest !== currentState.configInputsDigest) {
    return `a configuration file changed${describeInputFileChanges(
      lastState,
      currentState,
      (lastHash: string | undefined, currentHash: string | undefined, filePath: string) =>
        lastHash !== currentHash && isConfigInput(filePath, currentState.projectPrefix)
    )}`;
  }

  const { dependencyStateHashes: lastDependencies } = lastState;
  const { dependencyStateHashes: currentDependencies } = currentState;
  if (lastDependencies.size !== currentDependencies.size) {
    return 'its dependencies changed';
  }
  const dependencyByName: ReadonlyMap<string, Operation> = getGuardedDependencies(operation);
  for (const [name, stateHash] of currentDependencies) {
    const lastStateHash: string | undefined = lastDependencies.get(name);
    const dependency: Operation | undefined = dependencyByName.get(name);
    if (lastStateHash === undefined || !dependency) {
      return 'its dependencies changed';
    }
    if (lastStateHash !== stateHash) {
      const reason: string | undefined = getToolingDependencyReason(operation, dependency);
      if (reason) {
        return reason;
      }
    }
  }

  return undefined;
}

/**
 * Lets operations of a long-lived host, such as the Rush daemon, run their `:incremental` command outside watch mode
 * when doing so builds the same outputs as their initial command.
 *
 * @remarks
 * An operation runs its incremental command only if all of these hold, and its initial command otherwise:
 *
 * 1. Its last result in this graph is a success of its own command, not a result restored from the build cache, a
 *    failure, or a run that was interrupted or whose input files changed while it ran. A native Rush command that
 *    ran in the workspace since then forgets every such result.
 * 2. Its inputs changed as {@link getIncrementalInputChangeReason} allows.
 * 3. If that run was in a process that keeps watching the input files, such as a warm worker, none of the folders
 *    that held its input files was deleted or recreated since that run. A watcher can miss changes in such a folder,
 *    e.g. one that a branch switch recreated.
 * 4. Its declared output folders hold the same files and folders as at the end of that run, and none of the folders
 *    was recreated or had an entry added, removed or replaced since then.
 * 5. Its outputs do not include bundles (JavaScript or CSS in a `dist` or `release` folder, or with a content hash in
 *    the name). A bundler can replace a chunk with a differently named one and leave the old one behind. A runner
 *    whose incremental runs keep the previous build in memory can accept bundles with `outputsMayBeBundles`.
 *
 * When the incremental command succeeds, the operation's output files must be the files that it had before, or the
 * initial command runs as well. The operation then never runs its incremental command again in this graph, unless
 * the runner passed `outputsMayBeBundles` and no content-hashed output was added or removed. Results of the
 * incremental command are never written to the build cache (see `CacheableOperationPlugin`).
 */
export class IncrementalExecutionGuardPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph: IOperationGraph, context: IOperationGraphContext) => {
      if (context.isIncrementalBuildAllowed && !context.isWatch) {
        applyToGraph(graph);
      }
    });
  }
}

interface IOutputState {
  readonly signature: string;
  readonly cleanOnlyReason: string | undefined;
}

interface IIncrementalBase {
  readonly inputs: IIncrementalInputState;
  // The identity of each folder that held an input file, if the last run was in a process that keeps watching the
  // input files. Read before that run started, unless no check preceded it.
  readonly inputFolders: ReadonlyMap<string, string> | undefined;
  // Rejects if the output folders could not be read.
  readonly outputsPromise: Promise<IOutputState>;
}

interface IRecordState {
  readonly records: ReadonlyMap<Operation, IOperationExecutionResult>;
  readonly inputsSnapshot: IInputsSnapshot;
  readonly getOperationEnvironment: IOperationGraphIterationOptions['getOperationEnvironment'];
  preRunOutputs?: IOperationOutputManifest;
  verifiedOutputs?: IOutputState;
  inputFolders?: ReadonlyMap<string, string>;
}

function applyToGraph(graph: IOperationGraph): void {
  const baseByOperation: Map<Operation, IIncrementalBase> = new Map();
  // Callers that pass `outputsMayBeBundles` add an entry only after their incremental command renamed a
  // content-hashed output. An operation keeps its runner for the life of the graph.
  const cleanOnlyReasonByOperation: Map<Operation, string> = new Map();
  const stateByRecord: WeakMap<IOperationExecutionResult, IRecordState> = new WeakMap();

  graph.hooks.beforeExecuteIterationAsync.tap(
    PLUGIN_NAME,
    (
      records: ReadonlyMap<Operation, IOperationExecutionResult>,
      iterationOptions: IOperationGraphIterationOptions
    ): void => {
      const { inputsSnapshot, getOperationEnvironment } = iterationOptions;
      if (!inputsSnapshot) {
        // Without a snapshot the inputs of later runs cannot be compared with those of this one.
        baseByOperation.clear();
        return;
      }
      for (const record of records.values()) {
        const recordState: IRecordState = { records, inputsSnapshot, getOperationEnvironment };
        stateByRecord.set(record, recordState);
        const guard: IIncrementalExecutionGuard = {
          getBlockReasonAsync: (options?: IIncrementalExecutionGuardOptions) =>
            getBlockReasonAsync(record, recordState, options),
          verifyIncrementalResultAsync: (options?: IIncrementalExecutionGuardOptions) =>
            verifyIncrementalResultAsync(record, recordState, options)
        };
        setIncrementalExecutionGuard(record, guard);
      }
    }
  );

  async function getBlockReasonAsync(
    record: IOperationExecutionResult,
    recordState: IRecordState,
    { outputsMayBeBundles = false }: IIncrementalExecutionGuardOptions = {}
  ): Promise<string | undefined> {
    const { operation } = record;
    const cleanOnlyReason: string | undefined = cleanOnlyReasonByOperation.get(operation);
    if (cleanOnlyReason) {
      return cleanOnlyReason;
    }
    const base: IIncrementalBase | undefined = baseByOperation.get(operation);
    if (!base) {
      return 'its outputs were not built by a successful run of its own command in this process';
    }
    let changedFolders: string[] | undefined;
    if (base.inputFolders) {
      // Read before the command starts, so that the next check notices a folder that is recreated while it runs.
      const inputFolders: ReadonlyMap<string, string> = readInputFolderIdentities(
        operation,
        recordState.inputsSnapshot
      );
      recordState.inputFolders = inputFolders;
      changedFolders = getChangedFolders(base.inputFolders, inputFolders);
    }

    const inputChangeReason: string | undefined = getIncrementalInputChangeReason(
      operation,
      base.inputs,
      captureIncrementalInputState(
        record,
        recordState.inputsSnapshot,
        getEnvironment(record, recordState),
        recordState.records
      )
    );
    if (inputChangeReason) {
      return inputChangeReason;
    }
    if (changedFolders?.length) {
      return `folders that held its input files were deleted or recreated since its last run${formatExamplePaths(
        changedFolders
      )}`;
    }

    const outputFolderNames: ReadonlyArray<string> | undefined = operation.settings?.outputFolderNames;
    if (!outputFolderNames?.length) {
      return 'it declares no output folders';
    }
    let baseOutputs: IOutputState;
    try {
      baseOutputs = await base.outputsPromise;
    } catch (error) {
      return `its output folders could not be read after its last run: ${error}`;
    }
    if (baseOutputs.cleanOnlyReason && !outputsMayBeBundles) {
      cleanOnlyReasonByOperation.set(operation, baseOutputs.cleanOnlyReason);
      return baseOutputs.cleanOnlyReason;
    }
    const outputs: IOperationOutputManifest = await readOperationOutputManifestAsync(
      operation.associatedProject.projectFolder,
      outputFolderNames
    );
    if (outputs.signature !== baseOutputs.signature) {
      return 'its output folders changed since its last successful run';
    }
    // eslint-disable-next-line require-atomic-updates -- The runner of the execution record calls the guard sequentially.
    recordState.preRunOutputs = outputs;
    return undefined;
  }

  async function verifyIncrementalResultAsync(
    record: IOperationExecutionResult,
    recordState: IRecordState,
    { outputsMayBeBundles = false }: IIncrementalExecutionGuardOptions = {}
  ): Promise<string | undefined> {
    const { operation } = record;
    const { preRunOutputs } = recordState;
    const outputFolderNames: ReadonlyArray<string> | undefined = operation.settings?.outputFolderNames;
    if (!preRunOutputs || !outputFolderNames) {
      return 'the outputs of the incremental command could not be compared with the outputs before it';
    }
    const outputs: IOperationOutputManifest = await readOperationOutputManifestAsync(
      operation.associatedProject.projectFolder,
      outputFolderNames
    );
    if (outputs.cleanOnlyReason && !outputsMayBeBundles) {
      cleanOnlyReasonByOperation.set(operation, outputs.cleanOnlyReason);
      return outputs.cleanOnlyReason;
    }
    const changes: string | undefined = describeOutputFileChanges(preRunOutputs.files, outputs.files);
    if (changes) {
      // Its outputs may be named after their content, so a later incremental run could leave stale files behind. A
      // runner that keeps its build in memory can run again, unless a content-hashed output was renamed: a bundler
      // renames it whenever its content changes, so the initial command would run after every incremental run.
      if (!outputsMayBeBundles || hasContentHashedOutputChange(preRunOutputs.files, outputs.files)) {
        cleanOnlyReasonByOperation.set(
          operation,
          `its incremental command changed which output files it has in an earlier run: ${changes}`
        );
      }
      return `the incremental command changed which output files it has: ${changes}`;
    }
    // eslint-disable-next-line require-atomic-updates -- The runner of the execution record calls the guard sequentially.
    recordState.verifiedOutputs = { signature: outputs.signature, cleanOnlyReason: undefined };
    return undefined;
  }

  graph.hooks.afterExecuteOperationAsync.tap(
    { name: PLUGIN_NAME, stage: READ_INPUT_FOLDERS_STAGE },
    (record: IOperationRunnerContext & IOperationExecutionResult): void => {
      const recordState: IRecordState | undefined = stateByRecord.get(record);
      // E.g. the first run of the operation in this graph, which no check preceded
      if (recordState && !recordState.inputFolders && getCommandExecution(record)?.watchesInputs) {
        recordState.inputFolders = readInputFolderIdentities(record.operation, recordState.inputsSnapshot);
      }
    }
  );

  graph.hooks.afterExecuteOperationAsync.tapPromise(
    { name: PLUGIN_NAME, stage: RECORD_RESULT_STAGE },
    async (record: IOperationRunnerContext & IOperationExecutionResult): Promise<void> => {
      const { operation, status } = record;
      const recordState: IRecordState | undefined = stateByRecord.get(record);
      stateByRecord.delete(record);

      const execution: ICommandExecution | undefined = getCommandExecution(record);
      if (!execution) {
        switch (status) {
          case OperationStatus.Skipped:
          case OperationStatus.NoOp:
          case OperationStatus.Blocked:
          case OperationStatus.Aborted:
            // No command ran, so the outputs are those of the last run.
            return;
          default:
            // E.g. restored from the build cache, or executed by a runner that does not report its command.
            baseByOperation.delete(operation);
            return;
        }
      }

      const outputFolderNames: ReadonlyArray<string> | undefined = operation.settings?.outputFolderNames;
      if (
        !recordState ||
        !execution.hasIncrementalCommand ||
        !outputFolderNames?.length ||
        cleanOnlyReasonByOperation.has(operation) ||
        (status !== OperationStatus.Success && status !== OperationStatus.SuccessWithWarning) ||
        isResultUnverifiable(record)
      ) {
        baseByOperation.delete(operation);
        return;
      }

      const { verifiedOutputs } = recordState;
      const outputsPromise: Promise<IOutputState> = verifiedOutputs
        ? Promise.resolve(verifiedOutputs)
        : readOperationOutputManifestAsync(operation.associatedProject.projectFolder, outputFolderNames).then(
            ({ signature, cleanOnlyReason }: IOperationOutputManifest) => ({ signature, cleanOnlyReason })
          );
      baseByOperation.set(operation, {
        inputs: captureIncrementalInputState(
          record,
          recordState.inputsSnapshot,
          getEnvironment(record, recordState),
          recordState.records
        ),
        inputFolders: execution.watchesInputs ? recordState.inputFolders : undefined,
        outputsPromise
      });
      // Finish reading the outputs before anything else can change them, e.g. an operation that depends on this one.
      // A failure is reported by the next check of this operation.
      await outputsPromise.catch(() => undefined);
    }
  );

  graph.hooks.onInvalidateOperations.tap(
    PLUGIN_NAME,
    (operations: Iterable<Operation>, reason: string | undefined): void => {
      if (reason === INPUTS_CHANGED_INVALIDATION_REASON) {
        return;
      }
      if (reason === NATIVE_COMMAND_INVALIDATION_REASON) {
        baseByOperation.clear();
        return;
      }
      for (const operation of operations) {
        baseByOperation.delete(operation);
      }
    }
  );

  graph.hooks.beforeDeleteResults.tap(PLUGIN_NAME, (operations: ReadonlySet<Operation>): void => {
    for (const operation of operations) {
      baseByOperation.delete(operation);
    }
  });
}

function getEnvironment(
  record: IOperationExecutionResult,
  { getOperationEnvironment }: IRecordState
): Readonly<Record<string, string | undefined>> {
  return getOperationEnvironment?.(record.operation) ?? process.env;
}

function getProjectPrefix(inputsSnapshot: IInputsSnapshot, project: RushConfigurationProject): string {
  const relativePath: string = Path.convertToSlashes(
    path.relative(inputsSnapshot.rootDirectory, project.projectFolder)
  );
  return relativePath === '' ? '' : `${relativePath}/`;
}

function isConfigInput(filePath: string, projectPrefix: string): boolean {
  if (!filePath.startsWith(projectPrefix) || path.isAbsolute(filePath)) {
    return true;
  }
  const projectRelativePath: string = filePath.slice(projectPrefix.length);
  if (!projectRelativePath.includes('/') || CONFIG_INPUT_FOLDER_REGEXP.test(projectRelativePath)) {
    return true;
  }
  return CONFIG_INPUT_FILE_NAME_REGEXP.test(
    projectRelativePath.slice(projectRelativePath.lastIndexOf('/') + 1)
  );
}

function describeInputFileChanges(
  lastState: IIncrementalInputState,
  currentState: IIncrementalInputState,
  isChanged: (lastHash: string | undefined, currentHash: string | undefined, filePath: string) => boolean
): string {
  const lastFiles: ReadonlyMap<string, string> | undefined = lastState.inputFiles.deref();
  const currentFiles: ReadonlyMap<string, string> | undefined = currentState.inputFiles.deref();
  if (!lastFiles || !currentFiles) {
    return '';
  }
  const changedFiles: string[] = [];
  for (const filePath of new Set([...lastFiles.keys(), ...currentFiles.keys()])) {
    if (isChanged(lastFiles.get(filePath), currentFiles.get(filePath), filePath)) {
      changedFiles.push(filePath);
    }
  }
  if (changedFiles.length === 0) {
    return '';
  }
  return formatExamplePaths(changedFiles);
}

function formatExamplePaths(paths: string[]): string {
  paths.sort();
  const examples: string = paths
    .slice(0, MAX_EXAMPLE_PATHS)
    .map((filePath: string) => JSON.stringify(filePath))
    .join(', ');
  return ` (${examples}${paths.length > MAX_EXAMPLE_PATHS ? ', ...' : ''})`;
}

/**
 * Returns the identity of each folder of the operation's project that holds one of its input files, by the path of
 * the folder relative to the root of the inputs snapshot.
 */
function readInputFolderIdentities(
  operation: Operation,
  inputsSnapshot: IInputsSnapshot
): ReadonlyMap<string, string> {
  const { associatedProject: project, associatedPhase: phase } = operation;
  const projectPrefix: string = getProjectPrefix(inputsSnapshot, project);
  const folderPaths: Set<string> = new Set();
  for (const filePath of inputsSnapshot.getTrackedFileHashesForOperation(project, phase.name).keys()) {
    if (filePath.startsWith(projectPrefix) && !path.isAbsolute(filePath)) {
      folderPaths.add(filePath.slice(0, Math.max(filePath.lastIndexOf('/'), 0)));
    }
  }
  const identities: Map<string, string> = new Map();
  for (const folderPath of folderPaths) {
    identities.set(folderPath, getFolderIdentity(path.resolve(inputsSnapshot.rootDirectory, folderPath)));
  }
  return identities;
}

/**
 * Returns the folders of `lastIdentities` whose identity changed, including folders that no longer hold input files.
 * A changed folder inside another changed folder is left out, e.g. a recreated "src" is named without its subfolders.
 */
function getChangedFolders(
  lastIdentities: ReadonlyMap<string, string>,
  currentIdentities: ReadonlyMap<string, string>
): string[] {
  const changedFolders: Set<string> = new Set();
  for (const [folderPath, identity] of lastIdentities) {
    if (currentIdentities.get(folderPath) !== identity) {
      changedFolders.add(folderPath);
    }
  }
  const topFolders: string[] = [];
  for (const folderPath of changedFolders) {
    if (!hasAncestorFolder(folderPath, changedFolders)) {
      topFolders.push(folderPath);
    }
  }
  return topFolders;
}

// Folder paths are relative, with "/" separators, and "" is the root of the inputs snapshot.
function hasAncestorFolder(folderPath: string, folderPaths: ReadonlySet<string>): boolean {
  let parentPath: string = folderPath;
  while (parentPath) {
    parentPath = parentPath.slice(0, Math.max(parentPath.lastIndexOf('/'), 0));
    if (folderPaths.has(parentPath)) {
      return true;
    }
  }
  return false;
}

// A folder that was deleted and recreated has another inode, or at least another birth time. Unlike its modification
// and status change times, neither changes when an entry of the folder is added, removed or replaced, e.g. by an
// editor that saves a file by renaming a new file over it.
function getFolderIdentity(folderPath: string): string {
  try {
    const stats: fs.Stats | undefined = fs.lstatSync(folderPath, { throwIfNoEntry: false });
    return stats ? `${stats.dev}:${stats.ino}:${stats.birthtimeMs}` : 'missing';
  } catch (error) {
    // E.g. ENOTDIR, if a folder on its path was replaced by a file
    return `${(error as NodeJS.ErrnoException).code}`;
  }
}

/**
 * Returns the dependencies of an operation by name, including the dependencies that it has through operations of its
 * own project, e.g. through a phase without a script that only orders its build after the builds of other projects.
 */
function getGuardedDependencies(operation: Operation): ReadonlyMap<string, Operation> {
  const { associatedProject: project } = operation;
  const dependencyByName: Map<string, Operation> = new Map();
  const dependents: Operation[] = [operation];
  for (let i: number = 0; i < dependents.length; i++) {
    for (const dependency of dependents[i].dependencies) {
      if (dependencyByName.has(dependency.name)) {
        continue;
      }
      dependencyByName.set(dependency.name, dependency);
      if (dependency.associatedProject === project) {
        dependents.push(dependency);
      }
    }
  }
  return dependencyByName;
}

function getToolingDependencyReason(operation: Operation, dependency: Operation): string | undefined {
  const { associatedProject: project } = operation;
  const { associatedProject: dependencyProject } = dependency;
  if (dependencyProject === project) {
    // Another phase of the same project, e.g. the build that a test operation runs against.
    return undefined;
  }
  const { packageName } = dependencyProject;
  const { dependencies, optionalDependencies, peerDependencies } = project.packageJson;
  if (
    !dependencies?.[packageName] &&
    !optionalDependencies?.[packageName] &&
    !peerDependencies?.[packageName]
  ) {
    return `its dependency "${packageName}" changed, and it is not a production dependency`;
  }
  if (isToolingProject(dependencyProject)) {
    return `its dependency "${packageName}" changed, and it is a build tool`;
  }
  return undefined;
}

const isToolingProjectByProject: WeakMap<RushConfigurationProject, boolean> = new WeakMap();

function isToolingProject(project: RushConfigurationProject): boolean {
  let isTooling: boolean | undefined = isToolingProjectByProject.get(project);
  if (isTooling === undefined) {
    const { packageName, projectFolder } = project;
    isTooling =
      TOOLING_PACKAGE_NAME_REGEXP.test(packageName) ||
      // A rig package
      FileSystem.exists(`${projectFolder}/profiles`) ||
      FileSystem.exists(`${projectFolder}/heft-plugin.json`);
    isToolingProjectByProject.set(project, isTooling);
  }
  return isTooling;
}
