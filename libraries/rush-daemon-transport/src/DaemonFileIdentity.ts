// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { unlinkIfPresent } from './DaemonUnlink';

const WINDOWS_PLATFORM: NodeJS.Platform = 'win32';
const READ_ONLY: string = 'r';
const NOT_A_DIRECTORY: string = 'ENOTDIR';

/** The device and inode of a file that this process created. */
export interface IDaemonFileIdentity {
  readonly dev: number;
  readonly ino: number;
  /** An open descriptor that keeps the inode in use, so no later file can get its number (POSIX only). */
  readonly fd?: number;
}

/**
 * Every stat here uses `{ bigint: true }`, which fills a stat array of its own. A plain stat of a socket leaves
 * the socket's type in the array that Node 22's cached `fs.realpathSync` reads (nodejs/node#65113), and the next
 * `require()` in the process could then load a package through its symbolic link. Pinned and read identities
 * are converted the same way, so they compare equal.
 */
function toIdentity(stats: fs.BigIntStats): IDaemonFileIdentity {
  return { dev: Number(stats.dev), ino: Number(stats.ino) };
}

function lstatIfPresent(filePath: string): fs.BigIntStats | undefined {
  try {
    return fs.lstatSync(filePath, { bigint: true, throwIfNoEntry: false });
  } catch (error) {
    // A folder on the path that became a file leaves nothing at the path, as a deletion does.
    if ((error as NodeJS.ErrnoException).code !== NOT_A_DIRECTORY) throw error;
    return undefined;
  }
}

/** The identity of the file (not a link target) at `filePath`, or `undefined` when nothing is there. */
export function readFileIdentity(filePath: string): IDaemonFileIdentity | undefined {
  const stats: fs.BigIntStats | undefined = lstatIfPresent(filePath);
  return stats && toIdentity(stats);
}

/** The identity of the file (not a link target) at `filePath`. Throws when nothing is there. */
export function getFileIdentity(filePath: string): IDaemonFileIdentity {
  return toIdentity(fs.lstatSync(filePath, { bigint: true }));
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
  const identity: IDaemonFileIdentity = toIdentity(fs.fstatSync(fd, { bigint: true }));
  if (process.platform !== WINDOWS_PLATFORM) return { ...identity, fd };
  fs.closeSync(fd);
  return identity;
}

function isSameFile(current: IDaemonFileIdentity | undefined, expected: IDaemonFileIdentity): boolean {
  if (!current) return false;
  return current.dev === expected.dev && current.ino === expected.ino;
}

function release(identity: IDaemonFileIdentity): void {
  if (identity.fd !== undefined) fs.closeSync(identity.fd);
}

/**
 * Deletes `filePath` only while it is still the file this process created, then releases `identity`, even
 * when the deletion fails. Call it once for each identity.
 *
 * @remarks
 * Once a daemon's socket or lockfile has been replaced, for example after someone deleted it and a successor
 * started, the name belongs to the successor, which must stay reachable when this daemon exits.
 */
export function removeOwnFile(filePath: string, identity: IDaemonFileIdentity | undefined): void {
  if (!identity) return;
  try {
    if (isSameFile(readFileIdentity(filePath), identity)) unlinkIfPresent(filePath);
  } finally {
    release(identity);
  }
}
