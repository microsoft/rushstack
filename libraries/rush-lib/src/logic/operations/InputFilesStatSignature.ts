// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Executable } from '@rushstack/node-core-library';
import { hashFilesAsync } from '@rushstack/package-deps-hash';

/**
 * How far outside of the snapshot window a file time may be and still count as a save during the window.
 * File times can trail `Date.now()` by a clock tick (about 16 ms on Windows), or by up to 2 seconds on file systems
 * with coarse time stamps (FAT). A file that is flagged by mistake is usually only read and hashed again
 * (see `haveSnapshotHashesChangedAsync`).
 */
export const FILE_TIME_TOLERANCE_MS: number = 2000;
const NANOSECONDS_PER_MILLISECOND: bigint = BigInt(1000000);

/**
 * The largest file that `haveSnapshotHashesChangedAsync` hashes itself. Git hashes larger files, since hashing
 * them could take longer than starting Git, and would block the event loop.
 */
export const MAX_IN_PROCESS_HASH_FILE_SIZE: number = 1024 * 1024;

/**
 * The algorithm of a Git object hash, by the number of its hexadecimal digits.
 */
const GIT_HASH_ALGORITHM_BY_LENGTH: ReadonlyMap<number, string> = new Map([
  [40, 'sha1'],
  [64, 'sha256']
]);

function millisecondsToNanoseconds(timeMs: number): bigint {
  return BigInt(Math.floor(timeMs)) * NANOSECONDS_PER_MILLISECOND;
}

/**
 * The on-disk state of an operation's tracked input files, captured right before the operation executes. The
 * changes that were made after the inputs snapshot (from which the operation's build cache key is derived) began
 * reading the working tree, and before this state was captured, are found from file and folder times.
 */
export interface IInputFilesState {
  /**
   * The repository root that relative input file paths were resolved against.
   */
  readonly rootDirectory: string;
  /**
   * Absolute paths of the tracked input files.
   */
  readonly filePaths: ReadonlyArray<string>;
  /**
   * Signature of the size, modification time, and inode of each tracked input file. For a symbolic link that does
   * not lead to a regular file, they are those of the link itself.
   */
  readonly statSignature: string;
  /**
   * For each folder inside the repository that contains a tracked input file, the names of the entries that it had
   * when the inputs snapshot read the working tree. Used to detect files (or folders) that were created afterwards.
   * For a folder that did not change after the snapshot began reading the working tree, these are its entries when
   * this state was captured. For a folder that did, they are only the names that lead to tracked input files and
   * the entries whose times are all before that time.
   */
  readonly folderEntries: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * The tracked input file paths, as passed to `captureInputFilesState`, whose modification or status change time
   * falls between the time that the inputs snapshot began reading the working tree and the time that this state
   * was captured. Git may have hashed such a file before it was saved, so its hash in the snapshot (from which the
   * build cache key was derived) may be stale even though its stats do not change again.
   */
  readonly filesChangedDuringSnapshot: ReadonlyArray<string>;
  /**
   * The tracked input file paths, as passed to `captureInputFilesState`, that were missing when this state was
   * captured, and whose folder (or, if it is missing, the nearest folder above it) changed after the inputs snapshot
   * began reading the working tree. The snapshot has a hash of such a file, so the file was deleted after Git read
   * it, unless Git does not read it from the working tree (e.g. it is marked `skip-worktree`).
   */
  readonly filesDeletedDuringSnapshot: ReadonlyArray<string>;
}

/**
 * Given the absolute paths of entries that appeared in input folders after the snapshot was taken,
 * returns true if any of them is a potential input of the operation (e.g. an untracked, non-ignored file).
 */
export type IsNewInputCallback = (newEntryPaths: ReadonlyArray<string>) => boolean;

/**
 * Computes a cheap signature of the on-disk identity (size, mtime, inode) of the specified files.
 * Missing files are included in the signature, so deleting or creating a listed file also changes it.
 */
export function getInputFilesStatSignature(filePaths: Iterable<string>): string {
  return hashInputFilesStats(filePaths);
}

function hashInputFilesStats(
  filePaths: Iterable<string>,
  onStats?: (index: number, stats: fs.BigIntStats | undefined) => void
): string {
  const hasher: crypto.Hash = crypto.createHash('sha1');
  let index: number = 0;
  for (const filePath of filePaths) {
    const stats: fs.BigIntStats | undefined = tryGetInputFileStats(filePath);
    if (stats) {
      hasher.update(`${filePath}\0${stats.size}\0${stats.mtimeNs}\0${stats.ino}\n`);
    } else {
      hasher.update(`${filePath}\0missing\n`);
    }
    onStats?.(index, stats);
    index++;
  }
  return hasher.digest('hex');
}

/**
 * Returns the stats of what Git hashes for an input file, or `undefined` if the file is missing: the file, or the
 * regular file that a symbolic link leads to. For a symbolic link that does not lead to a regular file (e.g. its
 * target is missing, is a folder, or is a loop of links), Git hashes the text of the link, as the inputs snapshot
 * does, so the stats are those of the link itself.
 */
function tryGetInputFileStats(filePath: string): fs.BigIntStats | undefined {
  let stats: fs.BigIntStats | undefined;
  try {
    stats = fs.statSync(filePath, { bigint: true, throwIfNoEntry: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ELOOP') {
      throw error;
    }
  }
  if (stats?.isFile()) {
    return stats;
  }
  const linkStats: fs.BigIntStats | undefined = tryGetLinkStats(filePath);
  return linkStats?.isSymbolicLink() ? linkStats : stats;
}

/**
 * Returns true if the modification or status change time of the folder is at or after the specified time.
 * Deleting a folder changes the folder that held it, so a missing folder is judged by the nearest folder above it
 * that exists.
 */
function hasFolderChangedSince(folderPath: string, timeNs: bigint): boolean {
  let currentPath: string = folderPath;
  for (;;) {
    let stats: fs.BigIntStats | undefined;
    try {
      stats = fs.statSync(currentPath, { bigint: true, throwIfNoEntry: false });
    } catch {
      // E.g. ENOTDIR, if a folder above it was replaced by a file
    }
    if (stats) {
      return stats.mtimeNs >= timeNs || stats.ctimeNs >= timeNs;
    }
    const parentPath: string = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return true;
    }
    currentPath = parentPath;
  }
}

function tryGetLinkStats(entryPath: string): fs.BigIntStats | undefined {
  try {
    return fs.lstatSync(entryPath, { bigint: true, throwIfNoEntry: false });
  } catch {
    return undefined;
  }
}

function tryReadFolderEntries(folderPath: string): Set<string> | undefined {
  try {
    return new Set(fs.readdirSync(folderPath));
  } catch {
    return undefined;
  }
}

/**
 * Captures the on-disk state of an operation's tracked input files. Call it right before the operation executes.
 *
 * @param rootDirectory - The repository root that relative input file paths are resolved against
 * @param inputFilePaths - The tracked input file paths. Relative paths are resolved against `rootDirectory`;
 *   absolute paths (e.g. `dependsOnAdditionalFiles` outside of the repository) are stat'ed but their folders
 *   are not watched for new entries.
 * @param snapshotStartTimeMs - When the inputs snapshot began reading the working tree
 *   (`IInputsSnapshot.workingTreeReadStartTimeMs`), if known. Used to compute `filesChangedDuringSnapshot` and
 *   `filesDeletedDuringSnapshot`, and to find the folders whose entries may have been created after that time.
 */
export function captureInputFilesState(
  rootDirectory: string,
  inputFilePaths: Iterable<string>,
  snapshotStartTimeMs?: number
): IInputFilesState {
  const originalFilePaths: string[] = [];
  const filePaths: string[] = [];
  // The absolute paths of the input files whose folders are watched for new entries, and those folders
  const watchedFilePaths: string[] = [];
  const folderPaths: Set<string> = new Set();
  for (const inputFilePath of inputFilePaths) {
    const absolutePath: string = path.resolve(rootDirectory, inputFilePath);
    originalFilePaths.push(inputFilePath);
    filePaths.push(absolutePath);
    if (!path.isAbsolute(inputFilePath)) {
      watchedFilePaths.push(absolutePath);
      folderPaths.add(path.dirname(absolutePath));
    }
  }
  const windowStartNs: bigint | undefined =
    snapshotStartTimeMs === undefined
      ? undefined
      : millisecondsToNanoseconds(snapshotStartTimeMs - FILE_TIME_TOLERANCE_MS);
  // For each file with a time at or after the start of the window, the earliest such time
  const earliestTimeInWindowNsByIndex: Map<number, bigint> = new Map();
  const missingFileIndexes: number[] = [];
  // The files are stat'ed before their folders, so that a file that is deleted after its stat changes the signature,
  // and a file that is deleted before its stat changes the times of its folder.
  const statSignature: string = hashInputFilesStats(
    filePaths,
    (index: number, stats: fs.BigIntStats | undefined) => {
      if (windowStartNs === undefined) {
        return;
      }
      if (!stats) {
        missingFileIndexes.push(index);
        return;
      }
      for (const timeNs of [stats.mtimeNs, stats.ctimeNs]) {
        const earliestTimeNs: bigint | undefined = earliestTimeInWindowNsByIndex.get(index);
        if (timeNs >= windowStartNs && (earliestTimeNs === undefined || timeNs < earliestTimeNs)) {
          earliestTimeInWindowNsByIndex.set(index, timeNs);
        }
      }
    }
  );
  // The window ends after the files were stat'ed, so that a save during the loop is inside it. A later file time
  // (e.g. an mtime set in the future) is not a save during the window.
  const windowEndNs: bigint = millisecondsToNanoseconds(Date.now() + FILE_TIME_TOLERANCE_MS);
  const filesChangedDuringSnapshot: string[] = [];
  for (const [index, timeNs] of earliestTimeInWindowNsByIndex) {
    if (timeNs <= windowEndNs) {
      filesChangedDuringSnapshot.push(originalFilePaths[index]);
    }
  }

  const folderEntries: Map<string, ReadonlySet<string>> = new Map();
  const hasFolderChangedByPath: Map<string, boolean> = new Map();
  // The entries that each folder that changed during the window had when it was read
  let entriesByChangedFolder: Map<string, ReadonlySet<string> | undefined> | undefined;
  for (const folderPath of folderPaths) {
    // Read before the folder is stat'ed, so that an entry that is created after it was read either changes the
    // times of the folder or is missing from the entries that are compared later.
    const entries: Set<string> | undefined = tryReadFolderEntries(folderPath);
    const hasFolderChanged: boolean =
      windowStartNs !== undefined && hasFolderChangedSince(folderPath, windowStartNs);
    hasFolderChangedByPath.set(folderPath, hasFolderChanged);
    if (hasFolderChanged) {
      entriesByChangedFolder ??= new Map();
      entriesByChangedFolder.set(folderPath, entries);
    } else {
      folderEntries.set(folderPath, entries ?? new Set());
    }
  }
  if (entriesByChangedFolder && windowStartNs !== undefined) {
    // The entries of a folder that changed during the window may include some that were created after the snapshot
    // read the working tree. Only those that are known to have existed before are compared later: the names that
    // lead to tracked input files, and the entries that were not created, moved or modified during the window.
    const originalEntriesByChangedFolder: Map<string, Set<string>> = new Map();
    for (const folderPath of entriesByChangedFolder.keys()) {
      const originalEntries: Set<string> = new Set();
      originalEntriesByChangedFolder.set(folderPath, originalEntries);
      folderEntries.set(folderPath, originalEntries);
    }
    for (const filePath of watchedFilePaths) {
      originalEntriesByChangedFolder.get(path.dirname(filePath))?.add(path.basename(filePath));
    }
    // Each folder on the path from the root to a folder of input files is visited once.
    const resolvedRootDirectory: string = path.resolve(rootDirectory);
    const visitedFolderPaths: Set<string> = new Set();
    for (const folderPath of folderPaths) {
      let childPath: string = folderPath;
      while (childPath !== resolvedRootDirectory && !visitedFolderPaths.has(childPath)) {
        visitedFolderPaths.add(childPath);
        const parentPath: string = path.dirname(childPath);
        if (parentPath === childPath) {
          break;
        }
        originalEntriesByChangedFolder.get(parentPath)?.add(path.basename(childPath));
        childPath = parentPath;
      }
    }
    for (const [folderPath, entries] of entriesByChangedFolder) {
      const originalEntries: Set<string> = originalEntriesByChangedFolder.get(folderPath)!;
      for (const entry of entries ?? []) {
        if (!originalEntries.has(entry)) {
          // Creating, moving, or modifying an entry changes its status change time, which cannot be set back.
          const stats: fs.BigIntStats | undefined = tryGetLinkStats(path.join(folderPath, entry));
          if (stats && stats.ctimeNs < windowStartNs && stats.mtimeNs < windowStartNs) {
            originalEntries.add(entry);
          }
        }
      }
    }
  }

  const filesDeletedDuringSnapshot: string[] = [];
  if (windowStartNs !== undefined) {
    for (const index of missingFileIndexes) {
      const folderPath: string = path.dirname(filePaths[index]);
      let hasFolderChanged: boolean | undefined = hasFolderChangedByPath.get(folderPath);
      if (hasFolderChanged === undefined) {
        hasFolderChanged = hasFolderChangedSince(folderPath, windowStartNs);
        hasFolderChangedByPath.set(folderPath, hasFolderChanged);
      }
      if (hasFolderChanged) {
        filesDeletedDuringSnapshot.push(originalFilePaths[index]);
      }
    }
  }
  return {
    rootDirectory,
    filePaths,
    statSignature,
    folderEntries,
    filesChangedDuringSnapshot,
    filesDeletedDuringSnapshot
  };
}

/**
 * Returns the absolute paths of entries that exist now but did not exist when the folder entries were captured.
 */
export function getNewFolderEntries(folderEntries: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  const newEntryPaths: string[] = [];
  for (const [folderPath, originalEntries] of folderEntries) {
    const currentEntries: Set<string> | undefined = tryReadFolderEntries(folderPath);
    if (currentEntries) {
      for (const entry of currentEntries) {
        if (!originalEntries.has(entry)) {
          newEntryPaths.push(path.join(folderPath, entry));
        }
      }
    }
  }
  return newEntryPaths;
}

/**
 * Returns true if any of the operation's tracked input files was deleted after the inputs snapshot read it and
 * before the state was captured, or, since the state was captured, if any of them was modified, deleted, or
 * replaced, or a potential new input file was created in one of the input folders. A file that was created in a
 * folder that changed during the window can have been created before the state was captured.
 */
export function haveInputFilesChanged(state: IInputFilesState, isNewInput: IsNewInputCallback): boolean {
  if (state.filesDeletedDuringSnapshot.length > 0) {
    return true;
  }
  if (getInputFilesStatSignature(state.filePaths) !== state.statSignature) {
    return true;
  }
  const newEntryPaths: string[] = getNewFolderEntries(state.folderEntries).filter(mayHoldFiles);
  return newEntryPaths.length > 0 && isNewInput(newEntryPaths);
}

/**
 * Returns false if the entry is missing, or is a folder that holds no files, not even in its subfolders. Git does
 * not track folders, so such a folder cannot hold a potential input file.
 */
function mayHoldFiles(entryPath: string): boolean {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(entryPath, { withFileTypes: true });
  } catch (error) {
    // E.g. ENOTDIR for a file
    return (error as NodeJS.ErrnoException).code !== 'ENOENT';
  }
  return entries.some(
    (entry: fs.Dirent) => !entry.isDirectory() || mayHoldFiles(path.join(entryPath, entry.name))
  );
}

/**
 * Returns the Git blob hash of the content that a file has on disk, or of the text of a symbolic link that does not
 * lead to a regular file, which is what Git hashes for such a link, computed with the algorithm of `expectedHash`.
 * Returns undefined if it is not hashed in process. Unlike `git hash-object`, it applies no clean filters (e.g. line
 * ending conversion), so a mismatch does not show that the file changed.
 */
function tryGetBlobHash(filePath: string, expectedHash: string): string | undefined {
  const algorithm: string | undefined = GIT_HASH_ALGORITHM_BY_LENGTH.get(expectedHash.length);
  if (!algorithm) {
    return undefined;
  }
  let content: Buffer;
  try {
    const stats: fs.BigIntStats | undefined = tryGetInputFileStats(filePath);
    if (stats?.isSymbolicLink()) {
      content = fs.readlinkSync(filePath, { encoding: 'buffer' });
    } else if (stats?.isFile() && stats.size <= BigInt(MAX_IN_PROCESS_HASH_FILE_SIZE)) {
      content = fs.readFileSync(filePath);
    } else {
      // A folder or a FIFO cannot be read like a file
      return undefined;
    }
  } catch {
    return undefined;
  }
  return crypto.createHash(algorithm).update(`blob ${content.length}\0`).update(content).digest('hex');
}

/**
 * Returns true if the current Git hash of any of the specified files differs from its hash in the inputs
 * snapshot. If Git was not found or the files cannot be hashed, conservatively returns true.
 *
 * @remarks
 * Each file is hashed in process first, which is much cheaper than starting Git. If the content that a file has on
 * disk has its snapshot hash, the file is unchanged, since Git's usual clean filters (line ending conversion,
 * `ident` and Git LFS) leave content that they already cleaned as it is. Only the other files are hashed with
 * `git hash-object`, which applies the clean filters, as the inputs snapshot did.
 *
 * @param gitPath - The path of the Git executable, if it was found
 * @param rootDirectory - The repository root that the file paths are relative to
 * @param filePaths - The files to hash, e.g. the `filesChangedDuringSnapshot` of an `IInputFilesState`
 * @param snapshotHashes - The hashes of the files in the inputs snapshot, by path
 */
export async function haveSnapshotHashesChangedAsync(
  gitPath: string | undefined,
  rootDirectory: string,
  filePaths: ReadonlyArray<string>,
  snapshotHashes: ReadonlyMap<string, string> | undefined
): Promise<boolean> {
  if (!gitPath || !snapshotHashes) {
    return true;
  }
  const filePathsToHashWithGit: string[] = [];
  for (const filePath of filePaths) {
    const snapshotHash: string | undefined = snapshotHashes.get(filePath);
    if (snapshotHash === undefined) {
      return true;
    }
    if (tryGetBlobHash(path.resolve(rootDirectory, filePath), snapshotHash) !== snapshotHash) {
      filePathsToHashWithGit.push(filePath);
    }
  }
  if (filePathsToHashWithGit.length === 0) {
    return false;
  }
  try {
    for (const [filePath, hash] of await hashFilesAsync(rootDirectory, filePathsToHashWithGit, gitPath)) {
      if (snapshotHashes.get(filePath) !== hash) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

function toGitPathspec(rootDirectory: string, absolutePath: string): string {
  return path.relative(rootDirectory, absolutePath).split(path.sep).join('/');
}

/**
 * Uses Git to determine whether any of the specified paths is, or contains, an untracked file that is not
 * ignored by `.gitignore`, excluding the specified folders (typically the operation's output folders).
 * If Git fails, conservatively returns true.
 *
 * @param snapshotHashes - The hashes of the files in the inputs snapshot, by path relative to `rootDirectory`, if
 *   known. An untracked file that the snapshot hashed existed when the snapshot read the working tree, so it does
 *   not count.
 */
export function hasUntrackedGitFiles(
  gitPath: string,
  rootDirectory: string,
  candidatePaths: ReadonlyArray<string>,
  excludedFolderPaths: ReadonlyArray<string>,
  snapshotHashes?: ReadonlyMap<string, string>
): boolean {
  const args: string[] = ['ls-files', '--others', '--exclude-standard', '-z', '--'];
  for (const candidatePath of candidatePaths) {
    args.push(`:(literal)${toGitPathspec(rootDirectory, candidatePath)}`);
  }
  for (const excludedFolderPath of excludedFolderPaths) {
    args.push(`:(exclude,literal)${toGitPathspec(rootDirectory, excludedFolderPath)}`);
  }
  const result: ReturnType<typeof Executable.spawnSync> = Executable.spawnSync(gitPath, args, {
    currentWorkingDirectory: rootDirectory
  });
  if (result.status !== 0) {
    return true;
  }
  if (!snapshotHashes) {
    return result.stdout.length > 0;
  }
  // The paths are relative to the root, since Git ran there, and are separated by NUL characters.
  for (const filePath of result.stdout.split('\0')) {
    if (filePath && !snapshotHashes.has(filePath)) {
      return true;
    }
  }
  return false;
}
