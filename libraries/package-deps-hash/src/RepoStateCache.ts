// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FileSystem } from '@rushstack/node-core-library/lib/FileSystem';

import { getFileStamp, getSettledBeforeNs, isFileStatSettled } from './FileStamp';
import {
  type IGitIndexSummary,
  summarizeGitIndex,
  tryCarryOverGitIndexCaches,
  tryGetGitIndexEntryCount
} from './GitIndexFile';
import {
  classifyLocallyModifiedFiles,
  getCleanGitEnvironment,
  getDetailedRepoStateAsync,
  getGitLsFilesArgs,
  getGitStatusArgs,
  hashFilesAsync,
  type IDetailedRepoState,
  type IGitTreeState,
  type ILocallyModifiedFiles,
  parseGitLsTree,
  parseGitStatus,
  spawnGitAsync,
  STANDARD_GIT_OPTIONS
} from './getRepoState';

/**
 * Options for {@link RepoStateCache}.
 * @beta
 */
export interface IRepoStateCacheOptions {
  /**
   * The root directory of the Git repository.
   */
  rootDirectory: string;
  /**
   * The path to the Git executable.
   */
  gitPath?: string;
  /**
   * The folder in which to create the folder that holds the copy of the Git index.
   * @defaultValue The temporary folder of the operating system
   */
  temporaryFolderPath?: string;
}

// After this many consecutive failures, stop trying to use the cache
const MAX_CONSECUTIVE_FAILURES: number = 3;
const SHA256_OBJECT_ID_LENGTH: number = 32;
const SHA1_OBJECT_ID_LENGTH: number = 20;
const INDEX_HEADER_LENGTH: number = 12;
const NANOSECONDS_PER_SECOND: bigint = BigInt(1e9);
const PRIVATE_FOLDER_PREFIX: string = 'package-deps-hash-';
const PRIVATE_INDEX_NAME: string = 'index';
const ATTRIBUTES_FILE_NAME: string = '.gitattributes';

// Unlike the other commands, "git status" doesn't pass "--no-optional-locks", so that it can save its refreshed
// copy of the index and the next "git status" doesn't need to examine the files that haven't changed since.
const PRIVATE_INDEX_STATUS_OPTIONS: readonly string[] = [
  // Ensure that commands don't run automatic maintenance, since performance of the command itself is paramount
  '-c',
  'maintenance.auto=false',
  // Git only keeps an untracked cache that matches this setting, and "git status -u" lists all untracked files
  '-c',
  'status.showUntrackedFiles=all',
  // Git would save the shared part of a split index in the Git folder of the repository
  '-c',
  'core.splitIndex=false'
];

interface IGitPaths {
  readonly indexPath: string;
  readonly objectIdLength: number;
  /**
   * The configuration and attributes files that the hashes of files may depend on.
   */
  readonly configurationPaths: ReadonlyArray<string>;
}

interface IPrivateIndex {
  readonly path: string;
  readonly entryCount: number;
  readonly entriesDigest: string;
  readonly sizesDigest: string;
  /**
   * Identifies the filter of the calls that use the copy. "git status" only refreshes the files within the filter,
   * and only lists the attributes files within it.
   */
  readonly filterKey: string;
  realIndexStamp: string;
  isRealIndexStampSettled: boolean;
  /**
   * Identifies the attributes files under which the first "git status" refreshed the copy, once it ran.
   */
  attributesFingerprint: string | undefined;
  /**
   * Whether the attributes files changed since the first "git status", so that the index must be copied again.
   */
  hasAttributesChanged: boolean;
}

interface ITree {
  readonly filterKey: string;
  readonly state: IGitTreeState;
}

interface ICarriedOverCopy {
  readonly content: Buffer;
  /**
   * The modification time of the previous copy.
   */
  readonly previousTimeNs: bigint;
}

interface IFileHash {
  readonly stamp: string;
  readonly hash: string;
}

interface IResult {
  readonly tree: ITree;
  readonly additionalPaths: ReadonlyArray<string>;
  readonly statusOutput: string;
  readonly additionalHashes: ReadonlyMap<string, string>;
  readonly modifiedHashes: ReadonlyMap<string, string>;
  readonly state: IDetailedRepoState;
}

function noop(): void {}

/**
 * Computes the same state of a Git repository as {@link getDetailedRepoStateAsync}, but faster when a process
 * computes it repeatedly.
 *
 * @remarks
 * The commands that {@link getDetailedRepoStateAsync} runs must not update the Git index, so `git status`
 * examines every file each time. This class keeps a private copy of the index that `git status` updates, so that
 * each call only examines the files that changed since the previous call. It copies the index again when the
 * files that the index records, or the sizes that it records for them, change, but not when Git merely refreshes
 * the index. While the index records the same paths, a new copy keeps the untracked cache and the file system
 * monitor's state of the previous copy, so that `git status` doesn't examine every folder and file again after
 * `git add`, for example. While the files that the index records don't change, it also reuses the list of files in
 * the index.
 * It reuses the hash of a file while the identity, size and times of the file and of the `.gitattributes` files in
 * the folders that contain it don't change, and returns the same state as the previous call if nothing changed.
 *
 * A call may return the same state as an earlier call, so the state must not be modified.
 *
 * The state also depends on the attributes and configuration of Git, under which `git status` refreshed the copy.
 * The index is copied again, and the files hashed again, when the repository's configuration or `info/attributes`
 * file changes, or when the user's `.gitconfig` file or the Git configuration or attributes file in the user's
 * configuration folder changes. The index is copied again when a `.gitattributes` file changes that `git status`
 * lists as modified or untracked, or that is in a folder that contains a filter path; the call that detects the
 * change computes the state without the cache. The index is also copied again when the filter changes. Changes to
 * the system configuration, to a configuration file included by another, to a custom `core.attributesFile`, or to
 * an ignored `.gitattributes` file that applies to files that the index records aren't detected. In rare cases,
 * the state reports uncommitted changes that {@link getDetailedRepoStateAsync} doesn't: when a file whose recorded
 * size Git refreshed in the copy but not in the index is rewritten with content that Git converts to the same
 * object, for example with other line endings.
 *
 * Repositories with submodules or a split index fall back to {@link getDetailedRepoStateAsync}, as does a cache
 * that fails repeatedly.
 * @beta
 */
export class RepoStateCache {
  readonly #rootDirectory: string;
  readonly #gitPath: string | undefined;
  readonly #temporaryFolderPath: string;
  // Calls run one at a time, in order
  #queue: Promise<void> = Promise.resolve();
  #isDisabled: boolean = false;
  #consecutiveFailureCount: number = 0;
  #privateFolderPath: string | undefined;
  #gitPaths: IGitPaths | undefined;
  #privateIndex: IPrivateIndex | undefined;
  #tree: ITree | undefined;
  #previousResult: IResult | undefined;
  #configurationFingerprint: string = '';
  #unsettledFingerprintCount: number = 0;
  readonly #fileHashes: Map<string, IFileHash> = new Map();

  public constructor(options: IRepoStateCacheOptions) {
    const { rootDirectory, gitPath, temporaryFolderPath = os.tmpdir() } = options;
    this.#rootDirectory = rootDirectory;
    this.#gitPath = gitPath;
    this.#temporaryFolderPath = temporaryFolderPath;
  }

  /**
   * Gets the object hashes for all files in the Git repo, combining the current commit with working tree state.
   * Returns the same result as {@link getDetailedRepoStateAsync}.
   *
   * @param additionalRelativePathsToHash - Root-relative file paths to have Git hash and include in the results
   * @param filterPath - The paths to which to limit the results
   * @returns The state of the repository. It may be the same object that an earlier call returned, so it must not
   * be modified.
   */
  public async getDetailedRepoStateAsync(
    additionalRelativePathsToHash: ReadonlyArray<string> = [],
    filterPath?: ReadonlyArray<string>
  ): Promise<IDetailedRepoState> {
    const resultPromise: Promise<IDetailedRepoState> = this.#queue.then(() =>
      this.#getStateAsync(additionalRelativePathsToHash, filterPath)
    );
    this.#queue = resultPromise.then(noop, noop);
    return await resultPromise;
  }

  /**
   * Deletes the copy of the Git index. Later calls compute the state without the cache.
   */
  public dispose(): void {
    this.#disable();
  }

  async #getStateAsync(
    additionalPaths: ReadonlyArray<string>,
    filterPath: ReadonlyArray<string> | undefined
  ): Promise<IDetailedRepoState> {
    if (!this.#isDisabled) {
      let state: IDetailedRepoState | undefined;
      try {
        state = await this.#tryGetCachedStateAsync(additionalPaths, filterPath);
      } catch {
        this.#reset();
        // If the state can't be computed without the cache either, report that error instead
        state = await this.#getUncachedStateAsync(additionalPaths, filterPath);
        if (++this.#consecutiveFailureCount >= MAX_CONSECUTIVE_FAILURES) {
          this.#disable();
        }

        return state;
      }

      if (state) {
        this.#consecutiveFailureCount = 0;
        return state;
      }
    }

    return await this.#getUncachedStateAsync(additionalPaths, filterPath);
  }

  async #getUncachedStateAsync(
    additionalPaths: ReadonlyArray<string>,
    filterPath: ReadonlyArray<string> | undefined
  ): Promise<IDetailedRepoState> {
    return await getDetailedRepoStateAsync(
      this.#rootDirectory,
      Array.from(additionalPaths),
      this.#gitPath,
      filterPath && Array.from(filterPath)
    );
  }

  /**
   * Returns `undefined` if the cache can't compute the state of this repository.
   */
  async #tryGetCachedStateAsync(
    additionalPaths: ReadonlyArray<string>,
    filterPath: ReadonlyArray<string> | undefined
  ): Promise<IDetailedRepoState | undefined> {
    const settledBeforeNs: bigint = getSettledBeforeNs();
    const gitPaths: IGitPaths = await this.#getGitPathsAsync();
    const filterKey: string = JSON.stringify(filterPath ?? []);
    const configurationFingerprint: string = this.#getFingerprint(
      gitPaths.configurationPaths,
      settledBeforeNs
    );
    const hasConfigurationChanged: boolean = configurationFingerprint !== this.#configurationFingerprint;
    if (hasConfigurationChanged) {
      this.#configurationFingerprint = configurationFingerprint;
      this.#fileHashes.clear();
    }

    // Git refreshed the copy of the index under the previous configuration, so it could trust the recorded data of
    // a file that the new configuration converts differently
    const privateIndex: IPrivateIndex | undefined = await this.#tryUpdatePrivateIndexAsync(
      gitPaths,
      settledBeforeNs,
      filterKey,
      hasConfigurationChanged
    );
    if (!privateIndex) {
      return undefined;
    }

    const environment: NodeJS.ProcessEnv = {
      ...getCleanGitEnvironment(),
      GIT_INDEX_FILE: privateIndex.path
    };
    // No other process uses the copy of the index, so "git status" may always save it
    delete environment.GIT_OPTIONAL_LOCKS;
    // The stamps of the attributes files in the folders that contain the files to hash
    const attributesStamps: Map<string, string | undefined> = new Map();
    // Hash the additional files while Git reads the index. Wait for both even if one fails, so that no command
    // still uses the copy of the index after this call.
    const [[tree, statusOutput], additionalHashes] = await waitForBothAsync(
      this.#getTreeAndStatusAsync(privateIndex, filterPath, filterKey, environment),
      this.#hashFilesAsync(additionalPaths, settledBeforeNs, attributesStamps)
    );
    if (!tree) {
      return undefined;
    }

    // "git status" and "git ls-files" silently treat a missing index as an empty one
    if (tryReadGitIndexEntryCount(privateIndex.path) !== privateIndex.entryCount) {
      throw new Error(`The copy of the Git index at "${privateIndex.path}" was modified by another process`);
    }

    const locallyModified: Map<string, boolean> = parseGitStatus(statusOutput);
    const attributesFingerprint: string = this.#getFingerprint(
      getAttributesFilePaths(this.#rootDirectory, locallyModified.keys(), filterPath),
      settledBeforeNs
    );
    if (privateIndex.attributesFingerprint === undefined) {
      privateIndex.attributesFingerprint = attributesFingerprint;
    } else if (attributesFingerprint !== privateIndex.attributesFingerprint) {
      // Git refreshed the copy under the previous attributes, so it could trust the recorded data of a file that
      // the new attributes convert differently. The next call copies the index again.
      privateIndex.hasAttributesChanged = true;
      return undefined;
    }

    const { filesToHash, filesToRemove }: ILocallyModifiedFiles = classifyLocallyModifiedFiles(
      locallyModified,
      tree.state.symlinks
    );
    const modifiedHashes: Map<string, string> = await this.#hashFilesAsync(
      filesToHash,
      settledBeforeNs,
      attributesStamps
    );

    const previousResult: IResult | undefined = this.#previousResult;
    if (
      previousResult &&
      previousResult.tree === tree &&
      previousResult.statusOutput === statusOutput &&
      areArraysEqual(previousResult.additionalPaths, additionalPaths) &&
      areMapsEqual(previousResult.additionalHashes, additionalHashes) &&
      areMapsEqual(previousResult.modifiedHashes, modifiedHashes)
    ) {
      return previousResult.state;
    }

    const files: Map<string, string> = new Map(tree.state.files);
    const symlinks: Map<string, string> = new Map(tree.state.symlinks);
    for (const filePath of filesToRemove) {
      files.delete(filePath);
      symlinks.delete(filePath);
    }

    for (const [filePath, hash] of additionalHashes) {
      files.set(filePath, hash);
    }

    for (const [filePath, hash] of modifiedHashes) {
      files.set(filePath, hash);
    }

    const state: IDetailedRepoState = {
      hasSubmodules: false,
      hasUncommittedChanges: locallyModified.size > 0,
      files,
      symlinks
    };
    this.#previousResult = {
      tree,
      additionalPaths: Array.from(additionalPaths),
      statusOutput,
      additionalHashes,
      modifiedHashes,
      state
    };
    return state;
  }

  /**
   * Runs `git status` and, unless the list from an earlier call is still current, lists the files in the index.
   * Returns an undefined tree if the repository has submodules.
   */
  async #getTreeAndStatusAsync(
    privateIndex: IPrivateIndex,
    filterPath: ReadonlyArray<string> | undefined,
    filterKey: string,
    environment: NodeJS.ProcessEnv
  ): Promise<[ITree | undefined, string]> {
    const currentTree: ITree | undefined = this.#tree;
    let treePromise: Promise<ITree>;
    // An interrupted "git status" may have left its lock file behind, which would stop the next one from saving
    await fs.promises.rm(`${privateIndex.path}.lock`, { force: true });
    if (currentTree?.filterKey === filterKey) {
      treePromise = Promise.resolve(currentTree);
    } else {
      this.#tree = undefined;
      // "git status" may save its refreshed copy of the index while this reads it. Git replaces the file rather
      // than writing to it, and a refresh changes only what the index records about the files, not which files
      // it records, so this lists the same files from either version.
      treePromise = spawnGitAsync(
        this.#gitPath,
        STANDARD_GIT_OPTIONS.concat(getGitLsFilesArgs(filterPath)),
        this.#rootDirectory,
        undefined,
        environment
      ).then((lsFilesOutput: string): ITree => {
        this.#tree = { filterKey, state: parseGitLsTree(lsFilesOutput) };
        return this.#tree;
      });
    }

    const statusPromise: Promise<string> = spawnGitAsync(
      this.#gitPath,
      PRIVATE_INDEX_STATUS_OPTIONS.concat(getGitStatusArgs(filterPath)),
      this.#rootDirectory,
      undefined,
      environment
    );
    const [tree, statusOutput] = await waitForBothAsync(treePromise, statusPromise);
    if (tree.state.submodules.size > 0 && FileSystem.exists(`${this.#rootDirectory}/.gitmodules`)) {
      this.#disable();
      return [undefined, ''];
    }

    return [tree, statusOutput];
  }

  async #getGitPathsAsync(): Promise<IGitPaths> {
    if (!this.#gitPaths) {
      const output: string = await spawnGitAsync(
        this.#gitPath,
        STANDARD_GIT_OPTIONS.concat([
          'rev-parse',
          '--show-object-format',
          '--git-path',
          'index',
          '--git-path',
          'info/attributes',
          '--git-path',
          'config',
          '--git-path',
          'config.worktree'
        ]),
        this.#rootDirectory
      );
      const [objectFormat, indexPath, ...repositoryConfigurationPaths] = output.trimEnd().split('\n');
      const homeFolderPath: string = os.homedir();
      const userConfigurationFolderPath: string =
        process.env.XDG_CONFIG_HOME || path.join(homeFolderPath, '.config');
      this.#gitPaths = {
        indexPath: path.resolve(this.#rootDirectory, indexPath),
        objectIdLength: objectFormat === 'sha256' ? SHA256_OBJECT_ID_LENGTH : SHA1_OBJECT_ID_LENGTH,
        configurationPaths: [
          ...repositoryConfigurationPaths.map((relativePath: string) =>
            path.resolve(this.#rootDirectory, relativePath)
          ),
          path.join(homeFolderPath, '.gitconfig'),
          path.join(userConfigurationFolderPath, 'git', 'config'),
          path.join(userConfigurationFolderPath, 'git', 'attributes')
        ]
      };
    }

    return this.#gitPaths;
  }

  /**
   * Ensures that the private copy of the index records the same files, with the same sizes, as the index of the
   * repository, and that Git refreshed it under the current configuration and attributes, and for the same filter.
   * Returns `undefined` if the repository has no index, or a split index.
   */
  async #tryUpdatePrivateIndexAsync(
    gitPaths: IGitPaths,
    settledBeforeNs: bigint,
    filterKey: string,
    mustCopy: boolean
  ): Promise<IPrivateIndex | undefined> {
    let handle: fs.promises.FileHandle;
    try {
      handle = await fs.promises.open(gitPaths.indexPath, 'r');
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        return undefined;
      }

      throw error;
    }

    try {
      const stats: fs.BigIntStats = await handle.stat({ bigint: true });
      const stamp: string = getFileStamp(stats);
      const privateIndex: IPrivateIndex | undefined = this.#privateIndex;
      const isCopyCurrent: boolean =
        privateIndex !== undefined &&
        !mustCopy &&
        !privateIndex.hasAttributesChanged &&
        privateIndex.filterKey === filterKey &&
        tryReadGitIndexEntryCount(privateIndex.path) === privateIndex.entryCount;
      // A stamp recorded before the index settled could also match a later version of the index
      if (isCopyCurrent && privateIndex?.isRealIndexStampSettled && privateIndex.realIndexStamp === stamp) {
        return privateIndex;
      }

      // Git replaces the index rather than writing to it, so the open file doesn't change
      const content: Buffer = await handle.readFile();
      const summary: IGitIndexSummary = summarizeGitIndex(content, gitPaths.objectIdLength);
      if (summary.isSplit) {
        this.#disable();
        return undefined;
      }

      const isRealIndexStampSettled: boolean = isFileStatSettled(stats, settledBeforeNs);
      if (privateIndex?.entriesDigest === summary.entriesDigest) {
        // Refreshing the index, as "git status" does, changes the stamp. It changes the recorded sizes only of files
        // whose content Git examined, such as a file that was rewritten with other line endings.
        if (isCopyCurrent && privateIndex.sizesDigest === summary.sizesDigest) {
          privateIndex.realIndexStamp = stamp;
          privateIndex.isRealIndexStampSettled = isRealIndexStampSettled;
          return privateIndex;
        }
      } else {
        // The hashes of files don't depend on the index: "git hash-object" doesn't read it, not even for a
        // ".gitattributes" file that is missing from the working tree
        this.#tree = undefined;
      }

      return await this.#writePrivateIndexAsync(
        content,
        stats,
        summary,
        filterKey,
        isRealIndexStampSettled,
        // Git updated the current copy under the current configuration, and for the same filter
        isCopyCurrent ? privateIndex : undefined,
        gitPaths.objectIdLength
      );
    } finally {
      await handle.close();
    }
  }

  async #writePrivateIndexAsync(
    content: Buffer,
    stats: fs.BigIntStats,
    summary: IGitIndexSummary,
    filterKey: string,
    isRealIndexStampSettled: boolean,
    previousIndex: IPrivateIndex | undefined,
    objectIdLength: number
  ): Promise<IPrivateIndex> {
    this.#privateIndex = undefined;

    // If the index records the same paths as the previous copy, the new copy keeps the untracked cache and the file
    // system monitor's state of the previous copy, so that "git status" doesn't examine every folder again
    const carriedOverCopy: ICarriedOverCopy | undefined =
      previousIndex && (await tryCarryOverCachesAsync(previousIndex.path, content, objectIdLength));
    const folderPath: string = this.#getPrivateFolderPath();
    const indexPath: string = path.join(folderPath, PRIVATE_INDEX_NAME);
    const temporaryPath: string = `${indexPath}.new`;
    await fs.promises.writeFile(temporaryPath, carriedOverCopy?.content ?? content);
    // Git doesn't trust the recorded times and size of a file that changed in the same second as the index was
    // written, because the file may have changed again after it was recorded. Make the copy older than the index,
    // so that Git doesn't trust any file in the copy that it wouldn't trust in the index. Git trusts the recorded
    // times of a folder in the untracked cache by the same rule, so a copy that keeps the untracked cache of the
    // previous copy must be older than that too.
    let timeNs: bigint = stats.mtimeNs;
    if (carriedOverCopy && carriedOverCopy.previousTimeNs < timeNs) {
      timeNs = carriedOverCopy.previousTimeNs;
    }

    const timeInSeconds: number = Number(timeNs / NANOSECONDS_PER_SECOND) - 1;
    await fs.promises.utimes(temporaryPath, timeInSeconds, timeInSeconds);
    await fs.promises.rename(temporaryPath, indexPath);

    const privateIndex: IPrivateIndex = {
      path: indexPath,
      entryCount: summary.entryCount,
      entriesDigest: summary.entriesDigest,
      sizesDigest: summary.sizesDigest,
      filterKey,
      realIndexStamp: getFileStamp(stats),
      isRealIndexStampSettled,
      // The file system monitor's state that the new copy keeps says which files Git found unchanged under the
      // attributes of the previous copy, so the next call must detect a change since then
      attributesFingerprint: carriedOverCopy ? previousIndex?.attributesFingerprint : undefined,
      hasAttributesChanged: false
    };
    this.#privateIndex = privateIndex;
    return privateIndex;
  }

  /**
   * Hashes the files with `git hash-object`, except those whose stamps match the stamps they had when they were
   * hashed before. The hashes are in the same order as the files.
   */
  async #hashFilesAsync(
    filePaths: ReadonlyArray<string>,
    settledBeforeNs: bigint,
    attributesStamps: Map<string, string | undefined>
  ): Promise<Map<string, string>> {
    const hashes: Map<string, string> = new Map();
    if (filePaths.length === 0) {
      return hashes;
    }

    const statsList: (fs.BigIntStats | undefined)[] = await Promise.all(
      filePaths.map(async (filePath: string) => {
        try {
          return await fs.promises.lstat(path.resolve(this.#rootDirectory, filePath), { bigint: true });
        } catch {
          // "git hash-object" reports the error
          return undefined;
        }
      })
    );

    const filesToHash: string[] = [];
    const stampsToRecord: Map<string, string | undefined> = new Map();
    for (let i: number = 0; i < filePaths.length; i++) {
      const filePath: string = filePaths[i];
      const stats: fs.BigIntStats | undefined = statsList[i];
      // A symbolic link, or a folder, is hashed afresh each time. The hash of a file also depends on the attributes
      // files in the folders that contain it, including ignored ones, which "git status" doesn't list.
      let stamp: string | undefined;
      if (stats?.isFile()) {
        const attributesStamp: string | undefined = this.#getAttributesStamp(
          getParentFolderPath(filePath),
          settledBeforeNs,
          attributesStamps
        );
        if (attributesStamp !== undefined) {
          stamp = `${getFileStamp(stats)}\n${attributesStamp}`;
        }
      }

      const fileHash: IFileHash | undefined = this.#fileHashes.get(filePath);
      if (stamp !== undefined && fileHash?.stamp === stamp) {
        hashes.set(filePath, fileHash.hash);
      } else {
        // Reserve the position of the file
        hashes.set(filePath, '');
        filesToHash.push(filePath);
        stampsToRecord.set(filePath, stats && isFileStatSettled(stats, settledBeforeNs) ? stamp : undefined);
      }
    }

    if (filesToHash.length > 0) {
      for (const [filePath, hash] of await hashFilesAsync(this.#rootDirectory, filesToHash, this.#gitPath)) {
        hashes.set(filePath, hash);
        // The file was examined before it was hashed, so a later change gives it a different stamp
        const stamp: string | undefined = stampsToRecord.get(filePath);
        if (stamp === undefined) {
          this.#fileHashes.delete(filePath);
        } else {
          this.#fileHashes.set(filePath, { stamp, hash });
        }
      }
    }

    return hashes;
  }

  /**
   * Identifies the versions of the attributes files in the folder and in the folders that contain it, whether or not
   * they exist. Returns `undefined` if one of them changed recently.
   */
  #getAttributesStamp(
    folderPath: string,
    settledBeforeNs: bigint,
    attributesStamps: Map<string, string | undefined>
  ): string | undefined {
    if (attributesStamps.has(folderPath)) {
      return attributesStamps.get(folderPath);
    }

    let stamp: string | undefined = this.#getAttributesFileStamp(folderPath, settledBeforeNs);
    if (stamp !== undefined && folderPath) {
      const parentStamp: string | undefined = this.#getAttributesStamp(
        getParentFolderPath(folderPath),
        settledBeforeNs,
        attributesStamps
      );
      stamp = parentStamp === undefined ? undefined : `${parentStamp}/${stamp}`;
    }

    attributesStamps.set(folderPath, stamp);
    return stamp;
  }

  #getAttributesFileStamp(folderPath: string, settledBeforeNs: bigint): string | undefined {
    let stats: fs.BigIntStats | undefined;
    try {
      stats = fs.lstatSync(path.resolve(this.#rootDirectory, folderPath, ATTRIBUTES_FILE_NAME), {
        bigint: true,
        throwIfNoEntry: false
      });
    } catch (error) {
      // For example, a file in place of a folder
      return `!${(error as NodeJS.ErrnoException).code}`;
    }

    if (!stats) {
      return '';
    }

    return isFileStatSettled(stats, settledBeforeNs) ? getFileStamp(stats) : undefined;
  }

  /**
   * Identifies the versions of the files. A file that changed recently gets a fingerprint that matches no other.
   */
  #getFingerprint(filePaths: Iterable<string>, settledBeforeNs: bigint): string {
    let fingerprint: string = '';
    for (const filePath of filePaths) {
      let stats: fs.BigIntStats | undefined;
      try {
        stats = fs.statSync(filePath, { bigint: true });
      } catch (error) {
        fingerprint += `${filePath}\0${(error as NodeJS.ErrnoException).code}\n`;
        continue;
      }

      if (!isFileStatSettled(stats, settledBeforeNs)) {
        // The file may change again without changing its stamp
        return `${++this.#unsettledFingerprintCount}`;
      }

      fingerprint += `${filePath}\0${getFileStamp(stats)}\n`;
    }

    return fingerprint;
  }

  #getPrivateFolderPath(): string {
    if (this.#isDisabled) {
      throw new Error('The cache is disabled');
    }

    if (!this.#privateFolderPath) {
      fs.mkdirSync(this.#temporaryFolderPath, { recursive: true });
      this.#privateFolderPath = fs.mkdtempSync(path.join(this.#temporaryFolderPath, PRIVATE_FOLDER_PREFIX));
      addPrivateFolder(this.#privateFolderPath);
    }

    return this.#privateFolderPath;
  }

  #reset(): void {
    this.#privateIndex = undefined;
    this.#tree = undefined;
    this.#previousResult = undefined;
    this.#configurationFingerprint = '';
    this.#fileHashes.clear();
    // Start over in a new folder, in case something deleted this one
    if (this.#privateFolderPath) {
      deletePrivateFolder(this.#privateFolderPath);
      this.#privateFolderPath = undefined;
    }
  }

  #disable(): void {
    this.#isDisabled = true;
    this.#reset();
  }
}

// The folders of all caches share one listener, which is registered while any folder exists
const privateFolderPaths: Set<string> = new Set();

function addPrivateFolder(folderPath: string): void {
  if (privateFolderPaths.size === 0) {
    process.on('exit', deletePrivateFolders);
  }

  privateFolderPaths.add(folderPath);
}

function deletePrivateFolder(folderPath: string): void {
  privateFolderPaths.delete(folderPath);
  if (privateFolderPaths.size === 0) {
    process.off('exit', deletePrivateFolders);
  }

  fs.rmSync(folderPath, { recursive: true, force: true });
}

function deletePrivateFolders(): void {
  for (const folderPath of privateFolderPaths) {
    fs.rmSync(folderPath, { recursive: true, force: true });
  }
}

/**
 * Builds a new copy of the index that keeps the untracked cache and the file system monitor's state of the previous
 * copy. Returns `undefined` if the index records other paths than the previous copy, or if the previous copy can't
 * be read, in which case the index is copied as it is.
 */
async function tryCarryOverCachesAsync(
  previousPath: string,
  content: Buffer,
  objectIdLength: number
): Promise<ICarriedOverCopy | undefined> {
  try {
    const handle: fs.promises.FileHandle = await fs.promises.open(previousPath, 'r');
    try {
      const previousStats: fs.BigIntStats = await handle.stat({ bigint: true });
      const previousContent: Buffer = await handle.readFile();
      const newContent: Buffer | undefined = tryCarryOverGitIndexCaches(
        content,
        previousContent,
        objectIdLength
      );
      return newContent && { content: newContent, previousTimeNs: previousStats.mtimeNs };
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

/**
 * Reads the number of entries from the header of a Git index file, or returns `undefined` if the file doesn't
 * exist or isn't a Git index.
 */
function tryReadGitIndexEntryCount(indexPath: string): number | undefined {
  let fileDescriptor: number;
  try {
    fileDescriptor = fs.openSync(indexPath, 'r');
  } catch (error) {
    if (FileSystem.isNotExistError(error as Error)) {
      return undefined;
    }

    throw error;
  }

  try {
    const header: Buffer = Buffer.alloc(INDEX_HEADER_LENGTH);
    const bytesRead: number = fs.readSync(fileDescriptor, header, 0, INDEX_HEADER_LENGTH, 0);
    return tryGetGitIndexEntryCount(header.subarray(0, bytesRead));
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

/**
 * Returns the path of the folder that contains the file or folder, or '' for the root folder of the repository.
 */
function getParentFolderPath(relativePath: string): string {
  const separatorIndex: number = Math.max(relativePath.lastIndexOf('/'), relativePath.lastIndexOf('\\'));
  return separatorIndex < 0 ? '' : relativePath.slice(0, separatorIndex);
}

/**
 * Lists the attributes files that affect how "git status" refreshes the files within the filter: those that it
 * lists as modified or untracked, and those in the folders that contain the filter paths, which it doesn't list.
 */
function* getAttributesFilePaths(
  rootDirectory: string,
  modifiedFilePaths: Iterable<string>,
  filterPath: ReadonlyArray<string> | undefined
): IterableIterator<string> {
  for (const filePath of modifiedFilePaths) {
    if (filePath === ATTRIBUTES_FILE_NAME || filePath.endsWith(`/${ATTRIBUTES_FILE_NAME}`)) {
      yield path.resolve(rootDirectory, filePath);
    }
  }

  const rootPath: string = path.resolve(rootDirectory);
  const folderPaths: Set<string> = new Set();
  for (const filterEntry of filterPath ?? []) {
    let folderPath: string = path.resolve(rootPath, filterEntry);
    while (!folderPaths.has(folderPath)) {
      folderPaths.add(folderPath);
      const parentFolderPath: string = path.dirname(folderPath);
      if (folderPath === rootPath || parentFolderPath === folderPath) {
        break;
      }

      folderPath = parentFolderPath;
    }
  }

  for (const folderPath of folderPaths) {
    yield path.join(folderPath, ATTRIBUTES_FILE_NAME);
  }
}

/**
 * Waits for both promises to settle, then fails with the first error, if any.
 */
async function waitForBothAsync<T1, T2>(promise1: Promise<T1>, promise2: Promise<T2>): Promise<[T1, T2]> {
  const [result1, result2] = await Promise.allSettled([promise1, promise2]);
  if (result1.status === 'rejected') {
    throw result1.reason;
  }

  if (result2.status === 'rejected') {
    throw result2.reason;
  }

  return [result1.value, result2.value];
}

function areArraysEqual(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  return a.length === b.length && a.every((value: string, i: number) => value === b[i]);
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
