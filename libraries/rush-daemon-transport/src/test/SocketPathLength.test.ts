// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonPaths } from '../DaemonPaths';
import { DAEMON_RUNTIME_DIR_ENV_VAR, resolveDaemonPaths } from '../DaemonPaths';
import { assertDaemonSocketPathFits, getMaxDaemonSocketPathBytes } from '../DaemonSocketPathLength';
import { DaemonTransportErrorCode } from '../DaemonTransportError';
import { WORKSPACE_KEY_LENGTH } from '../WorkspaceKey';

const UID: number = 9127721;
const KEY: string = `rushd-${'0'.repeat(WORKSPACE_KEY_LENGTH)}`;
// What a base gains on its way to the socket path: `/rushd-<uid>/rushd-<key>.sock`.
const SUFFIX_BYTES: number = Buffer.byteLength(`/rushd-${UID}/${KEY}.sock`);
const ONE: number = 1;
// Longer than the limit of every platform.
const LONG_NAME_BYTES: number = 160;
// 25 two-byte characters make a 51-byte base of only 26 characters, too long for Linux by one byte.
const TWO_BYTE_CHARACTER_COUNT: number = 25;
const TOO_LONG: object = { code: DaemonTransportErrorCode.socketPathTooLong };
const LINUX_LIMIT: number = 108;
const BSD_LIMIT: number = 104;
const LIMITS: readonly [NodeJS.Platform, number][] = [
  ['linux', LINUX_LIMIT],
  ['darwin', BSD_LIMIT],
  ['freebsd', BSD_LIMIT]
];

function resolvePaths(platform: NodeJS.Platform, base: string): IDaemonPaths {
  const env: Record<string, string> = { [DAEMON_RUNTIME_DIR_ENV_VAR]: base };
  return resolveDaemonPaths({ platform, env, tmpdir: '/tmp', uid: UID }, KEY);
}

function createBase(bytes: number): string {
  return `/${'a'.repeat(bytes - ONE)}`;
}

function captureMessage(paths: IDaemonPaths, platform: NodeJS.Platform): string {
  try {
    assertDaemonSocketPathFits(paths, platform);
  } catch (error) {
    expect(error).toMatchObject(TOO_LONG);
    return (error as Error).message;
  }
  return '';
}

it.each(LIMITS)(
  'allows a socket path of at most sun_path bytes on %s',
  (platform: NodeJS.Platform, limit: number) => {
    const maxBaseBytes: number = limit - SUFFIX_BYTES;
    const fits: IDaemonPaths = resolvePaths(platform, createBase(maxBaseBytes));
    expect(getMaxDaemonSocketPathBytes(platform)).toBe(limit);
    expect(Buffer.byteLength(fits.socketPath)).toBe(limit);
    expect(captureMessage(fits, platform)).toBe('');
    const tooLong: IDaemonPaths = resolvePaths(platform, createBase(maxBaseBytes + ONE));
    expect(captureMessage(tooLong, platform)).toBe(
      `The daemon socket path ${tooLong.socketPath} is ${limit + ONE} bytes long, but this platform allows at ` +
        `most ${limit}. Set ${DAEMON_RUNTIME_DIR_ENV_VAR} to an absolute path of at most ${maxBaseBytes} ` +
        'bytes, or unset it.'
    );
  }
);

it('counts bytes, not characters', () => {
  const paths: IDaemonPaths = resolvePaths('linux', `/${'é'.repeat(TWO_BYTE_CHARACTER_COUNT)}`);
  expect(captureMessage(paths, 'linux')).toContain('is 109 bytes long');
});

it('names no length to aim for when a runtime folder of another layout leaves no room', () => {
  const runtimeDir: string = createBase(LONG_NAME_BYTES);
  const paths: IDaemonPaths = { runtimeDir, socketPath: `${runtimeDir}/d.sock`, lockfilePath: '' };
  expect(captureMessage(paths, 'linux')).toMatch(
    /at most 108\. Use a shorter runtime folder, or unset RUSHD_/
  );
});

it('does not check a Windows named pipe', () => {
  const socketPath: string = `\\\\.\\pipe\\${'p'.repeat(LONG_NAME_BYTES)}`;
  expect(captureMessage({ runtimeDir: undefined, socketPath, lockfilePath: '' }, 'win32')).toBe('');
});
