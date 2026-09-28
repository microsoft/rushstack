// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Executable } from '@rushstack/node-core-library';

/**
 * How far outside of the snapshot window a file time may be and still count as a save during the window.
 * File times can trail `Date.now()` by a clock tick (about 16 ms on Windows), or by up to 2 seconds on file systems
 * with coarse time stamps (FAT). A file that is flagged by mistake only costs a `git hash-object` call.
 */
export const FILE_TIME_TOLERANCE_MS: number = 2000;
const NANOSECONDS_PER_MILLISECOND: bigint = BigInt(1000000);

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
