// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import { DaemonFrameListener } from '../DaemonListener';
import type { IDaemonPaths } from '../DaemonPaths';
import { DAEMON_RUNTIME_DIR_ENV_VAR, resolveDaemonPaths } from '../DaemonPaths';
import { reclaimStaleDaemonAsync } from '../DaemonReclaim';
import { assertDaemonRuntimeDirIsPrivate, ensureDaemonRuntimeDir } from '../DaemonRuntimeDir';
import { DaemonTransportErrorCode } from '../DaemonTransportError';

import { createIsolatedTestDaemonPaths, removeIsolatedBase } from './TestDaemonFixture';

// Windows has no runtime folder: its named pipes live in the kernel's pipe namespace.
const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;
// Longer than the limit of every platform, before the runtime folder and socket name are added.
const LONG_NAME_BYTES: number = 110;
const TOO_LONG: object = {
  code: DaemonTransportErrorCode.socketPathTooLong,
  message: expect.stringContaining(DAEMON_RUNTIME_DIR_ENV_VAR)
};

function captureError(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
}

posixIt('refuses a long socket path before it creates, checks, reclaims or binds anything', async () => {
  const isolated: IDaemonPaths = createIsolatedTestDaemonPaths();
  const base: string = path.join(path.dirname(isolated.runtimeDir ?? ''), 'b'.repeat(LONG_NAME_BYTES));
  const env: Record<string, string> = { [DAEMON_RUNTIME_DIR_ENV_VAR]: base };
  const paths: IDaemonPaths = resolveDaemonPaths(
    { platform: process.platform, env, tmpdir: os.tmpdir(), uid: process.getuid?.() },
    'rushd-long'
  );
  expect(captureError(() => assertDaemonRuntimeDirIsPrivate(paths))).toMatchObject(TOO_LONG);
  expect(captureError(() => ensureDaemonRuntimeDir(paths))).toMatchObject(TOO_LONG);
  await expect(reclaimStaleDaemonAsync(paths)).rejects.toMatchObject(TOO_LONG);
  const listening: Promise<DaemonFrameListener> = DaemonFrameListener.listenAsync(paths, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    onConnection: () => undefined
  });
  await expect(listening).rejects.toMatchObject(TOO_LONG);
  expect(fs.existsSync(base)).toBe(false);
  removeIsolatedBase(isolated);
});
