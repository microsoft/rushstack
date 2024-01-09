// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { createHash, type Hash } from 'crypto';
import ignore, { type Ignore } from 'ignore';

import { Path, Sort } from '@rushstack/node-core-library';

import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IOperationSettings, RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import { type IReadonlyLookupByPath, LookupByPath } from '../LookupByPath';
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
export interface IRushSnapshotProjectMetadata {
  /**
   * The contents of rush-project.json for the project, if available
   */
  projectConfig?: RushProjectConfiguration;
  /**
   * A map of operation name to additional files that should be included in the hash for that operation.
   */
  additionalFilesByOperationName?: ReadonlyMap<string, ReadonlySet<string>>;
}

interface IInternalRushSnapshotProjectMetadata {
  /**
   * The contents of rush-project.json for the project, if available
   */
  projectConfig?: RushProjectConfiguration;
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
   * The list of additional file paths that are applicable to each operation name, if any.
   */
  additionalFilesByOperationName?: ReadonlyMap<string, ReadonlySet<string>>;
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
  IRushSnapshotProjectMetadata
>;

/**
 * The parameters for constructing an {@link InputSnapshot}.
 * @internal
 */
export interface IRushSnapshotParameters {
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
   * File paths (keys into additionalHashes or hashes) to be included as part of every operation's dependencies.
   */
  globalAdditionalFiles?: Iterable<string>;
  /**
   * The hashes of all tracked files in the repository.
   */
  hashes: ReadonlyMap<string, string>;
  /**
   * Optimized lookup engine used to route `hashes` to individual projects.
   */
  lookupByPath: IReadonlyLookupByPath<IRushConfigurationProjectForSnapshot>;
  /**
   * Metadata for each project.
   */
  projectMap: IRushSnapshotProjectMetadataMap;
  /**
   * The directory that all relative paths are relative to.
   */
  rootDir: string;
}

const { hashDelimiter } = RushConstants;

/**
 * Represents a synchronously-queryable in-memory snapshot of the state of the inputs to a Rush repository.
 *
 * The methods on this interface are idempotent and will return the same result regardless of when they are executed.
 * @beta
 */
export interface IInputSnapshot {
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
   * Gets the local state hash for the operation. This will later be combined with the hash of the command being executed and the final hashes of the operation's dependencies to compute
   * the final hash for the operation.
   * @param project - The Rush project to compute the state hash for
   * @param operationName - The name of the operation (phase) to get hashes for. If omitted, returns a generic hash for the whole project, as used for bulk commands.
   * @returns The local state hash for the project. This is a hash of the environment, the project's tracked files, and any additional files.
   */
  getLocalStateHashForOperation(
    project: IRushConfigurationProjectForSnapshot,
    operationName?: string
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
export class InputSnapshot implements IInputSnapshot {
  /**
   * The metadata for each project. This is a superset of the information in `projectMap` and includes caching of queries.
   */
  private readonly _projectMetadataMap: Map<
    IRushConfigurationProjectForSnapshot,
    IInternalRushSnapshotProjectMetadata
  >;
  /**
   * Hashes of files to be included in all result sets.
   */
  private readonly _globalAdditionalHashes: ReadonlyMap<string, string> | undefined;
  /**
   * Hashes for files selected by `dependsOnAdditionalFiles`.
   */
  private readonly _additionalHashes: ReadonlyMap<string, string> | undefined;
  /**
   * The environment to use for `dependsOnEnvVars`.
   */
  private readonly _environment: Record<string, string | undefined>;
  /**
   * The hashes of all tracked files in the repository.
   */
  private readonly _hashes: ReadonlyMap<string, string>;

  /**
   *
   * @param params - The parameters for the snapshot
   * @internal
   */
  public constructor(params: IRushSnapshotParameters) {
    const {
      additionalHashes,
      environment = { ...process.env },
      globalAdditionalFiles,
      hashes,
      lookupByPath,
      rootDir
    } = params;
    const projectMetadataMap: Map<
      IRushConfigurationProjectForSnapshot,
      IInternalRushSnapshotProjectMetadata
    > = new Map();
    for (const [project, record] of params.projectMap) {
      projectMetadataMap.set(project, {
        // Data from the caller
        projectConfig: record.projectConfig,
        additionalFilesByOperationName: record.additionalFilesByOperationName,

        // Caches
        hashes: new Map(),
        fileHashesByOperationName: new Map(),
        hashByOperationName: new Map(),
        relativePrefix: getRelativePrefix(project, rootDir)
      });
    }

    // Route hashes to individual projects
    for (const [file, hash] of hashes) {
      const project: IRushConfigurationProjectForSnapshot | undefined = lookupByPath.findChildPath(file);
      if (!project) {
        continue;
      }

      let record: IInternalRushSnapshotProjectMetadata | undefined = projectMetadataMap.get(project);
      if (!record) {
        projectMetadataMap.set(
          project,
          (record = {
            projectConfig: undefined,
            additionalFilesByOperationName: undefined,
            hashes: new Map(),
            hashByOperationName: new Map(),
            fileHashesByOperationName: new Map(),
            relativePrefix: getRelativePrefix(project, rootDir)
          })
        );
      }

      record.hashes.set(file, hash);
    }

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
          throw new Error(
            `Requested global additional file "${file}" is owned by project in "${owningProject.projectRelativeFolder}". Declare a project dependency instead.`
          );
        }
        globalAdditionalHashes.set(file, hash);
      }
    }

    for (const record of projectMetadataMap.values()) {
      // Ensure stable ordering.
      Sort.sortMapKeys(record.hashes);
    }

    this._projectMetadataMap = projectMetadataMap;
    this._additionalHashes = additionalHashes;
    this._globalAdditionalHashes = globalAdditionalHashes;
    // Snapshot the environment so that queries are not impacted by when they happen
    this._environment = environment;
    this._hashes = hashes;
  }

  /**
   * {@inheritdoc}
   */
  public getTrackedFileHashesForOperation(
    project: IRushConfigurationProjectForSnapshot,
    operationName?: string
  ): ReadonlyMap<string, string> {
    const record: IInternalRushSnapshotProjectMetadata | undefined = this._projectMetadataMap.get(project);
    if (!record) {
      throw new Error(`No information available for project at ${project.projectFolder}`);
    }

    const { fileHashesByOperationName } = record;
    let hashes: Map<string, string> | undefined = fileHashesByOperationName.get(operationName);
    if (!hashes) {
      hashes = new Map();
      fileHashesByOperationName.set(operationName, hashes);
      // TODO: Support incrementalBuildIgnoredGlobs per-operation
      const filter: (filePath: string) => boolean = this._getOrCreateProjectFilter(record);

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
          for (const [filePath, hash] of this._resolveHashes(additionalFilesForOperation)) {
            hashes.set(filePath, hash);
          }
        }
      }

      const { _globalAdditionalHashes: globalAdditionalHashes } = this;
      if (globalAdditionalHashes) {
        for (const [file, hash] of globalAdditionalHashes) {
          record.hashes.set(file, hash);
        }
      }

      // Hash the base project files
      for (const [filePath, hash] of record.hashes) {
        if (filter(filePath)) {
          hashes.set(filePath, hash);
          const outputMatch: string | undefined = outputValidator?.findChildPath(filePath);
          if (outputMatch) {
            throw new Error(
              `Configured output folder "${outputMatch}" for operation "${operationName}" in project "${project.projectRelativeFolder}" contains tracked input file "${filePath}".`
            );
          }
        }
      }
    }

    return hashes;
  }

  /**
   * {@inheritdoc}
   */
  public getLocalStateHashForOperation(
    project: IRushConfigurationProjectForSnapshot,
    operationName?: string
  ): string {
    const record: IInternalRushSnapshotProjectMetadata | undefined = this._projectMetadataMap.get(project);
    if (!record) {
      throw new Error(`No information available for project at ${project.projectFolder}`);
    }

    const { hashByOperationName } = record;
    let hash: string | undefined = hashByOperationName.get(operationName);
    if (!hash) {
      const hashes: ReadonlyMap<string, string> = this.getTrackedFileHashesForOperation(
        project,
        operationName
      );

      const hasher: Hash = createHash('sha1');
      // If this is for a specific operation, apply operation-specific options
      if (operationName) {
        const operationSettings: Readonly<IOperationSettings> | undefined =
          record.projectConfig?.operationSettingsByOperationName.get(operationName);
        if (operationSettings) {
          const { dependsOnEnvVars, outputFolderNames } = operationSettings;
          if (dependsOnEnvVars) {
            // As long as we enumerate environment variables in a consistent order, we will get a stable hash.
            // Changing the order in rush-project.json will change the hash anyway since the file contents are part of the hash.
            for (const envVar of dependsOnEnvVars) {
              hasher.update(`${hashDelimiter}$${envVar}=${this._environment[envVar] || ''}`);
            }
          }

          if (outputFolderNames) {
            hasher.update(`${hashDelimiter}${JSON.stringify(outputFolderNames)}`);
          }
        }
      }

      // Hash the base project files
      for (const [filePath, fileHash] of hashes) {
        hasher.update(`${hashDelimiter}${filePath}${hashDelimiter}${fileHash}`);
      }

      hash = hasher.digest('hex');

      hashByOperationName.set(operationName, hash);
    }

    return hash;
  }

  private *_resolveHashes(filePaths: Iterable<string>): IterableIterator<[string, string]> {
    const { _hashes, _additionalHashes } = this;

    for (const filePath of filePaths) {
      let hash: string | undefined = _hashes.get(filePath);
      if (!hash && _additionalHashes) {
        hash = _additionalHashes.get(filePath);
      }
      if (!hash) {
        throw new Error(`Could not find hash for file path "${filePath}"`);
      }
      yield [filePath, hash];
    }
  }

  private _getOrCreateProjectFilter(
    record: IInternalRushSnapshotProjectMetadata
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
}

function getRelativePrefix(project: IRushConfigurationProjectForSnapshot, rootDir: string): string {
  return Path.convertToSlashes(path.relative(rootDir, project.projectFolder));
}

function noopFilter(filePath: string): boolean {
  return true;
}
