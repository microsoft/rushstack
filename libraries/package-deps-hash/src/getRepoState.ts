// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as child_process from 'child_process';
import { Executable } from '@rushstack/node-core-library';

/**
 * Parses the output of the "git ls-tree -r -z" command
 * @internal
 */
export function parseGitLsTree(output: string): Map<string, string> {
  const result: Map<string, string> = new Map();

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
    result.set(filePath, hash);

    last = index + 1;
    index = output.indexOf('\0', last);
  }

  return result;
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
 * Parses the output of `git status -z -u`
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

  let last: number = 0;
  let index: number = output.indexOf('\0', last);
  while (index >= 0) {
    // We passed --no-renames above, so a rename will be a delete of the old location and an add at the new.
    const workingTreeStatus: string = output.charAt(last + 2);
    const exists: boolean =
      workingTreeStatus !== 'D' && (workingTreeStatus !== ' ' || output.charAt(last + 1) !== 'D');
    const filePath: string = output.slice(last + 3, index);

    result.set(filePath, exists);

    last = index + 1;
    index = output.indexOf('\0', last);
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
      throw new Error(`git rev-parse exited with status ${result.status}: ${result.stderr}`);
    }

    repoRootCache.set(currentWorkingDirectory, (cachedResult = result.stdout.trim()));
  }

  return cachedResult;
}

/**
 * Augments the state value with modifications that are not in the index.
 * @param rootDirectory - The root directory of the Git repository
 * @param state - The current map of git path -> object hash. Will be mutated.
 * @param gitPath - The path to the Git executable
 * @internal
 */
export function applyWorkingTreeState(
  rootDirectory: string,
  state: Map<string, string>,
  gitPath?: string
): void {
  const statusResult: child_process.SpawnSyncReturns<string> = Executable.spawnSync(
    gitPath || 'git',
    ['--no-optional-locks', 'status', '-z', '-u', '--no-renames', '--'],
    {
      currentWorkingDirectory: rootDirectory
    }
  );

  if (statusResult.status !== 0) {
    throw new Error(`git status exited with status ${statusResult.status}: ${statusResult.stderr}`);
  }

  const locallyModified: Map<string, boolean> = parseGitStatus(statusResult.stdout);

  const filesToHash: string[] = [];
  for (const [filePath, exists] of locallyModified) {
    if (exists) {
      filesToHash.push(filePath);
    } else {
      state.delete(filePath);
    }
  }

  if (filesToHash.length) {
    // Use --stdin-paths arg to pass the list of files to git in order to avoid issues with
    // command length
    const hashObjectResult: child_process.SpawnSyncReturns<string> = Executable.spawnSync(
      gitPath || 'git',
      ['hash-object', '--stdin-paths'],
      { input: filesToHash.join('\n') }
    );

    if (hashObjectResult.status !== 0) {
      throw new Error(
        `git hash-object exited with status ${hashObjectResult.status}: ${hashObjectResult.stderr}`
      );
    }

    const hashStdout: string = hashObjectResult.stdout.trim();

    // The result of "git hash-object" will be a list of file hashes delimited by newlines
    const hashes: string[] = hashStdout.split('\n');

    if (hashes.length !== filesToHash.length) {
      throw new Error(
        `Passed ${filesToHash.length} file paths to Git to hash, but received ${hashes.length} hashes.`
      );
    }

    const len: number = hashes.length;
    for (let i: number = 0; i < len; i++) {
      const hash: string = hashes[i];
      const filePath: string = filesToHash[i];
      state.set(filePath, hash);
    }
  }
}

/**
 * Gets the object hashes for all files in the Git repo, combining the current commit with working tree state.
 * @param currentWorkingDirectory - The working directory. Only used to find the repository root.
 * @param gitPath - The path to the Git executable
 * @beta
 */
export function getRepoState(currentWorkingDirectory: string, gitPath?: string): Map<string, string> {
  const rootDirectory: string = getRepoRoot(currentWorkingDirectory, gitPath);

  const lsTreeResult: child_process.SpawnSyncReturns<string> = Executable.spawnSync(
    gitPath || 'git',
    ['--no-optional-locks', 'ls-tree', '-r', '-z', '--full-name', 'HEAD', '--'],
    {
      currentWorkingDirectory: rootDirectory
    }
  );

  if (lsTreeResult.status !== 0) {
    throw new Error(`git ls-tree exited with status ${lsTreeResult.status}: ${lsTreeResult.stderr}`);
  }

  const state: Map<string, string> = parseGitLsTree(lsTreeResult.stdout);

  applyWorkingTreeState(rootDirectory, state, gitPath);

  return state;
}

/**
 * Find all changed files tracked by Git, their current hashes, and the nature of the change. Only useful if all changes are staged or committed.
 * @param currentWorkingDirectory - The working directory. Only used to find the repository root.
 * @param revision - The Git revision specifier to detect changes relative to. Defaults to HEAD (i.e. will compare staged vs. committed)
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
    [
      '--no-optional-locks',
      'diff-index',
      '--color=never',
      '--no-renames',
      '--no-commit-id',
      '--cached',
      '-z',
      revision,
      '--'
    ],
    {
      currentWorkingDirectory: rootDirectory
    }
  );

  if (result.status !== 0) {
    throw new Error(`git diff-index exited with status ${result.status}: ${result.stderr}`);
  }

  const changes: Map<string, IFileDiffStatus> = parseGitDiffIndex(result.stdout);

  return changes;
}
