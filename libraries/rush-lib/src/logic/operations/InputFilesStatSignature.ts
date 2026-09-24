// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';

/**
 * Computes a cheap signature of the on-disk identity (size, mtime, inode) of the specified files.
 *
 * @remarks
 * Used to detect whether an operation's tracked input files were modified after the inputs snapshot
 * (from which its build cache key was derived) was taken. Missing files are included in the signature,
 * so deleting or creating a tracked file also changes it.
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

/**
 * The inputs recorded for an operation when its iteration's inputs snapshot was taken.
 */
export interface IInputFilesStatRecord {
  inputFilePaths?: ReadonlyArray<string>;
  inputFilesStatSignature?: string;
}

/**
 * Returns true if any of the recorded input files changed on disk since the signature was recorded.
 * Returns false if no inputs were recorded.
 */
export function haveInputFilesChanged(record: IInputFilesStatRecord): boolean {
  const { inputFilePaths, inputFilesStatSignature } = record;
  if (!inputFilePaths || inputFilesStatSignature === undefined) {
    return false;
  }
  return getInputFilesStatSignature(inputFilePaths) !== inputFilesStatSignature;
}
