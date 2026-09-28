// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import { DaemonFrameListener } from '../DaemonListener';
import type { IDaemonPaths } from '../DaemonPaths';
import { DAEMON_RUNTIME_DIR_ENV_VAR } from '../DaemonPaths';
import { reclaimStaleDaemonAsync } from '../DaemonReclaim';
import { assertDaemonRuntimeDirIsPrivate, ensureDaemonRuntimeDir } from '../DaemonRuntimeDir';
import { verifyRuntimeFolder } from '../DaemonRuntimeFolderCheck';
import { DaemonTransportErrorCode } from '../DaemonTransportError';

import { createIsolatedTestDaemonPaths, removeIsolatedBase } from './TestDaemonFixture';

// Windows has no runtime folder: its named pipes live in the kernel's pipe namespace.
const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;
const PRIVATE_MODE: number = 0o700;
const OPEN_MODE: number = 0o755;
const PERMISSION_MODULUS: number = 0o1000;
const NO_UID: number = 0;
const OTHER_USER_OFFSET: number = 1;
const LINK_TARGET_SUFFIX: string = '.target';

type Planter = (folder: string) => void;

const PLANTERS: readonly [string, Planter][] = [
  [
    'it is a symbolic link',
    (folder: string) => {
      fs.mkdirSync(`${folder}${LINK_TARGET_SUFFIX}`, { mode: PRIVATE_MODE });
      fs.symlinkSync(`${folder}${LINK_TARGET_SUFFIX}`, folder);
    }
  ],
  ['it is not a directory', (folder: string) => fs.writeFileSync(folder, '')]
];

function getMode(folder: string): number {
  return fs.statSync(folder).mode % PERMISSION_MODULUS;
}

function getOtherUid(): number {
  return (process.getuid?.() ?? NO_UID) + OTHER_USER_OFFSET;
}

function captureError(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
}

posixIt('creates the runtime folder owner-only, and tightens one that others can enter', () => {
  const paths: IDaemonPaths = createIsolatedTestDaemonPaths();
  const folder: string = paths.runtimeDir ?? '';
  ensureDaemonRuntimeDir(paths);
  expect(getMode(folder)).toBe(PRIVATE_MODE);
  fs.chmodSync(folder, OPEN_MODE);
  assertDaemonRuntimeDirIsPrivate(paths);
  expect(getMode(folder)).toBe(PRIVATE_MODE);
  removeIsolatedBase(paths);
});

posixIt.each(PLANTERS)('refuses a runtime folder when %s', async (reason: string, plant: Planter) => {
  const paths: IDaemonPaths = createIsolatedTestDaemonPaths();
  plant(paths.runtimeDir ?? '');
  const expected: object = {
    code: DaemonTransportErrorCode.unsafeRuntimeDirectory,
    message: expect.stringContaining(reason)
  };
  const error: unknown = captureError(() => assertDaemonRuntimeDirIsPrivate(paths));
  expect(error).toMatchObject(expected);
  expect((error as Error).message).toContain(DAEMON_RUNTIME_DIR_ENV_VAR);
  expect(captureError(() => ensureDaemonRuntimeDir(paths))).toMatchObject(expected);
  await expect(reclaimStaleDaemonAsync(paths)).rejects.toMatchObject(expected);
  const listening: Promise<DaemonFrameListener> = DaemonFrameListener.listenAsync(paths, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    onConnection: () => undefined
  });
  await expect(listening).rejects.toMatchObject(expected);
  removeIsolatedBase(paths);
});

posixIt('refuses a runtime folder of another user without changing it', () => {
  const paths: IDaemonPaths = createIsolatedTestDaemonPaths();
  const folder: string = paths.runtimeDir ?? '';
  fs.mkdirSync(folder, { mode: OPEN_MODE });
  fs.chmodSync(folder, OPEN_MODE);
  expect(captureError(() => verifyRuntimeFolder(folder, getOtherUid()))).toMatchObject({
    code: DaemonTransportErrorCode.unsafeRuntimeDirectory,
    message: expect.stringContaining('another user owns it')
  });
  expect(getMode(folder)).toBe(OPEN_MODE);
  removeIsolatedBase(paths);
});
