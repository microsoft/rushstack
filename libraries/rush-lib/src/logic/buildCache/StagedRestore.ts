// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as fs from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, readdir, rename, rm, stat } from 'node:fs/promises';
import * as path from 'node:path';

import { FileSystem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

/**
 * The start of the name of a staging folder in the project's `.rush/temp` folder.
 */
export const STAGING_FOLDER_PREFIX: string = 'build-cache-restore-';

const MOVE_CONCURRENCY: number = 10;

/**
 * Options for {@link tryRestoreThroughStagingFolderAsync}.
 */
export interface IStagedRestoreOptions {
  /**
   * The absolute path of the project folder.
   */
  projectFolder: string;
  /**
   * The absolute path of the project's `.rush/temp` folder, where the staging folder is made.
   */
  projectRushTempFolder: string;
  /**
   * The project-relative output folders to restore.
   */
  outputFolderNames: ReadonlyArray<string>;
  /**
   * Extracts the cache entry into the given folder, and returns the exit code of tar.
   */
  untarAsync: (folderPath: string) => Promise<number>;
}

/**
 * Restores output folders from a build cache entry so that a file that is in both the old outputs and the entry is
 * never missing: tar extracts the entry into a new staging folder in the project's `.rush/temp` folder, and then each
 * output folder is moved into place. A file, or a folder that has no folder in its place, is moved with one rename,
 * which replaces a file in its place at once. A folder that has a folder in its place is merged into it: the names in
 * it that the entry lacks are deleted, each entry is moved in, and the folder gets the staged folder's mode. An output
 * folder that the entry lacks is deleted. The staging folder is deleted in the end.
 *
 * @returns The exit code of tar, which is 0 if the output folders were restored. If it isn't 0, the output folders
 * weren't changed. `undefined` means that the output folders must be restored in place instead: either nothing in
 * them was changed, or moving them failed partway.
 */
export async function tryRestoreThroughStagingFolderAsync(
  terminal: ITerminal,
  options: IStagedRestoreOptions
): Promise<number | undefined> {
  const { projectFolder, projectRushTempFolder, outputFolderNames, untarAsync } = options;
  const relativeFolderPaths: string[] = [];
  const unsupportedReason: string | undefined = getUnsupportedReason(
    projectFolder,
    projectRushTempFolder,
    outputFolderNames,
    relativeFolderPaths
  );
  if (unsupportedReason) {
    terminal.writeVerboseLine(`Restoring the output folders in place, because ${unsupportedReason}.`);
    return undefined;
  }

  let stagingFolderPath: string | undefined;
  try {
    // Never make the project folder just to stage a restore in it.
    if (!(await tryGetStatsAsync(stat, projectFolder))?.isDirectory()) {
      terminal.writeVerboseLine(
        `Restoring the output folders in place, because "${projectFolder}" is not a folder.`
      );
      return undefined;
    }

    await mkdir(projectRushTempFolder, { recursive: true });
    stagingFolderPath = await mkdtemp(path.join(projectRushTempFolder, STAGING_FOLDER_PREFIX));
    terminal.writeVerboseLine(
      `Extracting the cache entry into "${stagingFolderPath}", to move the output folders into place from there.`
    );
    const tarExitCode: number = await untarAsync(stagingFolderPath);
    if (tarExitCode !== 0) {
      return tarExitCode;
    }

    const outsidePath: string | undefined = await tryFindPathOutsideFoldersAsync(
      stagingFolderPath,
      relativeFolderPaths
    );
    if (outsidePath !== undefined) {
      terminal.writeVerboseLine(
        `Restoring the output folders in place, because the cache entry has "${outsidePath}", ` +
          'which is not in an output folder.'
      );
      return undefined;
    }

    await moveFoldersIntoPlaceAsync(stagingFolderPath, projectFolder, relativeFolderPaths);
    return 0;
  } catch (error) {
    terminal.writeVerboseLine(
      `Unable to restore the output folders through a staging folder; restoring them in place: ${error}`
    );
    return undefined;
  } finally {
    if (stagingFolderPath) {
      try {
        await rm(stagingFolderPath, { recursive: true, force: true });
      } catch (error) {
        terminal.writeVerboseLine(`Unable to delete the staging folder "${stagingFolderPath}": ${error}`);
      }
    }
  }
}

// Returns why the output folders can't be restored through a staging folder, or undefined if they can, in which case
// it fills relativeFolderPaths with the normalized project-relative paths of the output folders.
function getUnsupportedReason(
  projectFolder: string,
  projectRushTempFolder: string,
  outputFolderNames: ReadonlyArray<string>,
  relativeFolderPaths: string[]
): string | undefined {
  const folderPaths: string[] = [];
  for (const folderName of outputFolderNames) {
    if (path.isAbsolute(folderName) || folderName.split(/[\\/]/).includes('..')) {
      return `the output folder name "${folderName}" is absolute or has ".."`;
    }
    const folderPath: string = path.resolve(projectFolder, folderName);
    if (isInFolder(projectRushTempFolder, folderPath)) {
      // The staging folder would be in it.
      return `the output folder "${folderName}" contains "${projectRushTempFolder}"`;
    }
    for (let i: number = 0; i < folderPaths.length; i++) {
      if (isInFolder(folderPath, folderPaths[i]) || isInFolder(folderPaths[i], folderPath)) {
        return `the output folders "${outputFolderNames[i]}" and "${folderName}" overlap`;
      }
    }
    folderPaths.push(folderPath);
  }

  for (const folderPath of folderPaths) {
    relativeFolderPaths.push(path.relative(projectFolder, folderPath));
  }
  return undefined;
}

// Whether the path is the folder or inside it. Compared without case, since the file system may ignore it.
function isInFolder(childPath: string, folderPath: string): boolean {
  const relativePath: string = path.relative(folderPath.toLowerCase(), childPath.toLowerCase());
  return !(
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  );
}

// Returns the relative path of the first thing in the staging folder that is neither in an output folder nor a folder
// that holds one, or undefined if there is none. A restore in place would put it in the project folder.
async function tryFindPathOutsideFoldersAsync(
  stagingFolderPath: string,
  relativeFolderPaths: ReadonlyArray<string>
): Promise<string | undefined> {
  const folderPaths: Set<string> = new Set(relativeFolderPaths);
  const parentPaths: Set<string> = new Set();
  for (const relativeFolderPath of relativeFolderPaths) {
    for (
      let parent: string = path.dirname(relativeFolderPath);
      parent !== '.';
      parent = path.dirname(parent)
    ) {
      parentPaths.add(parent);
    }
  }

  const queue: string[] = [''];
  for (const relativeParentPath of queue) {
    const children: fs.Dirent[] = await readdir(path.join(stagingFolderPath, relativeParentPath), {
      withFileTypes: true
    });
    for (const child of children) {
      const relativePath: string = relativeParentPath
        ? path.join(relativeParentPath, child.name)
        : child.name;
      if (parentPaths.has(relativePath) && child.isDirectory()) {
        queue.push(relativePath);
      } else if (!folderPaths.has(relativePath)) {
        return relativePath;
      }
    }
  }
  return undefined;
}

async function moveFoldersIntoPlaceAsync(
  stagingFolderPath: string,
  projectFolder: string,
  relativeFolderPaths: ReadonlyArray<string>
): Promise<void> {
  await forEachSettledAsync(relativeFolderPaths, async (relativeFolderPath: string) => {
    const stagedPath: string = path.join(stagingFolderPath, relativeFolderPath);
    const targetPath: string = path.join(projectFolder, relativeFolderPath);
    const stagedStats: fs.Stats | undefined = await tryGetStatsAsync(lstat, stagedPath);
    if (!stagedStats) {
      // The entry lacks this output folder, so a restore in place would leave it deleted.
      await rm(targetPath, { recursive: true, force: true });
      return;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    const targetStats: fs.Stats | undefined = await tryGetStatsAsync(lstat, targetPath);
    await moveIntoPlaceAsync(stagedPath, stagedStats.isDirectory(), targetPath, targetStats?.isDirectory());
  });
}

// Moves a staged file or folder to the target path. targetIsFolder is undefined if nothing is there. A symbolic link
// is never followed: it is replaced like a file.
async function moveIntoPlaceAsync(
  stagedPath: string,
  stagedIsFolder: boolean,
  targetPath: string,
  targetIsFolder: boolean | undefined
): Promise<void> {
  if (stagedIsFolder && targetIsFolder) {
    await mergeFolderAsync(stagedPath, targetPath);
    return;
  }

  if (targetIsFolder !== undefined && (stagedIsFolder || targetIsFolder)) {
    // A rename can't put a folder in place of a file, or a file in place of a folder.
    await rm(targetPath, { recursive: true, force: true });
  }
  await rename(stagedPath, targetPath);
}

async function mergeFolderAsync(stagedFolderPath: string, targetFolderPath: string): Promise<void> {
  const [stagedChildren, targetChildren]: [fs.Dirent[], fs.Dirent[]] = await Promise.all([
    readdir(stagedFolderPath, { withFileTypes: true }),
    readdir(targetFolderPath, { withFileTypes: true })
  ]);
  const stagedNames: Set<string> = new Set(stagedChildren.map((child: fs.Dirent) => child.name));
  const targetIsFolderByName: Map<string, boolean> = new Map();
  const staleNames: string[] = [];
  for (const child of targetChildren) {
    if (stagedNames.has(child.name)) {
      targetIsFolderByName.set(child.name, child.isDirectory());
    } else {
      staleNames.push(child.name);
    }
  }

  // The names that the entry lacks are deleted first. Where the file system ignores case, one of them may be the
  // same file as a staged name that differs only in case, and deleting it afterwards would delete the new file.
  await forEachSettledAsync(
    staleNames,
    async (name: string) => await rm(path.join(targetFolderPath, name), { recursive: true, force: true })
  );
  await forEachSettledAsync(
    stagedChildren,
    async (child: fs.Dirent) =>
      await moveIntoPlaceAsync(
        path.join(stagedFolderPath, child.name),
        child.isDirectory(),
        path.join(targetFolderPath, child.name),
        targetIsFolderByName.get(child.name)
      )
  );

  // A restore in place would make this folder anew.
  const { mode } = await lstat(stagedFolderPath);
  // eslint-disable-next-line no-bitwise
  await chmod(targetFolderPath, mode & 0o7777);
}

// Calls the callback for each item, MOVE_CONCURRENCY at a time. After a call fails, no more calls start, and it rejects
// with the first error once the calls that started have settled, so that nothing still moves files when the caller
// restores the output folders in place instead.
async function forEachSettledAsync<T>(
  items: ReadonlyArray<T>,
  callback: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex: number = 0;
  let failure: { error: unknown } | undefined;
  async function workAsync(): Promise<void> {
    while (nextIndex < items.length && !failure) {
      const item: T = items[nextIndex++];
      try {
        await callback(item);
      } catch (error) {
        failure = failure || { error };
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i: number = 0; i < Math.min(MOVE_CONCURRENCY, items.length); i++) {
    workers.push(workAsync());
  }
  await Promise.all(workers);
  if (failure) {
    throw failure.error;
  }
}

async function tryGetStatsAsync(
  getStatsAsync: (filePath: string) => Promise<fs.Stats>,
  filePath: string
): Promise<fs.Stats | undefined> {
  try {
    return await getStatsAsync(filePath);
  } catch (error) {
    if (FileSystem.isNotExistError(error as Error)) {
      return undefined;
    }
    throw error;
  }
}
