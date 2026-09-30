// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PhasedCommandEngineBusyError } from '@microsoft/rush-lib';
import { LockFile } from '@rushstack/node-core-library';

import { isNativeLockHeldByThisProcess, tryAcquireNativeLock } from '../NativeRepositoryLock';

// On Windows, the lock file does not name its process, so this process cannot tell that it holds the lock.
const unixIt: typeof it = process.platform === 'win32' ? it.skip : it;
const TEST_FOLDER: string = path.resolve(__dirname, '../../temp/test/native-repository-lock');

function createLockFolder(name: string): string {
  const folder: string = path.join(TEST_FOLDER, name);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

/** Starts another process, which holds Rush's repository lock in `folder` until its stdin ends. */
async function holdInAnotherProcessAsync(folder: string): Promise<ChildProcess> {
  const script: string = [
    `const { LockFile } = require(${JSON.stringify(require.resolve('@rushstack/node-core-library'))});`,
    `const lock = LockFile.tryAcquire(${JSON.stringify(folder)}, 'rush');`,
    "process.stdout.write(lock ? 'held' : 'busy');",
    'process.stdin.resume();',
    "process.stdin.on('end', () => { lock?.release(); process.exit(0); });"
  ].join('\n');
  const holder: ChildProcess = spawn(process.execPath, ['-e', script], {
    stdio: ['pipe', 'pipe', 'inherit']
  });
  const [output] = await once(holder.stdout!, 'data');
  expect(String(output)).toBe('held');
  return holder;
}

async function stopAsync(holder: ChildProcess): Promise<void> {
  const closed: Promise<unknown[]> = once(holder, 'close');
  holder.stdin!.end();
  await closed;
}

describe(tryAcquireNativeLock.name, () => {
  it('takes the lock when no Rush process holds it', () => {
    const folder: string = createLockFolder('free');
    const lock: LockFile | undefined = tryAcquireNativeLock(folder);
    expect(lock).toBeInstanceOf(LockFile);
    lock?.release();
  });

  it('takes nothing while another Rush process holds the lock, so that the request can wait for it', async () => {
    const folder: string = createLockFolder('another-process');
    const holder: ChildProcess = await holdInAnotherProcessAsync(folder);
    try {
      expect(tryAcquireNativeLock(folder)).toBeUndefined();
      expect(isNativeLockHeldByThisProcess(folder)).toBe(false);
    } finally {
      await stopAsync(holder);
    }
    const lock: LockFile | undefined = tryAcquireNativeLock(folder);
    expect(lock).toBeInstanceOf(LockFile);
    lock?.release();
  });

  unixIt('fails at once when this process holds the lock already, since waiting for it would not end', () => {
    const folder: string = createLockFolder('this-process');
    const lock: LockFile | undefined = tryAcquireNativeLock(folder);
    expect(lock).toBeInstanceOf(LockFile);
    try {
      expect(isNativeLockHeldByThisProcess(folder)).toBe(true);
      expect(() => tryAcquireNativeLock(folder)).toThrow(PhasedCommandEngineBusyError);
    } finally {
      lock?.release();
    }
    expect(isNativeLockHeldByThisProcess(folder)).toBe(false);
  });
});
