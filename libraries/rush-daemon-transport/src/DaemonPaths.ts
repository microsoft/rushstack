// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

const WINDOWS_PLATFORM: NodeJS.Platform = 'win32';
const PIPE_PREFIX: string = '\\\\.\\pipe\\';
const SOCKET_SUFFIX: string = '.sock';
const LOCKFILE_SUFFIX: string = '.pid.json';
const RUNTIME_DIR_NAME: string = 'rushd';
const XDG_RUNTIME_DIR_ENV: string = 'XDG_RUNTIME_DIR';

/**
 * The platform facts {@link resolveDaemonPaths} needs, injectable for tests.
 *
 * @beta
 */
export interface IDaemonPathEnvironment {
  /** The operating system platform (`process.platform`). */
  readonly platform: NodeJS.Platform;
  /** Environment variables (`process.env`). */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The per-user temporary directory (`os.tmpdir()`). */
  readonly tmpdir: string;
  /** The numeric user id on POSIX platforms (`process.getuid()`), when available. */
  readonly uid?: number;
}

/**
 * The resolved transport paths for one workspace key.
 *
 * @beta
 */
export interface IDaemonPaths {
  /** The per-user runtime directory (POSIX only; `undefined` on Windows). */
  readonly runtimeDir?: string;
  /** The socket path (POSIX) or named pipe path (Windows). */
  readonly socketPath: string;
  /** The PID/lock file path. */
  readonly lockfilePath: string;
}

/**
 * Resolves the per-user socket/pipe and lockfile paths for a workspace key.
 *
 * @remarks
 * POSIX: `$XDG_RUNTIME_DIR/rushd-<uid>/` (falling back to `<os.tmpdir()>/rushd-<uid>/`),
 * with the socket at `rushd-<key>.sock` inside it. Windows: the named pipe
 * `\\.\pipe\rushd-<key>`; the lockfile lives in `<os.tmpdir()>/rushd/` (the
 * temporary directory is already per-user on Windows).
 *
 * @beta
 */
export function resolveDaemonPaths(environment: IDaemonPathEnvironment, workspaceKey: string): IDaemonPaths {
  if (environment.platform === WINDOWS_PLATFORM) {
    return {
      runtimeDir: undefined,
      socketPath: `${PIPE_PREFIX}${workspaceKey}`,
      lockfilePath: path.win32.join(environment.tmpdir, RUNTIME_DIR_NAME, `${workspaceKey}${LOCKFILE_SUFFIX}`)
    };
  }
  const base: string = environment.env[XDG_RUNTIME_DIR_ENV] ?? environment.tmpdir;
  const runtimeDir: string = path.posix.join(base, `${RUNTIME_DIR_NAME}-${environment.uid}`);
  return {
    runtimeDir,
    socketPath: path.posix.join(runtimeDir, `${workspaceKey}${SOCKET_SUFFIX}`),
    lockfilePath: path.posix.join(runtimeDir, `${workspaceKey}${LOCKFILE_SUFFIX}`)
  };
}
