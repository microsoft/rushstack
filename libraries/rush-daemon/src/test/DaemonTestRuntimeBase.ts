// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  DAEMON_RUNTIME_DIR_ENV_VAR,
  computeDaemonWorkspaceKey,
  resolveDaemonPaths,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

// fs.mkdtempSync appends six characters to this prefix.
const BASE_PREFIX: string = 'rdt-';
const MKDTEMP_SUFFIX: string = 'XXXXXX';
// The largest 32-bit user ID: no user ID has more digits.
const WIDEST_UID: number = 0xffffffff;
// Where the product keeps its runtime folders when RUSHD_RUNTIME_DIR is not set.
const SHARED_POSIX_TEMP_DIR: string = '/tmp';
// The size of sockaddr_un.sun_path.
const LINUX_SUN_PATH_BYTES: number = 108;
const OTHER_SUN_PATH_BYTES: number = 104;

/**
 * The longest socket path, in bytes, that a test daemon may get on `platform`: the size of `sun_path` less
 * its terminating NUL.
 */
export function getMaxTestSocketPathBytes(platform: NodeJS.Platform): number {
  return (platform === 'linux' ? LINUX_SUN_PATH_BYTES : OTHER_SUN_PATH_BYTES) - 1;
}

/**
 * The longest socket path that a daemon can get in a folder that {@link createDaemonTestRuntimeBase} creates
 * in `root`: the one for the widest user ID.
 */
export function getLongestTestSocketPath(root: string, platform: NodeJS.Platform): string {
  const base: string = path.posix.join(root, `${BASE_PREFIX}${MKDTEMP_SUFFIX}`);
  const paths: IDaemonPaths = resolveDaemonPaths(
    { platform, env: { [DAEMON_RUNTIME_DIR_ENV_VAR]: base }, tmpdir: root, uid: WIDEST_UID },
    computeDaemonWorkspaceKey({ canonicalRepoRoot: root, rushVersion: '0.0.0' })
  );
  return paths.socketPath;
}

/**
 * The folder in which {@link createDaemonTestRuntimeBase} creates its folders: `tmpdir` if the longest
 * socket path in it is within the limit, and otherwise `/tmp`, where the product keeps its runtime folders
 * by default.
 * Windows daemons listen at named pipes, whose names do not depend on any folder.
 */
export function chooseTestRuntimeRoot(tmpdir: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') return tmpdir;
  const longestBytes: number = Buffer.byteLength(getLongestTestSocketPath(tmpdir, platform));
  return longestBytes <= getMaxTestSocketPathBytes(platform) ? tmpdir : SHARED_POSIX_TEMP_DIR;
}

/**
 * Creates an empty private folder for a test to pass to its daemons as `RUSHD_RUNTIME_DIR`, so that their
 * socket paths stay within the limit however long `TMPDIR` is. The caller deletes it.
 */
export function createDaemonTestRuntimeBase(): string {
  const root: string = chooseTestRuntimeRoot(path.resolve(os.tmpdir()), process.platform);
  return fs.mkdtempSync(path.join(root, BASE_PREFIX));
}
