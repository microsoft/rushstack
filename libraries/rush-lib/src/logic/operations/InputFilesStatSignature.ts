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
 * The on-disk state of an operation's tracked input files, captured right after the inputs snapshot
 * (from which the operation's build cache key is derived) was taken.
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
   * Signature of the size, modification time, and inode of each tracked input file.
   */
  readonly statSignature: string;
  /**
   * For each folder inside the repository that contains a tracked input file, the names of its entries.
   * Used to detect files (or folders) that were created after the snapshot was taken.
   */
  readonly folderEntries: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * The tracked input file paths, as passed to `captureInputFilesState`, whose modification or status change time
   * falls between the time that the inputs snapshot began reading the working tree and the time that this state
   * was captured. Git may have hashed such a file before it was saved, so its hash in the snapshot (from which the
   * build cache key was derived) may be stale even though its stats do not change again.
   */
  readonly filesChangedDuringSnapshot: ReadonlyArray<string>;
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
  onStats?: (index: number, stats: fs.BigIntStats) => void
): string {
  const hasher: crypto.Hash = crypto.createHash('sha1');
  let index: number = 0;
  for (const filePath of filePaths) {
    const stats: fs.BigIntStats | undefined = fs.statSync(filePath, { bigint: true, throwIfNoEntry: false });
    if (stats) {
      hasher.update(`${filePath}\0${stats.size}\0${stats.mtimeNs}\0${stats.ino}\n`);
      onStats?.(index, stats);
    } else {
      hasher.update(`${filePath}\0missing\n`);
    }
    index++;
  }
  return hasher.digest('hex');
}

function tryReadFolderEntries(folderPath: string): Set<string> | undefined {
  try {
    return new Set(fs.readdirSync(folderPath));
  } catch {
    return undefined;
  }
}

/**
 * Captures the on-disk state of an operation's tracked input files.
 *
 * @param rootDirectory - The repository root that relative input file paths are resolved against
 * @param inputFilePaths - The tracked input file paths. Relative paths are resolved against `rootDirectory`;
 *   absolute paths (e.g. `dependsOnAdditionalFiles` outside of the repository) are stat'ed but their folders
 *   are not watched for new entries.
 * @param snapshotStartTimeMs - When the inputs snapshot began reading the working tree
 *   (`IInputsSnapshot.workingTreeReadStartTimeMs`), if known. Used to compute `filesChangedDuringSnapshot`.
 */
export function captureInputFilesState(
  rootDirectory: string,
  inputFilePaths: Iterable<string>,
  snapshotStartTimeMs?: number
): IInputFilesState {
  const originalFilePaths: string[] = [];
  const filePaths: string[] = [];
  const folderEntries: Map<string, ReadonlySet<string>> = new Map();
  for (const inputFilePath of inputFilePaths) {
    const absolutePath: string = path.resolve(rootDirectory, inputFilePath);
    originalFilePaths.push(inputFilePath);
    filePaths.push(absolutePath);
    if (!path.isAbsolute(inputFilePath)) {
      const folderPath: string = path.dirname(absolutePath);
      if (!folderEntries.has(folderPath)) {
        folderEntries.set(folderPath, tryReadFolderEntries(folderPath) ?? new Set());
      }
    }
  }
  const windowStartNs: bigint | undefined =
    snapshotStartTimeMs === undefined
      ? undefined
      : millisecondsToNanoseconds(snapshotStartTimeMs - FILE_TIME_TOLERANCE_MS);
  // For each file with a time at or after the start of the window, the earliest such time
  const earliestTimeInWindowNsByIndex: Map<number, bigint> = new Map();
  const statSignature: string = hashInputFilesStats(filePaths, (index: number, stats: fs.BigIntStats) => {
    if (windowStartNs === undefined) {
      return;
    }
    for (const timeNs of [stats.mtimeNs, stats.ctimeNs]) {
      const earliestTimeNs: bigint | undefined = earliestTimeInWindowNsByIndex.get(index);
      if (timeNs >= windowStartNs && (earliestTimeNs === undefined || timeNs < earliestTimeNs)) {
        earliestTimeInWindowNsByIndex.set(index, timeNs);
      }
    }
  });
  // The window ends after the files were stat'ed, so that a save during the loop is inside it. A later file time
  // (e.g. an mtime set in the future) is not a save during the window.
  const windowEndNs: bigint = millisecondsToNanoseconds(Date.now() + FILE_TIME_TOLERANCE_MS);
  const filesChangedDuringSnapshot: string[] = [];
  for (const [index, timeNs] of earliestTimeInWindowNsByIndex) {
    if (timeNs <= windowEndNs) {
      filesChangedDuringSnapshot.push(originalFilePaths[index]);
    }
  }
  return { rootDirectory, filePaths, statSignature, folderEntries, filesChangedDuringSnapshot };
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
 * Returns true if any of the operation's tracked input files was modified, deleted, or replaced, or if a
 * potential new input file was created in one of the input folders, since the state was captured.
 */
export function haveInputFilesChanged(state: IInputFilesState, isNewInput: IsNewInputCallback): boolean {
  if (getInputFilesStatSignature(state.filePaths) !== state.statSignature) {
    return true;
  }
  const newEntryPaths: string[] = getNewFolderEntries(state.folderEntries);
  return newEntryPaths.length > 0 && isNewInput(newEntryPaths);
}

/**
 * Returns the Git blob hash of the content that a file has on disk, computed with the algorithm of
 * `expectedHash`, or undefined if it is not hashed in process. Unlike `git hash-object`, it applies no clean
 * filters (e.g. line ending conversion), so a mismatch does not show that the file changed.
 */
function tryGetBlobHash(filePath: string, expectedHash: string): string | undefined {
  const algorithm: string | undefined = GIT_HASH_ALGORITHM_BY_LENGTH.get(expectedHash.length);
  if (!algorithm) {
    return undefined;
  }
  let content: Buffer;
  try {
    // Not a folder or a FIFO, which cannot be read like a file
    const stats: fs.Stats | undefined = fs.statSync(filePath, { throwIfNoEntry: false });
    if (!stats?.isFile() || stats.size > MAX_IN_PROCESS_HASH_FILE_SIZE) {
      return undefined;
    }
    content = fs.readFileSync(filePath);
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
 */
export function hasUntrackedGitFiles(
  gitPath: string,
  rootDirectory: string,
  candidatePaths: ReadonlyArray<string>,
  excludedFolderPaths: ReadonlyArray<string>
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
  return result.stdout.length > 0;
}
