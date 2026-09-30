// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { LockFile } from '@rushstack/node-core-library';
import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import { isStartupLockFilePresent, tryAcquireStartupLockAsync, type IStartupLock } from '../StartupLock';
import { removeTestFolderAsync } from './TestProcessExit';

it('holds startup exclusively until the owning lock is released', async () => {
  const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-start-lock-'));
  const paths: IDaemonPaths = {
    lockfilePath: path.join(folder, 'daemon.pid.json'),
    socketPath:
      process.platform === 'win32'
        ? `\\\\.\\pipe\\${path.basename(folder)}`
        : path.join(folder, 'daemon.sock')
  };
  let lock: IStartupLock | undefined = await tryAcquireStartupLockAsync(paths);
  try {
    expect(lock).toBeDefined();
    expect(await tryAcquireStartupLockAsync(paths)).toBeUndefined();
    await lock!.releaseAsync();
    lock = undefined;
    lock = await tryAcquireStartupLockAsync(paths);
    expect(lock).toBeDefined();
  } finally {
    await lock?.releaseAsync();
    await removeTestFolderAsync(folder);
  }
});

it('reports a start mutex lock file without acquiring the mutex', async () => {
  const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-start-lock-'));
  const paths: IDaemonPaths = {
    lockfilePath: path.join(folder, 'daemon.pid.json'),
    socketPath:
      process.platform === 'win32'
        ? `\\\\.\\pipe\\${path.basename(folder)}`
        : path.join(folder, 'daemon.sock')
  };
  let lock: IStartupLock | undefined;
  try {
    expect(isStartupLockFilePresent(paths)).toBe(false);
    // Lock files of other resources in the same folder don't count.
    fs.writeFileSync(path.join(folder, 'daemon.pid.json#1.lock'), '');
    fs.writeFileSync(path.join(folder, 'other.pid.json-start#1.lock'), '');
    expect(isStartupLockFilePresent(paths)).toBe(false);
    lock = await tryAcquireStartupLockAsync(paths);
    expect(lock).toBeDefined();
    expect(isStartupLockFilePresent(paths)).toBe(true);
    await lock!.releaseAsync();
    lock = undefined;
    expect(isStartupLockFilePresent(paths)).toBe(false);
    expect(
      isStartupLockFilePresent({ ...paths, lockfilePath: path.join(folder, 'missing', 'daemon.pid.json') })
    ).toBe(false);
  } finally {
    await lock?.releaseAsync();
    await removeTestFolderAsync(folder);
  }
});

it('reports a start mutex lock file with the name that LockFile gives it on Windows', async () => {
  const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-start-lock-'));
  const paths: IDaemonPaths = {
    lockfilePath: path.join(folder, 'daemon.pid.json'),
    socketPath:
      process.platform === 'win32'
        ? `\\\\.\\pipe\\${path.basename(folder)}`
        : path.join(folder, 'daemon.sock')
  };
  const windowsLockPath: string = getWindowsLockFilePath(folder, 'daemon.pid.json-start');
  try {
    expect(path.basename(windowsLockPath)).toBe('daemon.pid.json-start.lock');
    // Names that only begin like it don't count.
    fs.writeFileSync(path.join(folder, 'daemon.pid.json-starter.lock'), '');
    fs.writeFileSync(`${windowsLockPath}.tmp`, '');
    expect(isStartupLockFilePresent(paths)).toBe(false);
    fs.writeFileSync(windowsLockPath, '');
    expect(isStartupLockFilePresent(paths)).toBe(true);
  } finally {
    await removeTestFolderAsync(folder);
  }
});

/** The lock file that `LockFile` names without a PID, as it does on Windows. */
function getWindowsLockFilePath(folder: string, resourceName: string): string {
  const platform: PropertyDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  try {
    return LockFile.getLockFilePath(folder, resourceName);
  } finally {
    Object.defineProperty(process, 'platform', platform);
  }
}
