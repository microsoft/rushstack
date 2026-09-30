// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { DAEMON_RUNTIME_DIR_ENV_VAR } from './DaemonPaths';
import type { IDaemonPaths } from './DaemonPaths';
import { DaemonTransportError, DaemonTransportErrorCode } from './DaemonTransportError';

// The size of sockaddr_un.sun_path. Node truncates a longer path to this many bytes when it binds or connects,
// but a daemon publishes its socket with link(2), which does not, so clients would look for a name nobody bound.
const LINUX_MAX_SOCKET_PATH_BYTES: number = 108;
// macOS and the BSDs.
const OTHER_MAX_SOCKET_PATH_BYTES: number = 104;
const LINUX_PLATFORM: NodeJS.Platform = 'linux';
// The shortest absolute base, `/`.
const MIN_BASE_BYTES: number = 1;

interface ISocketPathLength {
  readonly socketPath: string;
  readonly runtimeDir: string;
  readonly bytes: number;
  readonly limit: number;
}

/** The longest socket path, in bytes, that a POSIX `platform` binds and connects to without truncating it. */
export function getMaxDaemonSocketPathBytes(platform: NodeJS.Platform): number {
  return platform === LINUX_PLATFORM ? LINUX_MAX_SOCKET_PATH_BYTES : OTHER_MAX_SOCKET_PATH_BYTES;
}

// Paths from resolveDaemonPaths always leave room for a base; other layouts may not.
function describeRemedy(maxBaseBytes: number): string {
  return maxBaseBytes < MIN_BASE_BYTES
    ? `Use a shorter runtime folder, or unset ${DAEMON_RUNTIME_DIR_ENV_VAR}.`
    : `Set ${DAEMON_RUNTIME_DIR_ENV_VAR} to an absolute path of at most ${maxBaseBytes} bytes, or unset it.`;
}

function createTooLongError(length: ISocketPathLength): DaemonTransportError {
  const { socketPath, runtimeDir, bytes, limit } = length;
  // The runtime folder is `<base>/rushd-<uid>`, so everything after its parent is fixed.
  const suffixBytes: number = bytes - Buffer.byteLength(path.posix.dirname(runtimeDir));
  return new DaemonTransportError(
    DaemonTransportErrorCode.socketPathTooLong,
    `The daemon socket path ${socketPath} is ${bytes} bytes long, but this platform allows at most ${limit}. ` +
      describeRemedy(limit - suffixBytes)
  );
}

/**
 * Throws unless the POSIX socket path of `paths` fits in a socket address on `platform`. Windows named pipes
 * (no runtime directory) are not checked.
 *
 * @throws {@link DaemonTransportError} with code `socketPathTooLong`.
 */
export function assertDaemonSocketPathFits(paths: IDaemonPaths, platform: NodeJS.Platform): void {
  const { runtimeDir, socketPath } = paths;
  if (runtimeDir === undefined) return;
  const bytes: number = Buffer.byteLength(socketPath);
  const limit: number = getMaxDaemonSocketPathBytes(platform);
  if (bytes > limit) throw createTooLongError({ socketPath, runtimeDir, bytes, limit });
}
