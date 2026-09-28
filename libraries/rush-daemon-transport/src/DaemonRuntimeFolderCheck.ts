// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { DAEMON_RUNTIME_DIR_ENV_VAR } from './DaemonPaths';
import { DaemonTransportError, DaemonTransportErrorCode } from './DaemonTransportError';

const DIR_MODE: number = 0o700;
// The remainder by 0o100 is the group and other permission bits; by 0o10000, all permission bits.
const GROUP_AND_OTHER_MODE_MODULUS: number = 0o100;
const PERMISSION_MODE_MODULUS: number = 0o10000;
const NO_MODE_BITS: number = 0;
const OCTAL_RADIX: number = 8;

interface IUnsafeFolderCheck {
  readonly isUnsafe: (stats: fs.Stats, uid: number | undefined) => boolean;
  readonly reason: string;
}

const UNSAFE_FOLDER_CHECKS: readonly IUnsafeFolderCheck[] = [
  { isUnsafe: (stats: fs.Stats) => stats.isSymbolicLink(), reason: 'it is a symbolic link' },
  { isUnsafe: (stats: fs.Stats) => !stats.isDirectory(), reason: 'it is not a directory' },
  {
    // Windows has no uid to compare.
    isUnsafe: (stats: fs.Stats, uid: number | undefined) => uid !== undefined && stats.uid !== uid,
    reason: 'another user owns it'
  }
];

function createUnsafeFolderError(folder: string, stats: fs.Stats, reason: string): DaemonTransportError {
  const mode: string = (stats.mode % PERMISSION_MODE_MODULUS).toString(OCTAL_RADIX);
  return new DaemonTransportError(
    DaemonTransportErrorCode.unsafeRuntimeDirectory,
    `The daemon runtime folder ${folder} is unsafe: ${reason} (owner uid ${stats.uid}, mode ${mode}). ` +
      `Remove it, or set ${DAEMON_RUNTIME_DIR_ENV_VAR} to an absolute path of a folder that only you can write.`
  );
}

function restrictToOwner(folder: string, stats: fs.Stats, uid: number | undefined): void {
  // Windows has no POSIX permission bits to tighten.
  if (uid !== undefined && stats.mode % GROUP_AND_OTHER_MODE_MODULUS !== NO_MODE_BITS) {
    fs.chmodSync(folder, DIR_MODE);
  }
}

function assertSafeFolder(folder: string, stats: fs.Stats, uid: number | undefined): void {
  const unsafe: IUnsafeFolderCheck | undefined = UNSAFE_FOLDER_CHECKS.find((check: IUnsafeFolderCheck) =>
    check.isUnsafe(stats, uid)
  );
  if (unsafe) throw createUnsafeFolderError(folder, stats, unsafe.reason);
  restrictToOwner(folder, stats, uid);
}

/**
 * When `folder` exists, throws unless it is a directory (not a symbolic link) that user `uid` owns, and makes
 * it owner-only (mode `0700`) when others have any access. Without a `uid` (Windows), only the kind is checked.
 *
 * @throws {@link DaemonTransportError} with code `unsafeRuntimeDirectory`.
 */
export function verifyRuntimeFolder(folder: string, uid: number | undefined): void {
  const stats: fs.Stats | undefined = fs.lstatSync(folder, { throwIfNoEntry: false });
  if (stats) assertSafeFolder(folder, stats, uid);
}
