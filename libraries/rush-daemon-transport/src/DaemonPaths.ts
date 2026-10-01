// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

const WINDOWS_PLATFORM: NodeJS.Platform = 'win32';
const PIPE_PREFIX: string = '\\\\.\\pipe\\';
const SOCKET_SUFFIX: string = '.sock';
const LOCKFILE_SUFFIX: string = '.pid.json';
const RUNTIME_DIR_NAME: string = 'rushd';
// Unlike TMPDIR or XDG_RUNTIME_DIR, /tmp is the same folder for every process of a user, whatever its
// environment (sudo, cron, env -i, ssh without PAM, a service unit), so all of them meet at one daemon.
const SHARED_POSIX_TEMP_DIR: string = '/tmp';

/**
 * The environment variable that moves the per-user runtime directory on POSIX. Only an absolute path is used.
 *
 * @beta
 */
export const DAEMON_RUNTIME_DIR_ENV_VAR: 'RUSHD_RUNTIME_DIR' = 'RUSHD_RUNTIME_DIR';

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

/** The base folder that `RUSHD_RUNTIME_DIR` names, when it is an absolute path. */
function getConfiguredRuntimeBase(environment: IDaemonPathEnvironment): string | undefined {
  const value: string | undefined = environment.env[DAEMON_RUNTIME_DIR_ENV_VAR];
  return value !== undefined && path.posix.isAbsolute(value) ? value : undefined;
}

/** Resolves the paths of `workspaceKey` in the runtime directory `<base>/rushd-<uid>` (POSIX). */
function resolveDaemonPathsInBase(
  environment: IDaemonPathEnvironment,
  workspaceKey: string,
  base: string
): IDaemonPaths {
  if (environment.platform === WINDOWS_PLATFORM) {
    return {
      runtimeDir: undefined,
      socketPath: `${PIPE_PREFIX}${workspaceKey}`,
      lockfilePath: path.win32.join(environment.tmpdir, RUNTIME_DIR_NAME, `${workspaceKey}${LOCKFILE_SUFFIX}`)
    };
  }
  const runtimeDir: string = path.posix.join(base, `${RUNTIME_DIR_NAME}-${environment.uid}`);
  return {
    runtimeDir,
    socketPath: path.posix.join(runtimeDir, `${workspaceKey}${SOCKET_SUFFIX}`),
    lockfilePath: path.posix.join(runtimeDir, `${workspaceKey}${LOCKFILE_SUFFIX}`)
  };
}

/**
 * Resolves the per-user socket/pipe and lockfile paths at which a client finds the daemon of a workspace key.
 *
 * @remarks
 * POSIX: `/tmp/rushd-<uid>/`, or `$RUSHD_RUNTIME_DIR/rushd-<uid>/` when that variable is an absolute path,
 * with the socket at `rushd-<key>.sock` inside it. `TMPDIR` and `XDG_RUNTIME_DIR` are deliberately not
 * consulted: they differ between the shells, services and tools of one user, which would give one checkout
 * one daemon per environment. Windows: the named pipe `\\.\pipe\rushd-<key>`; the lockfile lives in
 * `<os.tmpdir()>/rushd/` (the temporary directory is already per-user on Windows).
 * A daemon resolves the paths it listens at with this same rule, and a client that starts one passes the
 * base it chose as `RUSHD_RUNTIME_DIR`, so a daemon, its successor and every client of a checkout meet at
 * one endpoint.
 *
 * @beta
 */
export function resolveDaemonPaths(environment: IDaemonPathEnvironment, workspaceKey: string): IDaemonPaths {
  const base: string = getConfiguredRuntimeBase(environment) ?? SHARED_POSIX_TEMP_DIR;
  return resolveDaemonPathsInBase(environment, workspaceKey, base);
}
