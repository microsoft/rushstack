// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonPathEnvironment } from '../DaemonPaths';
import { resolveDaemonPaths } from '../DaemonPaths';

const TEST_UID: number = 1000;
const KEY: string = 'rushd-deadbeef';

function posixEnv(env: Readonly<Record<string, string>>): IDaemonPathEnvironment {
  return { platform: 'linux', env, tmpdir: '/tmp', uid: TEST_UID };
}

it('uses XDG_RUNTIME_DIR on POSIX when set', () => {
  const paths: ReturnType<typeof resolveDaemonPaths> = resolveDaemonPaths(
    posixEnv({ XDG_RUNTIME_DIR: '/run/user/1000' }),
    KEY
  );
  expect(paths.socketPath).toBe('/run/user/1000/rushd-1000/rushd-deadbeef.sock');
  expect(paths.lockfilePath).toBe('/run/user/1000/rushd-1000/rushd-deadbeef.pid.json');
});

it('falls back to the temp dir on POSIX without XDG_RUNTIME_DIR', () => {
  const paths: ReturnType<typeof resolveDaemonPaths> = resolveDaemonPaths(posixEnv({}), KEY);
  expect(paths.socketPath).toBe('/tmp/rushd-1000/rushd-deadbeef.sock');
});

it('uses a named pipe on Windows', () => {
  const paths: ReturnType<typeof resolveDaemonPaths> = resolveDaemonPaths(
    { platform: 'win32', env: {}, tmpdir: 'C:\\Users\\u\\AppData\\Local\\Temp', uid: undefined },
    KEY
  );
  expect(paths.socketPath).toBe('\\\\.\\pipe\\rushd-deadbeef');
  expect(paths.runtimeDir).toBeUndefined();
  expect(paths.lockfilePath).toContain('rushd-deadbeef.pid.json');
});

it('derives distinct paths for distinct keys', () => {
  const first: ReturnType<typeof resolveDaemonPaths> = resolveDaemonPaths(posixEnv({}), KEY);
  const second: ReturnType<typeof resolveDaemonPaths> = resolveDaemonPaths(posixEnv({}), 'rushd-00000000');
  expect(first.socketPath).not.toBe(second.socketPath);
});
