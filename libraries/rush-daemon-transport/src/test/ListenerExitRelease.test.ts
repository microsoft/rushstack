// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import { DaemonFrameListener } from '../DaemonListener';
import { readDaemonLockfile } from '../DaemonLockfile';
import { getOperationGroupsFolder, readOperationGroupRecords } from '../DaemonOperationGroups';
import type { IDaemonPaths } from '../DaemonPaths';

import { identifyStarted, killStillRunning, waitUntilAsync } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;
const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
const SLEEP_ARGS: string[] = ['-e', 'setTimeout(() => {}, 30000)'];
// SubprocessTerminator.RECOMMENDED_OPTIONS on POSIX, which gives the operation a group of its own.
const DETACHED: SpawnOptions = { detached: true, stdio: 'ignore' };
const NO_RECORDS: number = 0;

let started: IStartedProcess[] = [];
afterEach(() => {
  killStillRunning(started);
  started = [];
});

function listenAsync(paths: IDaemonPaths): Promise<DaemonFrameListener> {
  return DaemonFrameListener.listenAsync(paths, {
    onConnection: () => undefined,
    protocolVersion: DAEMON_PROTOCOL_VERSION
  });
}

function countRecords(paths: IDaemonPaths): number {
  return readOperationGroupRecords(getOperationGroupsFolder(paths.lockfilePath, process.pid)).length;
}

it('releases the lockfile for exit when the daemon has no children', async () => {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const listener: DaemonFrameListener = await listenAsync(paths);
  try {
    expect(listener.releaseForExit()).toBe(true);
    expect(readDaemonLockfile(paths.lockfilePath)).toBeUndefined();
  } finally {
    await listener.closeAsync();
  }
});

posixIt('releases the socket for exit, and a later close leaves a successor alone', async () => {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const released: DaemonFrameListener = await listenAsync(paths);
  expect(released.releaseForExit()).toBe(true);
  expect(fs.existsSync(paths.socketPath)).toBe(false);
  const successor: DaemonFrameListener = await listenAsync(paths);
  try {
    await released.closeAsync();
    expect(readDaemonLockfile(paths.lockfilePath)?.pid).toBe(process.pid);
    expect(fs.existsSync(paths.socketPath)).toBe(true);
  } finally {
    await successor.closeAsync();
  }
  expect(readDaemonLockfile(paths.lockfilePath)).toBeUndefined();
  expect(fs.existsSync(paths.socketPath)).toBe(false);
});

linuxIt('keeps the socket and the lockfile for a successor while a recorded operation runs', async () => {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const listener: DaemonFrameListener = await listenAsync(paths);
  try {
    const operation: ChildProcess = spawn(process.execPath, SLEEP_ARGS, DETACHED);
    await once(operation, 'spawn');
    started = identifyStarted([Number(operation.pid)]);
    expect(await waitUntilAsync(() => countRecords(paths) > NO_RECORDS)).toBe(true);
    expect(listener.releaseForExit()).toBe(false);
    expect(readDaemonLockfile(paths.lockfilePath)?.pid).toBe(process.pid);
    expect(fs.existsSync(paths.socketPath)).toBe(true);
    operation.kill('SIGKILL');
    expect(await waitUntilAsync(() => countRecords(paths) === NO_RECORDS)).toBe(true);
    expect(listener.releaseForExit()).toBe(true);
    expect(readDaemonLockfile(paths.lockfilePath)).toBeUndefined();
  } finally {
    await listener.closeAsync();
  }
});
