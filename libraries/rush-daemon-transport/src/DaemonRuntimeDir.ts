// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import type { IDaemonPaths } from './DaemonPaths';
import { verifyRuntimeFolder } from './DaemonRuntimeFolderCheck';
import { assertDaemonSocketPathFits } from './DaemonSocketPathLength';

const DIR_MODE: number = 0o700;

function getCurrentUid(): number | undefined {
  return process.getuid?.();
}

function tryCreateFolder(folder: string): unknown {
  try {
    fs.mkdirSync(folder, { recursive: true, mode: DIR_MODE });
    return undefined;
  } catch (error) {
    return error;
  }
}

/**
 * Checks the per-user runtime directory, when it exists, before a client trusts the socket inside it.
 *
 * @remarks
 * The folder must be a real directory (not a symbolic link) that the current user owns; one that is also
 * open to others is changed to mode `0700`. Otherwise another user could have created it first, for example
 * in `/tmp`, and could listen at the socket path or plant the records that reclaim acts on.
 *
 * The socket path must also fit in a socket address (108 bytes on Linux, 104 on macOS), which only a long
 * `RUSHD_RUNTIME_DIR` exceeds. Node would cut a longer path short, so no client could reach the daemon.
 *
 * @throws {@link DaemonTransportError} with code `socketPathTooLong` or `unsafeRuntimeDirectory`.
 *
 * @beta
 */
export function assertDaemonRuntimeDirIsPrivate(paths: IDaemonPaths): void {
  assertDaemonSocketPathFits(paths, process.platform);
  if (paths.runtimeDir !== undefined) verifyRuntimeFolder(paths.runtimeDir, getCurrentUid());
}

/**
 * Creates the per-user runtime directory (mode `0700`) when the platform has one, and checks it as
 * {@link assertDaemonRuntimeDirIsPrivate} does. Must be called before binding a POSIX socket inside it.
 * A socket path that is too long is refused before anything is created.
 *
 * @beta
 */
export function ensureDaemonRuntimeDir(paths: IDaemonPaths): void {
  if (paths.runtimeDir === undefined) return;
  assertDaemonSocketPathFits(paths, process.platform);
  const failure: unknown = tryCreateFolder(paths.runtimeDir);
  // An entry in the way (such as a file or a dangling link) is explained by the check, not by mkdir.
  verifyRuntimeFolder(paths.runtimeDir, getCurrentUid());
  if (failure !== undefined) throw failure;
}
