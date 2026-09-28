// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

const WINDOWS_PLATFORM: NodeJS.Platform = 'win32';
const READ_ONLY: string = 'r';

/** The device and inode of a file that this process created. */
export interface IDaemonFileIdentity {
  readonly dev: number;
  readonly ino: number;
  /** An open descriptor that keeps the inode in use, so no later file can get its number (POSIX only). */
  readonly fd?: number;
}

/** The identity of the file (not a link target) at `filePath`, or `undefined` when nothing is there. */
export function readFileIdentity(filePath: string): IDaemonFileIdentity | undefined {
  const stats: fs.Stats | undefined = fs.lstatSync(filePath, { throwIfNoEntry: false });
  return stats && { dev: stats.dev, ino: stats.ino };
}

/**
 * Returns the identity of the file that this process just wrote at `filePath`, and holds it open on POSIX.
 *
 * @remarks
 * XFS and ext4 give a deleted file's inode number to the next file created, which could then pass for this one
 * in {@link removeOwnFile}. The open descriptor keeps the inode in use until {@link removeOwnFile} releases it.
 * An NTFS file id includes a sequence number that changes on reuse, so Windows needs no descriptor.
 */
export function pinFileIdentity(filePath: string): IDaemonFileIdentity {
  const fd: number = fs.openSync(filePath, READ_ONLY);
  const { dev, ino } = fs.fstatSync(fd);
  if (process.platform !== WINDOWS_PLATFORM) return { dev, ino, fd };
  fs.closeSync(fd);
  return { dev, ino };
}

function isSameFile(current: IDaemonFileIdentity | undefined, expected: IDaemonFileIdentity): boolean {
  if (!current) return false;
  return current.dev === expected.dev && current.ino === expected.ino;
}

function release(identity: IDaemonFileIdentity): void {
  if (identity.fd !== undefined) fs.closeSync(identity.fd);
}

/**
 * Deletes `filePath` only while it is still the file this process created, then releases `identity`. Call it
 * once for each identity.
 *
 * @remarks
 * Once a daemon's socket or lockfile has been replaced, for example after someone deleted it and a successor
 * started, the name belongs to the successor, which must stay reachable when this daemon exits.
 */
export function removeOwnFile(filePath: string, identity: IDaemonFileIdentity | undefined): void {
  if (!identity) return;
  if (isSameFile(readFileIdentity(filePath), identity)) fs.rmSync(filePath, { force: true });
  release(identity);
}
