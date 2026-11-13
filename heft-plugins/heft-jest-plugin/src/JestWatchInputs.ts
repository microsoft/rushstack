// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { Config } from '@jest/types';

import type { IWatchFileSystem } from '@rushstack/heft';
import { FileSystem, type FolderItem } from '@rushstack/node-core-library';

/**
 * Folder names that are never test inputs. `jest-haste-map` always ignores the version control folders.
 */
const IGNORED_FOLDER_NAMES: ReadonlySet<string> = new Set(['node_modules', '.git', '.hg', '.sl']);

/**
 * Describes which files are test inputs in watch mode.
 */
export interface IJestWatchInputOptions {
  /**
   * The folders that contain the test inputs
   */
  rootPaths: ReadonlySet<string>;
  /**
   * Folders that are not test inputs, because Jest or Heft write to them while running
   */
  excludedFolderPaths: ReadonlySet<string>;
  /**
   * Patterns for paths that are not test inputs, matched against absolute paths
   */
  ignorePatterns: readonly RegExp[];
}

/**
 * Determines the test inputs from the normalized Jest configuration. Like Jest's own watch mode, this ignores
 * paths that match `modulePathIgnorePatterns` or `watchPathIgnorePatterns`, and the cache folder.
 */
export function getJestWatchInputOptions(
  globalConfig: Config.GlobalConfig,
  configs: readonly Config.ProjectConfig[],
  tempFolderPath: string
): IJestWatchInputOptions {
  const rootPaths: Set<string> = new Set();
  const excludedFolderPaths: Set<string> = new Set([
    _getRealPath(tempFolderPath),
    _getRealPath(globalConfig.coverageDirectory)
  ]);
  const ignorePatterns: RegExp[] = [];
  for (const config of configs) {
    for (const root of config.roots) {
      rootPaths.add(_getRealPath(root));
    }
    excludedFolderPaths.add(_getRealPath(config.cacheDirectory));
    for (const pattern of [...config.modulePathIgnorePatterns, ...config.watchPathIgnorePatterns]) {
      ignorePatterns.push(new RegExp(pattern));
    }
  }

  return { rootPaths, excludedFolderPaths, ignorePatterns };
}

/**
 * Returns the modified time of each test input file, and tracks the files with `watchFs` so that Heft schedules
 * another incremental run when any of them change. The times are read directly rather than through
 * `watchGlobAsync`, because its change detection relies on the watcher's cached times, which may not yet include
 * files that the build phase wrote just before this run.
 *
 * Heft watches a folder that was read with `watchFs` together with everything under it, and its watcher does
 * not support ignored paths. A folder that contains an excluded or ignored path is therefore listed without
 * tracking, and only its test input files and its other subfolders are tracked. Files and subfolders that are
 * later added directly to such a folder do not trigger a run. This affects roots that contain `node_modules`,
 * ignored paths or Jest's output folders, such as the project folder.
 */
export function collectTestInputFileTimes(
  watchFs: IWatchFileSystem,
  options: IJestWatchInputOptions
): Map<string, number> {
  const { rootPaths, excludedFolderPaths, ignorePatterns } = options;
  const fileTimes: Map<string, number> = new Map();

  const isIgnored = (itemPath: string, isFolder: boolean): boolean =>
    ignorePatterns.some(
      (pattern: RegExp) => pattern.test(itemPath) || (isFolder && pattern.test(itemPath + path.sep))
    );

  const isExcludedFolder = (folderPath: string, folderName: string): boolean =>
    IGNORED_FOLDER_NAMES.has(folderName) ||
    excludedFolderPaths.has(folderPath) ||
    isIgnored(folderPath, true);

  const trackFolder = (folderPath: string): void => {
    try {
      watchFs.readdirSync(folderPath);
    } catch {
      // A missing folder is watched for its creation
    }
  };

  // Returns true if the folder contains no excluded or ignored paths, so that it can be tracked as a whole
  const collectFolder = (folderPath: string): boolean => {
    let folderItems: FolderItem[];
    try {
      folderItems = FileSystem.readFolderItems(folderPath);
    } catch {
      return true;
    }

    const filePaths: string[] = [];
    const subfolderPaths: string[] = [];
    let containsExcludedPath: boolean = false;
    for (const folderItem of folderItems) {
      const itemPath: string = path.join(folderPath, folderItem.name);
      if (!folderItem.isDirectory()) {
        if (isIgnored(itemPath, false)) {
          containsExcludedPath = true;
        } else {
          filePaths.push(itemPath);
        }
      } else if (isExcludedFolder(itemPath, folderItem.name)) {
        containsExcludedPath = true;
      } else if (collectFolder(itemPath)) {
        subfolderPaths.push(itemPath);
      } else {
        containsExcludedPath = true;
      }
    }

    for (const filePath of filePaths) {
      try {
        fileTimes.set(filePath, watchFs.statSync(filePath).mtimeMs);
      } catch {
        // The file was deleted while reading the folder
      }
    }

    if (containsExcludedPath) {
      for (const subfolderPath of subfolderPaths) {
        trackFolder(subfolderPath);
      }
    }
    return !containsExcludedPath;
  };

  // Like Jest's crawler, apply the ignore patterns only to the contents of the roots
  for (const rootPath of rootPaths) {
    if (!excludedFolderPaths.has(rootPath) && collectFolder(rootPath)) {
      trackFolder(rootPath);
    }
  }

  return fileTimes;
}

/**
 * Returns true if any test input file was added, deleted or modified, or if there was no previous run.
 */
export function haveTestInputsChanged(
  previousFileTimes: ReadonlyMap<string, number> | undefined,
  fileTimes: ReadonlyMap<string, number>
): boolean {
  if (!previousFileTimes || previousFileTimes.size !== fileTimes.size) {
    return true;
  }
  for (const [filePath, time] of fileTimes) {
    if (previousFileTimes.get(filePath) !== time) {
      return true;
    }
  }
  return false;
}

/**
 * Jest resolves symbolic links in `rootDir`, so paths that are compared with the paths that Jest uses must be
 * resolved too. For a path that does not exist yet, the closest existing parent folder is resolved.
 */
function _getRealPath(fileOrFolderPath: string): string {
  const resolvedPath: string = path.resolve(fileOrFolderPath);
  const missingSegments: string[] = [];
  let existingPath: string = resolvedPath;
  for (;;) {
    try {
      return path.join(FileSystem.getRealPath(existingPath), ...missingSegments);
    } catch {
      const parentPath: string = path.dirname(existingPath);
      if (parentPath === existingPath) {
        return resolvedPath;
      }
      missingSegments.unshift(path.basename(existingPath));
      existingPath = parentPath;
    }
  }
}
