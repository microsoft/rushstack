// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { createHash, type Hash } from 'node:crypto';

import ignore, { type Ignore } from 'ignore';

import { type IReadonlyLookupByPath, LookupByPath } from '@rushstack/lookup-by-path';
import { InternalError, Path, Sort } from '@rushstack/node-core-library';

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type {
  IOperationSettings,
  NodeVersionGranularity,
  RushProjectConfiguration
} from '../../api/RushProjectConfiguration';
import { RushConstants } from '../RushConstants';

/**
 * @beta
 */
export type IRushConfigurationProjectForSnapshot = Pick<
  RushConfigurationProject,
  'projectFolder' | 'projectRelativeFolder'
>;

/**
 * @internal
 */
export interface IInputsSnapshotProjectMetadata {
  /**
   * The contents of rush-project.json for the project, if available
   */
  projectConfig?: RushProjectConfiguration;
  /**
   * A map of operation name to additional files that should be included in the hash for that operation.
   */
  additionalFilesByOperationName?: ReadonlyMap<string, ReadonlySet<string>>;
}

interface IInternalInputsSnapshotProjectMetadata extends IInputsSnapshotProjectMetadata {
  /**
   * Cached filter of files that are not ignored by the project's `incrementalBuildIgnoredGlobs`.
   * @param filePath - The path to the file to check
   * @returns true if the file path is an input to all operations in the project, false otherwise
   */
  projectFilePathFilter?: (filePath: string) => boolean;
  /**
   * The cached Git hashes for all files in the project folder.
   */
  hashes: Map<string, string>;
  /**
   * Cached hashes for all files in the project folder, including additional files.
   * Upon calculating this map, input-output file collisions are detected.
   */
  fileHashesByOperationName: Map<string | undefined, Map<string, string>>;
  /**
   * The flattened state hash for each operation name, where the key "undefined" represents no particular operation.
   */
  hashByOperationName: Map<string | undefined, string>;
  /**
   * The project relative folder, which is a prefix in all relative paths.
   */
  relativePrefix: string;
}

export type IRushSnapshotProjectMetadataMap = ReadonlyMap<
  IRushConfigurationProjectForSnapshot,
  IInputsSnapshotProjectMetadata
>;

/**
 * Function that computes a new snapshot of the current state of the repository as of the current moment.
 * Rush-level configuration state will have been bound during creation of the function.
 * Captures the state of the environment, tracked files, and additional files.
 *
 * @beta
 */
export type GetInputsSnapshotAsyncFn = () => Promise<IInputsSnapshot | undefined>;

/**
 * The parameters for constructing an {@link InputsSnapshot}.
 * @internal
 */
export interface IInputsSnapshotParameters {
  /**
   * Hashes for files selected by `dependsOnAdditionalFiles`.
   * Separated out to prevent being auto-assigned to a project.
   */
  additionalHashes?: ReadonlyMap<string, string>;
  /**
   * The environment to use for `dependsOnEnvVars`. By default performs a snapshot of process.env upon construction.
   * @defaultValue \{ ...process.env \}
   */
  environment?: Record<string, string | undefined>;
  /**
   * The Node.js version string to use for `dependsOnNodeVersion`. Defaults to `process.version`.
   * @defaultValue process.version
   */
  nodeVersion?: string;
  /**
   * File paths (keys into additionalHashes or hashes) to be included as part of every operation's dependencies.
   */
  globalAdditionalFiles?: Iterable<string>;
  /**
   * The hashes of all tracked files in the repository.
   */
  hashes: ReadonlyMap<string, string>;
  /**
   * Whether or not the repository has uncommitted changes.
   */
  hasUncommittedChanges: boolean;
  /**
   * Optimized lookup engine used to route `hashes` to individual projects.
   */
  lookupByPath: IReadonlyLookupByPath<IRushConfigurationProjectForSnapshot>;
  /**
   * An earlier snapshot of the same repository. The new snapshot reuses the state of each project whose inputs
   * have the same hashes in both, including the hashes that the earlier snapshot has computed for it. This makes
   * a snapshot in which few files changed faster to create and to query, and doesn't change any result.
   *
   * @remarks
   * The state is reused only if `lookupByPath` and `projectMap` are the same objects, and the root directory,
   * the Node.js version, the environment, the hashes of the global additional files and the number of additional
   * files of the operations are the same. Otherwise the snapshot is created from scratch. The additional files of
   * an operation may be added to, but not removed or replaced.
   */
  previousSnapshot?: InputsSnapshot;
  /**
   * Metadata for each project.
   */
  projectMap: IRushSnapshotProjectMetadataMap;
  /**
   * The directory that all relative paths are relative to.
   */
  rootDir: string;
  /**
   * {@inheritdoc IInputsSnapshot.workingTreeReadStartTimeMs}
   */
  workingTreeReadStartTimeMs?: number;
}

const { hashDelimiter } = RushConstants;

const EMPTY_MAP: ReadonlyMap<string, string> = new Map();

/**
 * Represents a synchronously-queryable in-memory snapshot of the state of the inputs to a Rush repository.
 *
 * The methods on this interface are idempotent and will return the same result regardless of when they are executed.
 * @beta
 */
export interface IInputsSnapshot {
  /**
   * The raw hashes of all tracked files in the repository.
   */
  readonly hashes: ReadonlyMap<string, string>;

  /**
   * The directory that all paths in `hashes` are relative to.
   */
  readonly rootDirectory: string;

  /**
   * Whether or not the repository has uncommitted changes.
   */
  readonly hasUncommittedChanges: boolean;

  /**
   * The time, in milliseconds since the epoch, at which this snapshot began reading the state of the working tree,
   * if known.
   *
   * @remarks
   * A tracked file that was modified at or after this time may be newer than its hash in `hashes`, because Git
   * may have read the file before it was saved.
   */
  readonly workingTreeReadStartTimeMs?: number;

  /**
   * Gets the map of file paths to Git hashes that will be used to compute the local state hash of the operation.
   * Exposed separately from the final state hash to facilitate detailed change detection.
   *
   * @param project - The Rush project to get hashes for
   * @param operationName - The name of the operation (phase) to get hashes for. If omitted, returns a default set for the project, as used for bulk commands.
   * @returns A map of file name to Git hash. For local files paths will be relative. Configured additional files may be absolute paths.
   */
  getTrackedFileHashesForOperation(
    project: IRushConfigurationProjectForSnapshot,
    operationName?: string
  ): ReadonlyMap<string, string>;

  /**
   * Gets the state hash for the files owned by this operation, including the resolutions of package.json dependencies. This will later be combined with the hash of
   * the command being executed and the final hashes of the operation's dependencies to compute the final hash for the operation.
   * @param project - The Rush project to compute the state hash for
   * @param operationName - The name of the operation (phase) to get hashes for. If omitted, returns a generic hash for the whole project, as used for bulk commands.
   * @param environment - The environment that the operation runs with, if it differs from the environment of the
   * snapshot. The operation's `dependsOnEnvVars` are hashed from it.
   * @returns The local state hash for the project. This is a hash of the environment, the project's tracked files, and any additional files.
   */
  getOperationOwnStateHash(
    project: IRushConfigurationProjectForSnapshot,
    operationName?: string,
    environment?: Readonly<Record<string, string | undefined>>
  ): string;
}

/**
 * Represents a synchronously-queryable in-memory snapshot of the state of the inputs to a Rush repository.
 * Any asynchronous work needs to be performed by the caller and the results passed to the constructor.
 *
 * @remarks
 * All operations on this class will return the same result regardless of when they are executed.
 *
 * @internal
 */
export class InputsSnapshot implements IInputsSnapshot {
  /**
   * {@inheritdoc IInputsSnapshot.hashes}
   */
  public readonly hashes: ReadonlyMap<string, string>;
  /**
   * {@inheritdoc IInputsSnapshot.hasUncommittedChanges}
   */
  public readonly hasUncommittedChanges: boolean;
  /**
   * {@inheritdoc IInputsSnapshot.rootDirectory}
   */
  public readonly rootDirectory: string;
  /**
   * {@inheritdoc IInputsSnapshot.workingTreeReadStartTimeMs}
   */
  public readonly workingTreeReadStartTimeMs: number | undefined;

  /**
   * The metadata for each project. This is a superset of the information in `projectMap` and includes caching of queries.
   */
  readonly #projectMetadataMap: Map<
    IRushConfigurationProjectForSnapshot,
    IInternalInputsSnapshotProjectMetadata
  >;
  /**
   * Hashes of files to be included in all result sets.
   */
  readonly #globalAdditionalHashes: ReadonlyMap<string, string> | undefined;
  /**
   * Hashes for files selected by `dependsOnAdditionalFiles`.
   */
  readonly #additionalHashes: ReadonlyMap<string, string> | undefined;
  /**
   * The environment to use for `dependsOnEnvVars`.
   */
  readonly #environment: Record<string, string | undefined>;
  /**
   * Pre-computed Node.js version strings at each granularity level for `dependsOnNodeVersion`.
   */
  readonly #nodeVersionByGranularity: Readonly<Record<NodeVersionGranularity, string>>;
  /**
   * The inputs that a later snapshot must share to reuse the state of the projects in this one.
   */
  readonly #lookupByPath: IReadonlyLookupByPath<IRushConfigurationProjectForSnapshot>;
  readonly #projectMap: IRushSnapshotProjectMetadataMap;
  readonly #nodeVersion: string;
  readonly #operationAdditionalFileCount: number;

  /**
   *
   * @param params - The parameters for the snapshot
   * @internal
   */
  public constructor(params: IInputsSnapshotParameters) {
    const {
      additionalHashes,
      environment = { ...process.env },
      globalAdditionalFiles,
      hashes,
      hasUncommittedChanges,
      lookupByPath,
      nodeVersion = process.version,
      previousSnapshot,
      projectMap,
      rootDir,
      workingTreeReadStartTimeMs
    } = params;

    let globalAdditionalHashes: Map<string, string> | undefined;
    if (globalAdditionalFiles) {
      globalAdditionalHashes = new Map();
      const sortedAdditionalFiles: string[] = Array.from(globalAdditionalFiles).sort();
      for (const file of sortedAdditionalFiles) {
        const hash: string | undefined = hashes.get(file);
        if (!hash) {
          throw new Error(`Hash not found for global file: "${file}"`);
        }
        const owningProject: IRushConfigurationProjectForSnapshot | undefined =
          lookupByPath.findChildPath(file);
        if (owningProject) {
          throw new InternalError(
            `Requested global additional file "${file}" is owned by project in "${owningProject.projectRelativeFolder}". Declare a project dependency instead.`
          );
        }
        globalAdditionalHashes.set(file, hash);
      }
    }

    const operationAdditionalFileCount: number = countOperationAdditionalFiles(projectMap);

    this.#projectMetadataMap =
      (previousSnapshot &&
        previousSnapshot.#tryDeriveProjectMetadataMap(
          params,
          environment,
          nodeVersion,
          globalAdditionalHashes,
          operationAdditionalFileCount
        )) ??
      createProjectMetadataMap(hashes, lookupByPath, projectMap, rootDir);
    this.#additionalHashes = additionalHashes;
    this.#globalAdditionalHashes = globalAdditionalHashes;
    // Snapshot the environment so that queries are not impacted by when they happen
    this.#environment = environment;
    // Parse Node.js version once so it doesn't need to be re-parsed per operation
    this.#nodeVersionByGranularity = _parseNodeVersion(nodeVersion);
    this.#lookupByPath = lookupByPath;
    this.#projectMap = projectMap;
    this.#nodeVersion = nodeVersion;
    this.#operationAdditionalFileCount = operationAdditionalFileCount;
    this.hashes = hashes;
    this.hasUncommittedChanges = hasUncommittedChanges;
    this.rootDirectory = rootDir;
    this.workingTreeReadStartTimeMs = workingTreeReadStartTimeMs;
  }

  /**
   * {@inheritdoc}
   */
  public getTrackedFileHashesForOperation(
    project: IRushConfigurationProjectForSnapshot,
    operationName?: string
  ): ReadonlyMap<string, string> {
    const record: IInternalInputsSnapshotProjectMetadata | undefined = this.#projectMetadataMap.get(project);
    if (!record) {
      throw new InternalError(`No information available for project at ${project.projectFolder}`);
    }

    const { fileHashesByOperationName } = record;
    let hashes: Map<string, string> | undefined = fileHashesByOperationName.get(operationName);
    if (!hashes) {
      hashes = new Map();
      // TODO: Support incrementalBuildIgnoredGlobs per-operation
      const filter: (filePath: string) => boolean = getOrCreateProjectFilter(record);

      let outputValidator: LookupByPath<string> | undefined;

      if (operationName) {
        const operationSettings: Readonly<IOperationSettings> | undefined =
          record.projectConfig?.operationSettingsByOperationName.get(operationName);

        const outputFolderNames: string[] | undefined = operationSettings?.outputFolderNames;
        if (outputFolderNames) {
          const { relativePrefix } = record;
          outputValidator = new LookupByPath();
          for (const folderName of outputFolderNames) {
            outputValidator.setItem(`${relativePrefix}/${folderName}`, folderName);
          }
        }

        // Hash any additional files (files outside of a project, untracked project files, or even files outside of the repository)
        const additionalFilesForOperation: ReadonlySet<string> | undefined =
          record.additionalFilesByOperationName?.get(operationName);
        if (additionalFilesForOperation) {
          // Sort the additional files to ensure deterministic hash computation
          const sortedAdditionalFiles: string[] = Array.from(additionalFilesForOperation).sort();
          for (const [filePath, hash] of this.#resolveHashes(sortedAdditionalFiles)) {
            hashes.set(filePath, hash);
          }
        }
      }

      const globalAdditionalHashes: ReadonlyMap<string, string> | undefined = this.#globalAdditionalHashes;
      if (globalAdditionalHashes) {
        for (const [file, hash] of globalAdditionalHashes) {
          record.hashes.set(file, hash);
        }
      }

      // Hash the base project files
      for (const [filePath, hash] of record.hashes) {
        if (filter(filePath)) {
          hashes.set(filePath, hash);
        }

        // Ensure that the configured output folders for this operation do not contain any input files
        // This should be reworked to operate on a global file origin map to ensure a hashed input
        // is not a declared output of *any* operation.
        const outputMatch: string | undefined = outputValidator?.findChildPath(filePath);
        if (outputMatch) {
          throw new Error(
            `Configured output folder "${outputMatch}" for operation "${operationName}" in project "${project.projectRelativeFolder}" contains tracked input file "${filePath}".` +
              ` If it is intended that this operation modifies its own input files, modify the build process to emit a warning if the output version differs from the input, and remove the directory from "outputFolderNames".` +
              ` This will ensure cache correctness. Otherwise, change the build process to output to a disjoint folder.`
          );
        }
      }

      // Only a complete result is kept, so that a query that fails fails again
      fileHashesByOperationName.set(operationName, hashes);
    }

    return hashes;
  }

  /**
   * {@inheritdoc}
   */
  public getOperationOwnStateHash(
    project: IRushConfigurationProjectForSnapshot,
    operationName?: string,
    environment?: Readonly<Record<string, string | undefined>>
  ): string {
    const record: IInternalInputsSnapshotProjectMetadata | undefined = this.#projectMetadataMap.get(project);
    if (!record) {
      throw new Error(`No information available for project at ${project.projectFolder}`);
    }

    const operationSettings: Readonly<IOperationSettings> | undefined = operationName
      ? record.projectConfig?.operationSettingsByOperationName.get(operationName)
      : undefined;
    const snapshotEnvironment: Readonly<Record<string, string | undefined>> = this.#environment;
    if (
      environment &&
      operationSettings?.dependsOnEnvVars?.some(
        (envVar: string) => (environment[envVar] || '') !== (snapshotEnvironment[envVar] || '')
      )
    ) {
      // The operation's environment differs from the snapshot's in a variable that it hashes, so don't memoize.
      return this.#computeOperationOwnStateHash(project, operationName, operationSettings, environment);
    }

    const { hashByOperationName } = record;
    let hash: string | undefined = hashByOperationName.get(operationName);
    if (!hash) {
      hash = this.#computeOperationOwnStateHash(
        project,
        operationName,
        operationSettings,
        snapshotEnvironment
      );
      hashByOperationName.set(operationName, hash);
    }

    return hash;
  }

  #computeOperationOwnStateHash(
    project: IRushConfigurationProjectForSnapshot,
    operationName: string | undefined,
    operationSettings: Readonly<IOperationSettings> | undefined,
    environment: Readonly<Record<string, string | undefined>>
  ): string {
    const hashes: ReadonlyMap<string, string> = this.getTrackedFileHashesForOperation(project, operationName);

    const hasher: Hash = createHash('sha1');
    // If this is for a specific operation, apply operation-specific options
    if (operationSettings) {
      const { dependsOnEnvVars, dependsOnNodeVersion, outputFolderNames } = operationSettings;
      if (dependsOnEnvVars) {
        // As long as we enumerate environment variables in a consistent order, we will get a stable hash.
        // Changing the order in rush-project.json will change the hash anyway since the file contents are part of the hash.
        for (const envVar of dependsOnEnvVars) {
          hasher.update(`${hashDelimiter}$${envVar}=${environment[envVar] || ''}`);
        }
      }

      if (dependsOnNodeVersion) {
        const granularity: NodeVersionGranularity =
          dependsOnNodeVersion === true ? 'patch' : dependsOnNodeVersion;
        hasher.update(`${hashDelimiter}nodeVersion=${this.#nodeVersionByGranularity[granularity]}`);
      }

      if (outputFolderNames) {
        hasher.update(`${hashDelimiter}${JSON.stringify(outputFolderNames)}`);
      }
    }

    // Hash the base project files
    for (const [filePath, fileHash] of hashes) {
      hasher.update(`${hashDelimiter}${filePath}${hashDelimiter}${fileHash}`);
    }

    return hasher.digest('hex');
  }

  *#resolveHashes(filePaths: Iterable<string>): Generator<[string, string]> {
    const { hashes } = this;
    const additionalHashes: ReadonlyMap<string, string> | undefined = this.#additionalHashes;

    for (const filePath of filePaths) {
      const hash: string | undefined = hashes.get(filePath) ?? additionalHashes?.get(filePath);
      if (!hash) {
        throw new Error(`Could not find hash for file path "${filePath}"`);
      }
      yield [filePath, hash];
    }
  }

  /**
   * Returns the state of each project for a later snapshot with the given parameters. It is the state of each
   * project in this snapshot whose inputs have the same hashes, and new state for each other project. Returns
   * undefined if the later snapshot differs from this one in more than the hashes of files.
   */
  #tryDeriveProjectMetadataMap(
    params: IInputsSnapshotParameters,
    environment: Readonly<Record<string, string | undefined>>,
    nodeVersion: string,
    globalAdditionalHashes: ReadonlyMap<string, string> | undefined,
    operationAdditionalFileCount: number
  ): Map<IRushConfigurationProjectForSnapshot, IInternalInputsSnapshotProjectMetadata> | undefined {
    const { additionalHashes, hashes, lookupByPath, projectMap, rootDir } = params;
    if (
      lookupByPath !== this.#lookupByPath ||
      projectMap !== this.#projectMap ||
      rootDir !== this.rootDirectory ||
      nodeVersion !== this.#nodeVersion ||
      operationAdditionalFileCount !== this.#operationAdditionalFileCount ||
      !areMapsEqual(globalAdditionalHashes ?? EMPTY_MAP, this.#globalAdditionalHashes ?? EMPTY_MAP) ||
      !areEnvironmentsEqual(environment, this.#environment)
    ) {
      return undefined;
    }

    const changedFiles: Set<string> = new Set();
    addChangedFiles(this.hashes, hashes, changedFiles);
    addChangedFiles(this.#additionalHashes ?? EMPTY_MAP, additionalHashes ?? EMPTY_MAP, changedFiles);

    const previousMetadataMap: ReadonlyMap<
      IRushConfigurationProjectForSnapshot,
      IInternalInputsSnapshotProjectMetadata
    > = this.#projectMetadataMap;
    const projectMetadataMap: Map<
      IRushConfigurationProjectForSnapshot,
      IInternalInputsSnapshotProjectMetadata
    > = new Map(previousMetadataMap);
    if (changedFiles.size === 0) {
      return projectMetadataMap;
    }

    const changedFilesByProject: Map<IRushConfigurationProjectForSnapshot, string[]> = new Map();
    for (const file of changedFiles) {
      const project: IRushConfigurationProjectForSnapshot | undefined = lookupByPath.findChildPath(file);
      if (project) {
        let projectFiles: string[] | undefined = changedFilesByProject.get(project);
        if (!projectFiles) {
          changedFilesByProject.set(project, (projectFiles = []));
        }
        projectFiles.push(file);
      }
    }

    // The operations of a project also depend on their additional files, which may be outside of the project
    for (const [project, { additionalFilesByOperationName }] of previousMetadataMap) {
      if (
        additionalFilesByOperationName &&
        !changedFilesByProject.has(project) &&
        dependsOnAnyFile(additionalFilesByOperationName, changedFiles)
      ) {
        changedFilesByProject.set(project, []);
      }
    }

    for (const [project, projectFiles] of changedFilesByProject) {
      const previousRecord: IInternalInputsSnapshotProjectMetadata | undefined =
        previousMetadataMap.get(project);
      const record: IInternalInputsSnapshotProjectMetadata = createInternalRecord(
        project,
        projectMap.get(project),
        rootDir
      );
      if (previousRecord) {
        // The filter depends only on the configuration of the project
        record.projectFilePathFilter = previousRecord.projectFilePathFilter;
        for (const [file, hash] of previousRecord.hashes) {
          // A query adds the global additional files to the hashes of the project
          if (!globalAdditionalHashes?.has(file)) {
            record.hashes.set(file, hash);
          }
        }
      }

      let addedFile: boolean = false;
      for (const file of projectFiles) {
        const hash: string | undefined = hashes.get(file);
        if (hash === undefined) {
          record.hashes.delete(file);
        } else {
          addedFile ||= !record.hashes.has(file);
          record.hashes.set(file, hash);
        }
      }

      if (addedFile) {
        // Ensure stable ordering.
        Sort.sortMapKeys(record.hashes);
      }

      if (record.hashes.size === 0 && !projectMap.has(project)) {
        // A project that has no metadata has state only while it has files
        projectMetadataMap.delete(project);
      } else {
        projectMetadataMap.set(project, record);
      }
    }

    return projectMetadataMap;
  }
}

function createProjectMetadataMap(
  hashes: ReadonlyMap<string, string>,
  lookupByPath: IReadonlyLookupByPath<IRushConfigurationProjectForSnapshot>,
  projectMap: IRushSnapshotProjectMetadataMap,
  rootDir: string
): Map<IRushConfigurationProjectForSnapshot, IInternalInputsSnapshotProjectMetadata> {
  const projectMetadataMap: Map<
    IRushConfigurationProjectForSnapshot,
    IInternalInputsSnapshotProjectMetadata
  > = new Map();
  for (const [project, record] of projectMap) {
    projectMetadataMap.set(project, createInternalRecord(project, record, rootDir));
  }

  // Route hashes to individual projects
  for (const [file, hash] of hashes) {
    const project: IRushConfigurationProjectForSnapshot | undefined = lookupByPath.findChildPath(file);
    if (!project) {
      continue;
    }

    let record: IInternalInputsSnapshotProjectMetadata | undefined = projectMetadataMap.get(project);
    if (!record) {
      projectMetadataMap.set(project, (record = createInternalRecord(project, undefined, rootDir)));
    }

    record.hashes.set(file, hash);
  }

  for (const record of projectMetadataMap.values()) {
    // Ensure stable ordering.
    Sort.sortMapKeys(record.hashes);
  }

  return projectMetadataMap;
}

/**
 * Adds each file that has a hash in only one of the maps, or different hashes in them, to `changedFiles`.
 */
function addChangedFiles(
  previousHashes: ReadonlyMap<string, string>,
  hashes: ReadonlyMap<string, string>,
  changedFiles: Set<string>
): void {
  if (previousHashes === hashes) {
    return;
  }

  // Both maps usually list almost all files in sorted order. Merge them in that order, which reads each map in
  // sequence, and look up only the files that are out of order.
  const previousEntries: Iterator<[string, string]> = previousHashes.entries();
  let previous: IteratorResult<[string, string]> = previousEntries.next();
  for (const [file, hash] of hashes) {
    let previousHash: string | undefined;
    while (!previous.done) {
      const [previousFile, previousFileHash] = previous.value;
      if (previousFile === file) {
        previousHash = previousFileHash;
        previous = previousEntries.next();
        break;
      }

      if (previousFile > file) {
        break;
      }

      if (!hashes.has(previousFile)) {
        changedFiles.add(previousFile);
      }
      previous = previousEntries.next();
    }

    if (previousHash === undefined) {
      previousHash = previousHashes.get(file);
    }

    if (previousHash !== hash) {
      changedFiles.add(file);
    }
  }

  for (; !previous.done; previous = previousEntries.next()) {
    const previousFile: string = previous.value[0];
    if (!hashes.has(previousFile)) {
      changedFiles.add(previousFile);
    }
  }
}

function dependsOnAnyFile(
  additionalFilesByOperationName: ReadonlyMap<string, ReadonlySet<string>>,
  files: ReadonlySet<string>
): boolean {
  for (const additionalFiles of additionalFilesByOperationName.values()) {
    const [smaller, larger] =
      additionalFiles.size < files.size ? [additionalFiles, files] : [files, additionalFiles];
    for (const file of smaller) {
      if (larger.has(file)) {
        return true;
      }
    }
  }

  return false;
}

function countOperationAdditionalFiles(projectMap: IRushSnapshotProjectMetadataMap): number {
  let count: number = 0;
  for (const { additionalFilesByOperationName } of projectMap.values()) {
    for (const additionalFiles of additionalFilesByOperationName?.values() ?? []) {
      count += additionalFiles.size;
    }
  }

  return count;
}

function areMapsEqual(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  if (a.size !== b.size) {
    return false;
  }

  for (const [key, value] of a) {
    if (b.get(key) !== value) {
      return false;
    }
  }

  return true;
}

function areEnvironmentsEqual(
  a: Readonly<Record<string, string | undefined>>,
  b: Readonly<Record<string, string | undefined>>
): boolean {
  const keys: string[] = Object.keys(a);
  if (keys.length !== Object.keys(b).length) {
    return false;
  }

  for (const key of keys) {
    if (a[key] !== b[key] || !Object.prototype.hasOwnProperty.call(b, key)) {
      return false;
    }
  }

  return true;
}

/**
 * Parses a Node.js version string once and returns pre-computed strings for each granularity level.
 *
 * @param rawVersion - The full Node.js version string (e.g. `v18.17.1`)
 * @returns An object with pre-computed version strings for `major`, `minor`, and `patch` granularities
 */
function _parseNodeVersion(rawVersion: string): Record<NodeVersionGranularity, string> {
  // Strip leading 'v' if present
  const version: string = rawVersion.startsWith('v') ? rawVersion.slice(1) : rawVersion;
  const [major, minor]: string[] = version.split('.');

  return {
    major,
    minor: `${major}.${minor}`,
    patch: version
  };
}

function getOrCreateProjectFilter(
  record: IInternalInputsSnapshotProjectMetadata
): (filePath: string) => boolean {
  if (!record.projectFilePathFilter) {
    const ignoredGlobs: readonly string[] | undefined = record.projectConfig?.incrementalBuildIgnoredGlobs;
    if (!ignoredGlobs || ignoredGlobs.length === 0) {
      record.projectFilePathFilter = noopFilter;
    } else {
      const ignorer: Ignore = ignore();
      ignorer.add(ignoredGlobs as string[]);
      const prefixLength: number = record.relativePrefix.length + 1;
      record.projectFilePathFilter = function projectFilePathFilter(filePath: string): boolean {
        return !ignorer.ignores(filePath.slice(prefixLength));
      };
    }
  }

  return record.projectFilePathFilter;
}

function createInternalRecord(
  project: IRushConfigurationProjectForSnapshot,
  baseRecord: IInputsSnapshotProjectMetadata | undefined,
  rootDir: string
): IInternalInputsSnapshotProjectMetadata {
  return {
    // Data from the caller
    projectConfig: baseRecord?.projectConfig,
    additionalFilesByOperationName: baseRecord?.additionalFilesByOperationName,

    // Caches
    hashes: new Map(),
    hashByOperationName: new Map(),
    fileHashesByOperationName: new Map(),
    relativePrefix: getRelativePrefix(project, rootDir)
  };
}

function getRelativePrefix(project: IRushConfigurationProjectForSnapshot, rootDir: string): string {
  return Path.convertToSlashes(path.relative(rootDir, project.projectFolder));
}

function noopFilter(filePath: string): boolean {
  return true;
}
