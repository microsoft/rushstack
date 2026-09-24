// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Executable } from '@rushstack/node-core-library';

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
  const hasher: crypto.Hash = crypto.createHash('sha1');
  for (const filePath of filePaths) {
    const stats: fs.BigIntStats | undefined = fs.statSync(filePath, { bigint: true, throwIfNoEntry: false });
    if (stats) {
      hasher.update(`${filePath}\0${stats.size}\0${stats.mtimeNs}\0${stats.ino}\n`);
    } else {
      hasher.update(`${filePath}\0missing\n`);
    }
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
 */
export function captureInputFilesState(
  rootDirectory: string,
  inputFilePaths: Iterable<string>
): IInputFilesState {
  const filePaths: string[] = [];
  const folderEntries: Map<string, ReadonlySet<string>> = new Map();
  for (const inputFilePath of inputFilePaths) {
    const absolutePath: string = path.resolve(rootDirectory, inputFilePath);
    filePaths.push(absolutePath);
    if (!path.isAbsolute(inputFilePath)) {
      const folderPath: string = path.dirname(absolutePath);
      if (!folderEntries.has(folderPath)) {
        folderEntries.set(folderPath, tryReadFolderEntries(folderPath) ?? new Set());
      }
    }
  }
  return { rootDirectory, filePaths, statSignature: getInputFilesStatSignature(filePaths), folderEntries };
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