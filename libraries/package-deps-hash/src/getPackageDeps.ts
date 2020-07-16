// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import { Executable } from '@rushstack/node-core-library';

import { IPackageDeps } from './IPackageDeps';

/**
 * Parses the output of the "git ls-tree" command
 */
export function parseGitLsTree(output: string): Map<string, string> {
  const changes: Map<string, string> = new Map<string, string>();

  if (output) {
    // A line is expected to look like:
    // 100644 blob 3451bccdc831cb43d7a70ed8e628dcf9c7f888c8    src/typings/tsd.d.ts
    // 160000 commit c5880bf5b0c6c1f2e2c43c95beeb8f0a808e8bac  rushstack
    const gitRegex: RegExp = /([0-9]{6})\s(blob|commit)\s([a-f0-9]{40})\s*(.*)/;

    // Note: The output of git ls-tree uses \n newlines regardless of OS.
    output.split('\n').forEach((line) => {
      if (line) {
        // Take everything after the "100644 blob", which is just the hash and filename
        const matches: RegExpMatchArray | null = line.match(gitRegex);
        if (matches && matches[3] && matches[4]) {
          const hash: string = matches[3];
          const filename: string = matches[4];

          changes.set(filename, hash);
        } else {
          throw new Error(`Cannot parse git ls-tree input: "${line}"`);
        }
      }
    });
  }

  return changes;
}

/**
 * Parses the output of the "git status" command
 */
export function parseGitStatus(output: string, packagePath: string): Map<string, string> {
  const changes: Map<string, string> = new Map<string, string>();

  /*
   * Typically, output will look something like:
   * M temp_modules/rush-package-deps-hash/package.json
   * D package-deps-hash/src/index.ts
   */

  // If there was an issue with `git ls-tree`, or there are no current changes, processOutputBlocks[1]
  // will be empty or undefined
  if (!output) {
    return changes;
  }

  // Note: The output of git hash-object uses \n newlines regardless of OS.
  output
    .trim()
    .split('\n')
    .forEach((line) => {
      /*
       * changeType is in the format of "XY" where "X" is the status of the file in the index and "Y" is the status of
       * the file in the working tree. Some example statuses:
       *   - 'D' == deletion
       *   - 'M' == modification
       *   - 'A' == addition
       *   - '??' == untracked
       *   - 'R' == rename
       *   - 'RM' == rename with modifications
       * filenames == path to the file, or files in the case of files that have been renamed. For files with spaces
       * in their filename, they will be surrounded by double-quotes. Some systems allow double-quotes in the
       * filename as well, though these will be escaped and should be included by the regex.
       */
      const match: RegExpMatchArray | null = line.match(/"(\\"|[^"])+"|(\S+)/g);

      if (match && match.length > 1) {
        // Trim off leading and trailing double-quotes
        const [changeType, ...filenames] = match.map((x) =>
          x.match(/^".+"$/) ? x.slice(1, x.length - 1) : x
        );

        // We always care about the last filename in the filenames array. In the case of non-rename changes,
        // the filenames array only contains one item. In the case of rename changes, the last item in the
        // array is the path to the file in the working tree, which is the only one that we care about.
        changes.set(filenames[filenames.length - 1], changeType);
      }
    });

  return changes;
}

/**
 * Takes a list of files and returns the current git hashes for them
 *
 * @public
 */
export function getGitHashForFiles(filesToHash: string[], packagePath: string): Map<string, string> {
  const changes: Map<string, string> = new Map<string, string>();

  if (filesToHash.length) {
    const result: child_process.SpawnSyncReturns<string> = Executable.spawnSync(
      'git',
      ['hash-object', ...filesToHash],
      { currentWorkingDirectory: packagePath }
    );

    if (result.status !== 0) {
      throw new Error(`git hash-object exited with status ${result.status}: ${result.stderr}`);
    }

    const hashStdout: string = result.stdout.trim();

    // The result of "git hash-object" will be a list of file hashes delimited by newlines
    const hashes: string[] = hashStdout.split('\n');

    if (hashes.length !== filesToHash.length) {
      throw new Error(
        `Passed ${filesToHash.length} file paths to Git to hash, but received ${hashes.length} hashes.`
      );
    }

    for (let i: number = 0; i < hashes.length; i++) {
      const hash: string = hashes[i];
      const filePath: string = filesToHash[i];
      changes.set(filePath, hash);
    }
  }

  return changes;
}

/**
 * Executes "git ls-tree" in a folder
 */
export function gitLsTree(path: string): string {
  const result: child_process.SpawnSyncReturns<string> = Executable.spawnSync(
    'git',
    ['ls-tree', 'HEAD', '-r'],
    {
      currentWorkingDirectory: path
    }
  );

  if (result.status !== 0) {
    throw new Error(`git ls-tree exited with status ${result.status}: ${result.stderr}`);
  }

  return result.stdout;
}

/**
 * Executes "git status" in a folder
 */
export function gitStatus(path: string): string {
  const result: child_process.SpawnSyncReturns<string> = Executable.spawnSync(
    'git',
    ['status', '-s', '-u', '.'],
    {
      currentWorkingDirectory: path
    }
  );

  if (result.status !== 0) {
    throw new Error(`git status exited with status ${result.status}: ${result.stderr}`);
  }

  return result.stdout;
}

/**
 * Builds an object containing hashes for the files under the specified `packagePath` folder.
 * @param packagePath - The folder path to derive the package dependencies from. This is typically the folder
 *                      containing package.json.  If omitted, the default value is the current working directory.
 * @param excludedPaths - An optional array of file path exclusions. If a file should be omitted from the list
 *                         of dependencies, use this to exclude it.
 * @returns the package-deps.json file content
 *
 * @public
 */
export function getPackageDeps(packagePath: string = process.cwd(), excludedPaths?: string[]): IPackageDeps {
  const excludedHashes: { [key: string]: boolean } = {};

  if (excludedPaths) {
    excludedPaths.forEach((path) => {
      excludedHashes[path] = true;
    });
  }

  const changes: IPackageDeps = {
    files: {}
  };

  const gitLsOutput: string = gitLsTree(packagePath);

  // Add all the checked in hashes
  parseGitLsTree(gitLsOutput).forEach((hash: string, filename: string) => {
    if (!excludedHashes[filename]) {
      changes.files[filename] = hash;
    }
  });

  // Update the checked in hashes with the current repo status
  const gitStatusOutput: string = gitStatus(packagePath);
  const currentlyChangedFiles: Map<string, string> = parseGitStatus(gitStatusOutput, packagePath);

  const filesToHash: string[] = [];
  currentlyChangedFiles.forEach((changeType: string, filename: string) => {
    if (changeType === 'D') {
      delete changes.files[filename];
    } else {
      if (!excludedHashes[filename]) {
        filesToHash.push(filename);
      }
    }
  });

  getGitHashForFiles(filesToHash, packagePath).forEach((hash: string, filename: string) => {
    changes.files[filename] = hash;
  });

  return changes;
}
