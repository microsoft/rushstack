// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonPathEnvironment, IDaemonPaths } from '../DaemonPaths';
import { resolveDaemonPaths } from '../DaemonPaths';

const TEST_UID: number = 1000;
const KEY: string = 'rushd-deadbeef';
const IGNORED_VALUES: readonly string[] = ['', 'relative/folder'];

function posixEnv(env: Readonly<Record<string, string>>): IDaemonPathEnvironment {
  return { platform: 'linux', env, tmpdir: '/var/tmp/per-session', uid: TEST_UID };
}

it('meets in /tmp on POSIX, whatever TMPDIR and XDG_RUNTIME_DIR say', () => {
  const plain: IDaemonPaths = resolveDaemonPaths(posixEnv({}), KEY);
  expect(plain.socketPath).toBe('/tmp/rushd-1000/rushd-deadbeef.sock');
  expect(plain.lockfilePath).toBe('/tmp/rushd-1000/rushd-deadbeef.pid.json');
  const session: IDaemonPathEnvironment = posixEnv({ XDG_RUNTIME_DIR: '/run/user/1000', TMPDIR: '/scratch' });
  expect(resolveDaemonPaths(session, KEY)).toEqual(plain);
});

it('moves the runtime directory to an absolute RUSHD_RUNTIME_DIR', () => {
  const paths: IDaemonPaths = resolveDaemonPaths(posixEnv({ RUSHD_RUNTIME_DIR: '/run/rush' }), KEY);
  expect(paths.runtimeDir).toBe('/run/rush/rushd-1000');
  expect(paths.socketPath).toBe('/run/rush/rushd-1000/rushd-deadbeef.sock');
});

it.each(IGNORED_VALUES)('ignores RUSHD_RUNTIME_DIR=%j, which is not an absolute path', (value: string) => {
  const paths: IDaemonPaths = resolveDaemonPaths(posixEnv({ RUSHD_RUNTIME_DIR: value }), KEY);
  expect(paths.runtimeDir).toBe('/tmp/rushd-1000');
});

it('uses a named pipe on Windows', () => {
  const paths: IDaemonPaths = resolveDaemonPaths(
    { platform: 'win32', env: {}, tmpdir: 'C:\\Users\\u\\AppData\\Local\\Temp', uid: undefined },
    KEY
  );
  expect(paths.socketPath).toBe('\\\\.\\pipe\\rushd-deadbeef');
  expect(paths.runtimeDir).toBeUndefined();
  expect(paths.lockfilePath).toContain('rushd-deadbeef.pid.json');
});

it('derives distinct paths for distinct keys', () => {
  const first: IDaemonPaths = resolveDaemonPaths(posixEnv({}), KEY);
  const second: IDaemonPaths = resolveDaemonPaths(posixEnv({}), 'rushd-00000000');
  expect(first.socketPath).not.toBe(second.socketPath);
});
