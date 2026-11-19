// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  DAEMON_RUNTIME_DIR_ENV_VAR,
  DaemonTransportError,
  DaemonTransportErrorCode,
  assertDaemonRuntimeDirIsPrivate,
  ensureDaemonRuntimeDir,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { DaemonClientError } from './DaemonClientError';

const RUNTIME_FOLDER_ERROR_CODES: ReadonlySet<DaemonTransportErrorCode> = new Set([
  DaemonTransportErrorCode.unsafeRuntimeDirectory,
  DaemonTransportErrorCode.socketPathTooLong
]);

function toClientError(error: unknown): unknown {
  return error instanceof DaemonTransportError && RUNTIME_FOLDER_ERROR_CODES.has(error.code)
    ? new DaemonClientError('startupFailed', error.message, { cause: error })
    : error;
}

/**
 * Checks the daemon runtime folder, when it exists, before a client trusts the socket, lockfile or log inside
 * it (see `assertDaemonRuntimeDirIsPrivate` in `@rushstack/rush-daemon-transport`). This includes a socket
 * path too long to connect to, which only a long `RUSHD_RUNTIME_DIR` produces.
 *
 * @throws {@link DaemonClientError} with code `startupFailed` when the folder is unsafe or the socket path is
 * too long, so that a caller that falls back to in-process Rush for startup failures also does so here, before
 * it starts a daemon that no client could reach.
 *
 * @beta
 */
export function assertDaemonRuntimeFolderIsPrivate(paths: IDaemonPaths): void {
  try {
    assertDaemonRuntimeDirIsPrivate(paths);
  } catch (error) {
    throw toClientError(error);
  }
}

/** Creates and checks the runtime folder, reporting an unsafe one as {@link assertDaemonRuntimeFolderIsPrivate} does. */
export function ensureDaemonRuntimeFolder(paths: IDaemonPaths): void {
  try {
    ensureDaemonRuntimeDir(paths);
  } catch (error) {
    throw toClientError(error);
  }
}

/**
 * Adds the base of the runtime folder that this client looks in to a daemon's start environment, so the daemon
 * listens there whatever `XDG_RUNTIME_DIR`, `TMPDIR` or `RUSHD_RUNTIME_DIR` it would otherwise inherit.
 */
export function withDaemonRuntimeFolder(
  environment: Readonly<Record<string, string>>,
  paths: IDaemonPaths
): Readonly<Record<string, string>> {
  if (paths.runtimeDir === undefined) return environment;
  return { ...environment, [DAEMON_RUNTIME_DIR_ENV_VAR]: path.dirname(paths.runtimeDir) };
}
