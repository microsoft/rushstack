// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as child_process from 'node:child_process';
import { once } from 'node:events';
import { Readable, pipeline } from 'node:stream';

import { Executable, FileSystem, type IExecutableSpawnOptions } from '@rushstack/node-core-library';

export interface IGitVersion {
  major: number;
  minor: number;
  patch: number;
}

const MINIMUM_GIT_VERSION: IGitVersion = {
  major: 2,
  minor: 20,
  patch: 0
};

const STANDARD_GIT_OPTIONS: readonly string[] = [
  // Don't request any optional file locks
  '--no-optional-locks',
  // Ensure that commands don't run automatic maintenance, since performance of the command itself is paramount
  '-c',
  'maintenance.auto=false'
];

const OBJECTMODE_SUBMODULE: '160000' = '160000';
const OBJECTMODE_SYMLINK: '120000' = '120000';
const OBJECTMODE_FILE_NONEXECUTABLE: '100644' = '100644';
const OBJECTMODE_FILE_EXECUTABLE: '100755' = '100755';

interface IGitTreeState {
  files: Map<string, string>; // type "blob"
  symlinks: Map<string, string>; // type "link"
  submodules: Map<string, string>; // type "commit"
}

/**
 * Parses the output of the "git ls-tree -r -z" command or of other commands that have been coerced to match its format.
 * @internal
 */
export function parseGitLsTree(output: string): IGitTreeState {
  const files: Map<string, string> = new Map();
  const symlinks: Map<string, string> = new Map();
  const submodules: Map<string, string> = new Map();

  // Parse the output
  // With the -z modifier, paths are delimited by nulls
  // A line looks like:
  // <mode> <type> <newhash>\t<path>\0
  // 100644 blob a300ccb0b36bd2c85ef18e3c619a2c747f95959e\ttools/prettier-git/prettier-git.js\0

  let last: number = 0;
  let index: number = output.indexOf('\0', last);
  while (index >= 0) {
    const item: string = output.slice(last, index);

    const tabIndex: number = item.indexOf('\t');
    const filePath: string = item.slice(tabIndex + 1);

    // The newHash will be all zeros if the file is deleted, or a hash if it exists
    const hash: string = item.slice(tabIndex - 40, tabIndex);

    const mode: string = item.slice(0, item.indexOf(' '));

    switch (mode) {
      case OBJECTMODE_SUBMODULE: {
        // This is a submodule
        submodules.set(filePath, hash);
        break;
      }
      case OBJECTMODE_SYMLINK: {
        // This is a symbolic link
        symlinks.set(filePath, hash);
        break;
      }
      case OBJECTMODE_FILE_NONEXECUTABLE:
      case OBJECTMODE_FILE_EXECUTABLE:
      default: {
        files.set(filePath, hash);
        break;
      }
    }

    last = index + 1;
    index = output.indexOf('\0', last);
  }

  return {
    files,
    symlinks,
    submodules
  };
}

/**
 * Parses the output of `git hash-object`
 * yields [filePath, hash] pairs.
 * @internal
 */
export function* parseGitHashObject(
  output: string,
  filePaths: ReadonlyArray<string>
): IterableIterator<[string, string]> {
  const expected: number = filePaths.length;
  if (expected === 0) {
    return;
  }

  output = output.trim();

  let last: number = 0;
  let i: number = 0;
  let index: number = output.indexOf('\n', last);
  for (; i < expected && index > 0; i++) {
    const hash: string = output.slice(last, index);
    yield [filePaths[i], hash];
    last = index + 1;
    index = output.indexOf('\n', last);
  }

  // Handle last line. Will be non-empty to due trim() call.
  if (index < 0) {
    const hash: string = output.slice(last);
    yield [filePaths[i], hash];
    i++;
  }

  if (i !== expected) {
    throw new Error(`Expected ${expected} hashes from "git hash-object" but received ${i}`);
  }
}

/**
 * Information about the changes to a file.
 * @beta
 */
export interface IFileDiffStatus {
  mode: string;
  oldhash: string;
  newhash: string;
  status: 'A' | 'D' | 'M';
}

/**
 * Parses the output of `git diff-index --color=never --no-renames --no-commit-id -z <REVISION> --
 * Returns a map of file path to diff
 * @internal
 */
export function parseGitDiffIndex(output: string): Map<string, IFileDiffStatus> {
  const result: Map<string, IFileDiffStatus> = new Map();

  // Parse the output
  // With the -z modifier, paths are delimited by nulls
  // A line looks like:
  // :<oldmode> <newmode> <oldhash> <newhash> <status>\0<path>\0
  // :100644 100644 a300ccb0b36bd2c85ef18e3c619a2c747f95959e 0000000000000000000000000000000000000000 M\0tools/prettier-git/prettier-git.js\0

  let last: number = 0;
  let index: number = output.indexOf('\0', last);
  while (index >= 0) {
    const header: string = output.slice(last, index);
    const status: IFileDiffStatus['status'] = header.slice(-1) as IFileDiffStatus['status'];

    last = index + 1;
    index = output.indexOf('\0', last);
    const filePath: string = output.slice(last, index);

    // We passed --no-renames above, so a rename will be a delete of the old location and an add at the new.
    // The newHash will be all zeros if the file is deleted, or a hash if it exists
    const mode: string = header.slice(8, 14);
    const oldhash: string = header.slice(-83, -43);
    const newhash: string = header.slice(-42, -2);
    result.set(filePath, {
      mode,
      oldhash,
      newhash,
      status
    });

    last = index + 1;
    index = output.indexOf('\0', last);
  }

  return result;
}

/**
 * Parses the output of `git status -z -u` to extract the set of files that have changed since HEAD.
 *
 * @param output - The raw output from Git
 * @returns a map of file path to if it exists
 * @internal
 */
export function parseGitStatus(output: string): Map<string, boolean> {
  const result: Map<string, boolean> = new Map();

  // Parse the output
  // With the -z modifier, paths are delimited by nulls
  // A line looks like:
  // XY <path>\0
  //  M tools/prettier-git/prettier-git.js\0

  let startOfLine: number = 0;
  let eolIndex: number = output.indexOf('\0', startOfLine);
  while (eolIndex >= 0) {
    // We passed --no-renames above, so a rename will be a delete of the old location and an add at the new.
    // charAt(startOfLine) is the index status, charAt(startOfLine + 1) is the working tree status
    const workingTreeStatus: string = output.charAt(startOfLine + 1);
    // Deleted in working tree, or not modified in working tree and deleted in index
    const deleted: boolean =
      workingTreeStatus === 'D' || (workingTreeStatus === ' ' && output.charAt(startOfLine) === 'D');

    const filePath: string = output.slice(startOfLine + 3, eolIndex);
    result.set(filePath, !deleted);

    startOfLine = eolIndex + 1;
    eolIndex = output.indexOf('\0', startOfLine);
  }

  return result;
}

const repoRootCache: Map<string, string> = new Map();

/**
 * Finds the root of the current Git repository
 *
 * @param currentWorkingDirectory - The working directory for which to locate the repository
 * @param gitPath - The path to the Git executable
 *
 * @returns The full path to the root directory of the Git repository
 * @beta
 */
export function getRepoRoot(currentWorkingDirectory: string, gitPath?: string): string {
  let cachedResult: string | undefined = repoRootCache.get(currentWorkingDirectory);
  if (!cachedResult) {
    const result: child_process.SpawnSyncReturns<string> = Executable.spawnSync(
      gitPath || 'git',
      ['--no-optional-locks', 'rev-parse', '--show-toplevel'],
      {
        currentWorkingDirectory
      }
    );

    if (result.status !== 0) {
      ensureGitMinimumVersion(gitPath);

      throw new Error(`git rev-parse exited with status ${result.status}: ${result.stderr}`);
    }

    cachedResult = result.stdout.trim();

    repoRootCache.set(currentWorkingDirectory, cachedResult);
    // To ensure that calling getRepoRoot on the result is a no-op.
    repoRootCache.set(cachedResult, cachedResult);
  }

  return cachedResult;
}

/**
 * Helper function for async process invocation with optional stdin support.
 * @param gitPath - Path to the Git executable
 * @param args - The process arguments
 * @param currentWorkingDirectory - The working directory. Should be the repository root.
 * @param stdin - An optional Readable stream to use as stdin to the process.
 */
async function spawnGitAsync(
  gitPath: string | undefined,
  args: string[],
  currentWorkingDirectory: string,
  stdin?: Readable
): Promise<string> {
  const spawnOptions: IExecutableSpawnOptions = {
    currentWorkingDirectory,
    stdio: ['pipe', 'pipe', 'pipe']
  };

  let stdout: string = '';
  let stderr: string = '';

  const proc: child_process.ChildProcess = Executable.spawn(gitPath || 'git', args, spawnOptions);
  proc.stdout!.setEncoding('utf-8');
  proc.stderr!.setEncoding('utf-8');

  proc.stdout!.on('data', (chunk: string) => {
    stdout += chunk.toString();
  });
  proc.stderr!.on('data', (chunk: string) => {
    stderr += chunk.toString();
  });

  if (stdin) {
    /**
     * For `git hash-object` data is piped in asynchronously. In the event that one of the
     * passed filenames cannot be hashed, subsequent writes to `proc.stdin` will error.
     * Silence this error since it will be handled by the non-zero exit code of the process.
     */
    pipeline(stdin, proc.stdin!, (err) => {});
  }

  const [status] = await once(proc, 'close');
  if (status !== 0) {
    throw new Error(`git ${args[0]} exited with code ${status}:\n${stderr}`);
  }

  return stdout;
}

function isIterable<T>(value: Iterable<T> | AsyncIterable<T>): value is Iterable<T> {
  return Symbol.iterator in value;
}

/**
 * Uses `git hash-object` to hash the provided files. Unlike `getGitHashForFiles`, this API is asynchronous, and also allows for
 * the input file paths to be specified as an async iterable.
 *
 * @param rootDirectory - The root directory to which paths are specified relative. Must be the root of the Git repository.
 * @param filesToHash - The file paths to hash using `git hash-object`
 * @param gitPath - The path to the Git executable
 * @returns An iterable of [filePath, hash] pairs
 *
 * @remarks
 * The input file paths must be specified relative to the Git repository root, or else be absolute paths.
 * @beta
 */
export async function hashFilesAsync(
  rootDirectory: string,
  filesToHash: Iterable<string> | AsyncIterable<string>,
  gitPath?: string
): Promise<Iterable<[string, string]>> {
  const hashPaths: string[] = [];

  const input: Readable = Readable.from(
    isIterable(filesToHash)
      ? (function* (): IterableIterator<string> {
          for (const file of filesToHash) {
            hashPaths.push(file);
            yield `${file}\n`;
          }
        })()
      : (async function* (): AsyncIterableIterator<string> {
          for await (const file of filesToHash) {
            hashPaths.push(file);
            yield `${file}\n`;
          }
        })(),
    {
      encoding: 'utf-8',
      objectMode: false,
      autoDestroy: true
    }
  );

  const hashObjectResult: string = await spawnGitAsync(
    gitPath,
    STANDARD_GIT_OPTIONS.concat(['hash-object', '--stdin-paths']),
    rootDirectory,
    input
  );

  return parseGitHashObject(hashObjectResult, hashPaths);
}

/**
 * Gets the object hashes for all files in the Git repo, combining the current commit with working tree state.
 * Uses async operations and runs all primary Git calls in parallel.
 * @param rootDirectory - The root directory of the Git repository
 * @param additionalRelativePathsToHash - Root-relative file paths to have Git hash and include in the results
 * @param gitPath - The path to the Git executable
 * @beta
 */
export async function getRepoStateAsync(
  rootDirectory: string,
  additionalRelativePathsToHash?: string[],
  gitPath?: string,
  filterPath?: string[]
): Promise<Map<string, string>> {
  const { files } = await getDetailedRepoStateAsync(
    rootDirectory,
    additionalRelativePathsToHash,
    gitPath,
    filterPath
  );

  return files;
}

/**
 * Information about the detailed state of the Git repository.
 * @beta
 */
export interface IDetailedRepoState {
  /**
   * The Git file hashes for all files in the repository, including uncommitted changes.
   */
  files: Map<string, string>;
  /**
   * The Git file hashes for all symbolic links in the repository, including uncommitted changes.
   */
  symlinks: Map<string, string>;
  /**
   * A boolean indicating whether the repository has submodules.
   */
  hasSubmodules: boolean;
  /**
   * A boolean indicating whether the repository has uncommitted changes.
   */
  hasUncommittedChanges: boolean;
}

/**
 * Gets the object hashes for all files in the Git repo, combining the current commit with working tree state.
 * Uses async operations and runs all primary Git calls in parallel.
 * @param rootDirectory - The root directory of the Git repository
 * @param additionalRelativePathsToHash - Root-relative file paths to have Git hash and include in the results
 * @param gitPath - The path to the Git executable
 * @beta
 */
export async function getDetailedRepoStateAsync(
  rootDirectory: string,
  additionalRelativePathsToHash?: string[],
  gitPath?: string,
  filterPath?: string[]
): Promise<IDetailedRepoState> {
  const statePromise: Promise<IGitTreeState> = spawnGitAsync(
    gitPath,
    STANDARD_GIT_OPTIONS.concat([
      'ls-files',
      // Read from the index only
      '--cached',
      // Use NUL as the separator
      '-z',
      // Specify the full path to files relative to the root
      '--full-name',
      // Match the format of "git ls-tree". The %(objecttype) placeholder requires git 2.51.0+, so not using yet.
      '--format=%(objectmode) type %(objectname)%x09%(path)',
      '--',
      ...(filterPath ?? [])
    ]),
    rootDirectory
  ).then(parseGitLsTree);
  const locallyModifiedPromise: Promise<Map<string, boolean>> = spawnGitAsync(
    gitPath,
    STANDARD_GIT_OPTIONS.concat([
      'status',
      // Use NUL as the separator
      '-z',
      // Include untracked files
      '-u',
      // Disable rename detection so that renames show up as add + delete
      '--no-renames',
      // Don't process submodules with this command; they'll be handled individually
      '--ignore-submodules',
      // Don't compare against the remote
      '--no-ahead-behind',
      '--',
      ...(filterPath ?? [])
    ]),
    rootDirectory
  ).then(parseGitStatus);

  async function* getFilesToHash(): AsyncIterableIterator<string> {
    if (additionalRelativePathsToHash) {
      for (const file of additionalRelativePathsToHash) {
        yield file;
      }
    }

    const [{ files, symlinks }, locallyModified] = await Promise.all([statePromise, locallyModifiedPromise]);

    for (const [filePath, exists] of locallyModified) {
      if (exists && !symlinks.has(filePath)) {
        yield filePath;
      } else {
        files.delete(filePath);
        symlinks.delete(filePath);
      }
    }
  }

  const hashObjectPromise: Promise<Iterable<[string, string]>> = hashFilesAsync(
    rootDirectory,
    getFilesToHash(),
    gitPath
  );

  const [{ files, symlinks, submodules }, locallyModifiedFiles] = await Promise.all([
    statePromise,
    locallyModifiedPromise
  ]);

  // The result of "git hash-object" will be a list of file hashes delimited by newlines
  for (const [filePath, hash] of await hashObjectPromise) {
    files.set(filePath, hash);
  }

  // Existence check for the .gitmodules file
  const hasSubmodules: boolean = submodules.size > 0 && FileSystem.exists(`${rootDirectory}/.gitmodules`);

  if (hasSubmodules) {
    // Submodules are not the normal critical path. Accept serial performance rather than investing in complexity.
    // Can revisit if submodules become more commonly used.
    for (const submodulePath of submodules.keys()) {
      const submoduleState: Map<string, string> = await getRepoStateAsync(
        `${rootDirectory}/${submodulePath}`,
        [],
        gitPath
      );
      for (const [filePath, hash] of submoduleState) {
        files.set(`${submodulePath}/${filePath}`, hash);
      }
    }
  }

  return {
    hasSubmodules,
    hasUncommittedChanges: locallyModifiedFiles.size > 0,
    files,
    symlinks
  };
}

/**
 * Find all changed files tracked by Git, their current hashes, and the nature of the change. Only useful if all changes are staged or committed.
 * @param currentWorkingDirectory - The working directory. Only used to find the repository root.
 * @param revision - The Git revision specifier to detect changes relative to. Defaults to HEAD (i.e. will compare staged vs. committed)
 *   If comparing against a different branch, call `git merge-base` first to find the target commit.
 * @param gitPath - The path to the Git executable
 * @returns A map from the Git file path to the corresponding file change metadata
 * @beta
 */
export function getRepoChanges(
  currentWorkingDirectory: string,
  revision: string = 'HEAD',
  gitPath?: string
): Map<string, IFileDiffStatus> {
  const rootDirectory: string = getRepoRoot(currentWorkingDirectory, gitPath);

  const result: child_process.SpawnSyncReturns<string> = Executable.spawnSync(
    gitPath || 'git',
    STANDARD_GIT_OPTIONS.concat([
      'diff-index',
      '--color=never',
      '--no-renames',
      '--no-commit-id',
      '--cached',
      '-z',
      revision,
      '--'
    ]),
    {
      currentWorkingDirectory: rootDirectory
    }
  );

  if (result.status !== 0) {
    ensureGitMinimumVersion(gitPath);

    throw new Error(`git diff-index exited with status ${result.status}: ${result.stderr}`);
  }

  const changes: Map<string, IFileDiffStatus> = parseGitDiffIndex(result.stdout);

  return changes;
}

/**
 * Checks the git version and throws an error if it is less than the minimum required version.
 *
 * @public
 */
export function ensureGitMinimumVersion(gitPath?: string): void {
  const gitVersion: IGitVersion = getGitVersion(gitPath);
  if (
    gitVersion.major < MINIMUM_GIT_VERSION.major ||
    (gitVersion.major === MINIMUM_GIT_VERSION.major && gitVersion.minor < MINIMUM_GIT_VERSION.minor) ||
    (gitVersion.major === MINIMUM_GIT_VERSION.major &&
      gitVersion.minor === MINIMUM_GIT_VERSION.minor &&
      gitVersion.patch < MINIMUM_GIT_VERSION.patch)
  ) {
    throw new Error(
      `The minimum Git version required is ` +
        `${MINIMUM_GIT_VERSION.major}.${MINIMUM_GIT_VERSION.minor}.${MINIMUM_GIT_VERSION.patch}. ` +
        `Your version is ${gitVersion.major}.${gitVersion.minor}.${gitVersion.patch}.`
    );
  }
}

function getGitVersion(gitPath?: string): IGitVersion {
  const result: child_process.SpawnSyncReturns<string> = Executable.spawnSync(
    gitPath || 'git',
    STANDARD_GIT_OPTIONS.concat(['version'])
  );

  if (result.status !== 0) {
    throw new Error(
      `While validating the Git installation, the "git version" command failed with ` +
        `status ${result.status}: ${result.stderr}`
    );
  }

  return parseGitVersion(result.stdout);
}

export function parseGitVersion(gitVersionOutput: string): IGitVersion {
  // This regexp matches output of "git version" that looks like `git version <number>.<number>.<number>(+whatever)`
  // Examples:
  // - git version 1.2.3
  // - git version 1.2.3.4.5
  // - git version 1.2.3windows.1
  // - git version 1.2.3.windows.1
  const versionRegex: RegExp = /^git version (\d+)\.(\d+)\.(\d+)/;
  const match: RegExpMatchArray | null = versionRegex.exec(gitVersionOutput);
  if (!match) {
    throw new Error(
      `While validating the Git installation, the "git version" command produced ` +
        `unexpected output: "${gitVersionOutput}"`
    );
  }

  const major: number = parseInt(match[1], 10);
  const minor: number = parseInt(match[2], 10);
  const patch: number = parseInt(match[3], 10);

  return {
    major,
    minor,
    patch
  };
}
