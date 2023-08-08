// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getGitHashForFiles } from '@rushstack/package-deps-hash';
import * as path from 'path';
import type { IRawRepoState } from '../ProjectChangeAnalyzer';

async function expandGlobPatternsAsync(
  globPatterns: Iterable<string>,
  packagePath: string
): Promise<string[]> {
  const { default: glob } = await import('fast-glob');
  const matches: string[] = await glob(Array.from(globPatterns), {
    cwd: packagePath,
    onlyFiles: true,
    // We want to keep path's type unchanged,
    // i.e. if the pattern was a  relative path, then matched paths should also be relative paths
    //      if the pattern was an absolute path, then matched paths should also be absolute paths
    //
    // We are doing this because these paths are going to be used to calculate a hash for the build cache and some users
    // might choose to depend on global files (e.g. `/etc/os-release`) and some might choose to depend on local files
    // (e.g. `../path/to/workspace/file`)
    //
    // In both cases we want that path to the resource would be the same on all machines,
    // regardless of what is the current working directory.
    //
    // That being said, we want to keep `absolute` option here as false:
    absolute: false
  });

  if (matches.length === 0) {
    throw new Error(
      `Couldn't find any files matching provided glob patterns: ["${Array.from(globPatterns).join('", "')}"].`
    );
  }

  return matches;
}

interface IKnownHashesResult {
  foundPaths: Map<string, string>;
  missingPaths: string[];
}

function getKnownHashes(
  filePaths: string[],
  packagePath: string,
  repoState: IRawRepoState
): IKnownHashesResult {
  const missingPaths: string[] = [];
  const foundPaths: Map<string, string> = new Map();

  for (const filePath of filePaths) {
    const absolutePath: string = path.isAbsolute(filePath) ? filePath : path.join(packagePath, filePath);

    /**
     * We are using RegExp here to prevent false positives in the following string.replace function
     * - `^` anchor makes sure that we are replacing only the beginning of the string
     * - extra `/` makes sure that we are remove extra slash from the relative path
     */
    const gitFilePath: string = absolutePath.replace(new RegExp('^' + repoState.rootDir + '/'), '');
    const foundHash: string | undefined = repoState.rawHashes.get(gitFilePath);

    if (foundHash) {
      foundPaths.set(filePath, foundHash);
    } else {
      missingPaths.push(filePath);
    }
  }

  return { foundPaths, missingPaths };
}

export async function getHashesForGlobsAsync(
  globPatterns: Iterable<string>,
  packagePath: string,
  repoState: IRawRepoState | undefined
): Promise<Map<string, string>> {
  const filePaths: string[] = await expandGlobPatternsAsync(globPatterns, packagePath);

  if (!repoState) {
    return getGitHashForFiles(filePaths, packagePath);
  }

  const { foundPaths, missingPaths } = getKnownHashes(filePaths, packagePath, repoState);
  const calculatedHashes: Map<string, string> = getGitHashForFiles(missingPaths, packagePath);

  /**
   * We want to keep the order of the output the same regardless whether the file was already
   * hashed by git or not (as this can change, e.g. due to .gitignore).
   * Therefore we will populate our final hashes map in the same order as `filePaths`.
   */
  const result: Map<string, string> = new Map();
  for (const filePath of filePaths) {
    const hash: string | undefined = foundPaths.get(filePath) || calculatedHashes.get(filePath);
    if (!hash) {
      // Sanity check -- this should never happen
      throw new Error(`Failed to calculate hash of file: "${filePath}"`);
    }
    result.set(filePath, hash);
  }

  return result;
}
