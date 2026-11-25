// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as fs from 'node:fs';
import { chmod, lstat, mkdir, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import * as path from 'node:path';

import { FileSystem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import type { IOperationSettings } from '../../api/RushProjectConfiguration';

/**
 * The start of the name of a staging folder in the project's `.rush/temp` folder.
 */
export const STAGING_FOLDER_PREFIX: string = 'build-cache-restore-';

const MOVE_CONCURRENCY: number = 10;

interface IStagingReservations {
  parentPath: string;
  blockedSlots: ReadonlySet<string>;
}

interface IReservationBatch {
  users: number;
  reservations: Promise<IStagingReservations>;
}

interface ISlotAllocator {
  users: number;
  nextIndex: number;
}

const outputFoldersBySettings: WeakMap<
  ReadonlyArray<Readonly<IOperationSettings>>,
  ReadonlyArray<string>
> = new WeakMap();
const reservationBatches: WeakMap<ReadonlyArray<string>, Map<string, IReservationBatch>> = new WeakMap();
const slotAllocators: Map<string, ISlotAllocator> = new Map();

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
   * An immutable current snapshot of all declared output folders in the project, including operations outside
   * the current phase selection. Share the same array across concurrent restores.
   * These reserve staging locations even when their outputs do not exist yet.
   */
  projectOutputFolderNames: ReadonlyArray<string>;
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
  const { projectFolder, projectRushTempFolder, outputFolderNames, projectOutputFolderNames, untarAsync } =
    options;
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
  let releaseReservations: (() => void) | undefined;
  let releaseSlot: (() => void) | undefined;
  try {
    // Never make the project folder just to stage a restore in it.
    if (!(await tryGetStatsAsync(stat, projectFolder))?.isDirectory()) {
      terminal.writeVerboseLine(
        `Restoring the output folders in place, because "${projectFolder}" is not a folder.`
      );
      return undefined;
    }

    const batch: ReturnType<typeof acquireReservationBatch> = acquireReservationBatch(
      projectFolder,
      projectRushTempFolder,
      projectOutputFolderNames
    );
    releaseReservations = batch.release;
    const reservations: IStagingReservations = await batch.reservations;
    const currentReservations: IStagingReservations = await collectReservationsAsync(
      projectFolder,
      projectRushTempFolder,
      outputFolderNames
    );
    if (currentReservations.parentPath !== reservations.parentPath) {
      throw new Error('The staging parent changed while resolving output reservations.');
    }
    await mkdir(projectRushTempFolder, { recursive: true });
    if ((await realpath(projectRushTempFolder)) !== reservations.parentPath) {
      throw new Error('The staging parent changed before creating a staging folder.');
    }
    const slot: Awaited<ReturnType<typeof createStagingFolderAsync>> = await createStagingFolderAsync(
      reservations.parentPath,
      reservations.blockedSlots,
      currentReservations.blockedSlots
    );
    stagingFolderPath = slot.folderPath;
    releaseSlot = slot.release;
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

    for (const relativePath of relativeFolderPaths) {
      const target: string = await resolveExistingAncestorsAsync(path.join(projectFolder, relativePath));
      if (isInFolder(target, stagingFolderPath) || isInFolder(stagingFolderPath, target)) {
        throw new Error(
          `The output "${relativePath}" overlaps its staging folder through a linked ancestor.`
        );
      }
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
    releaseSlot?.();
    releaseReservations?.();
  }
}

function acquireReservationBatch(
  projectFolder: string,
  projectRushTempFolder: string,
  outputFolderNames: ReadonlyArray<string>
): { reservations: Promise<IStagingReservations>; release: () => void } {
  let byParent: Map<string, IReservationBatch> | undefined = reservationBatches.get(outputFolderNames);
  if (!byParent) {
    reservationBatches.set(outputFolderNames, (byParent = new Map()));
  }
  const key: string = JSON.stringify([path.resolve(projectFolder), path.resolve(projectRushTempFolder)]);
  let batch: IReservationBatch | undefined = byParent.get(key);
  if (!batch) {
    batch = {
      users: 0,
      reservations: collectReservationsAsync(projectFolder, projectRushTempFolder, outputFolderNames)
    };
    byParent.set(key, batch);
  }
  batch.users++;
  const activeBatch: IReservationBatch = batch;
  return {
    reservations: batch.reservations,
    release: () => {
      if (--activeBatch.users === 0) {
        // A later batch must discover filesystem aliases again, even with the same configuration snapshot.
        byParent!.delete(key);
      }
    }
  };
}

async function collectReservationsAsync(
  projectFolder: string,
  projectRushTempFolder: string,
  outputFolderNames: ReadonlyArray<string>
): Promise<IStagingReservations> {
  const resolvedPaths: Map<string, Promise<string>> = new Map();
  const parentPath: string = await resolveExistingAncestorsAsync(projectRushTempFolder, resolvedPaths);
  const blockedSlots: Set<string> = new Set();
  for (const folderName of outputFolderNames) {
    const lexicalPath: string = path.resolve(projectFolder, folderName);
    const physicalPath: string = await resolveExistingAncestorsAsync(lexicalPath, resolvedPaths);
    for (const [parent, output] of [
      [projectRushTempFolder, lexicalPath],
      [parentPath, physicalPath]
    ]) {
      if (isInFolder(parent, output)) {
        throw new Error(`The project output "${folderName}" contains the staging parent "${parent}".`);
      }
      if (isInFolder(output, parent)) {
        // Every descendant of a slot blocks that whole slot; other output paths cannot overlap it.
        blockedSlots.add(path.relative(parent.toLowerCase(), output.toLowerCase()).split(path.sep)[0]);
      }
    }
  }
  return { parentPath, blockedSlots };
}

function resolveExistingAncestorsAsync(
  folderPath: string,
  cache: Map<string, Promise<string>> = new Map()
): Promise<string> {
  let result: Promise<string> | undefined = cache.get(folderPath);
  if (!result) {
    result = (async () => {
      try {
        return await realpath(folderPath);
      } catch (error) {
        if (!FileSystem.isNotExistError(error as Error)) {
          throw error;
        }
        if (await tryGetStatsAsync(lstat, folderPath)) {
          // A dangling link is not a missing directory; appending its name would lose its target.
          throw new Error(`Unable to resolve the existing output ancestor "${folderPath}".`, {
            cause: error
          });
        }
        const parent: string = path.dirname(folderPath);
        if (parent === folderPath) {
          throw error;
        }
        return path.join(await resolveExistingAncestorsAsync(parent, cache), path.basename(folderPath));
      }
    })();
    cache.set(folderPath, result);
  }
  return result;
}

async function createStagingFolderAsync(
  projectRushTempFolder: string,
  blockedSlots: ReadonlySet<string>,
  currentBlockedSlots: ReadonlySet<string>
): Promise<{ folderPath: string; release: () => void }> {
  const key: string = projectRushTempFolder;
  let allocator: ISlotAllocator | undefined = slotAllocators.get(key);
  if (!allocator) {
    slotAllocators.set(key, (allocator = { users: 0, nextIndex: 0 }));
  }
  allocator.users++;
  const activeAllocator: ISlotAllocator = allocator;
  const release = (): void => {
    if (--activeAllocator.users === 0) {
      slotAllocators.delete(key);
    }
  };
  try {
    for (;;) {
      const name: string = `${STAGING_FOLDER_PREFIX}${allocator.nextIndex++}`;
      if (blockedSlots.has(name) || currentBlockedSlots.has(name)) {
        continue;
      }
      const candidate: string = path.join(projectRushTempFolder, name);
      try {
        // The process-local cursor avoids retrying another local restore's slots. mkdir remains the arbiter
        // across processes; occupied or abandoned slots are never removed or reused.
        await mkdir(candidate);
        return { folderPath: candidate, release };
      } catch (error) {
        if (!FileSystem.isExistError(error as Error)) {
          throw error;
        }
      }
    }
  } catch (error) {
    release();
    throw error;
  }
}

/**
 * Includes unselected and disabled operations, and the synthetic outputs of configured shards.
 */
export function getProjectOutputFolderNames(
  operationSettings: ReadonlyArray<Readonly<IOperationSettings>>
): ReadonlyArray<string> {
  const cached: ReadonlyArray<string> | undefined = outputFoldersBySettings.get(operationSettings);
  if (cached) {
    return cached;
  }
  const outputFolderNames: Set<string> = new Set();
  for (const settings of operationSettings) {
    for (const folderName of settings.outputFolderNames ?? []) {
      outputFolderNames.add(folderName);
    }
    if (settings.sharding) {
      const { count, outputFolderArgumentFormat } = settings.sharding;
      const argument: string =
        outputFolderArgumentFormat ??
        '--shard-output-directory=.rush/operations/{phaseName}/shards/{shardIndex}';
      // Match native phase log identifiers and output templates, including unselected phases.
      const template: string = argument
        .slice(argument.indexOf('=') + 1)
        .replace(/\{phaseName\}/g, settings.operationName.replace(/:/g, '_'));
      for (let index: number = 1; index <= count; index++) {
        outputFolderNames.add(template.replace(/\{shardIndex\}/g, index.toString()));
      }
    }
  }
  const result: ReadonlyArray<string> = [...outputFolderNames];
  outputFoldersBySettings.set(operationSettings, result);
  return result;
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
