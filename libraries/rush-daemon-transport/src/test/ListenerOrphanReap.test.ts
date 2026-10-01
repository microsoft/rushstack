// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import { DaemonFrameListener } from '../DaemonListener';
import type { IDaemonPaths } from '../DaemonPaths';
import type { IDaemonOrphanReap, IDaemonReclaimOptions } from '../DaemonReclaimOptions';

import {
  killFakeDaemonAsync,
  startFakeDaemonAsync,
  writeDeadOwnerLockfile
} from './FakeOperationDaemonFixture';
import type { IFakeDaemon } from './FakeOperationDaemonFixture';
import { identifyStarted, isAlive, killStillRunning, waitUntilAsync } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
// Above the worst case of a 5 s poll plus the reaper's SIGTERM and SIGKILL grace periods, so that a
// regression fails an assertion instead of timing out.
const REAP_TEST_TIMEOUT_MS: number = 30000;
const STALE_SOCKET: string = 'stale';
const WARNING_CODE: { code: string } = { code: 'RUSH_DAEMON_ORPHANS_REAPED' };

let started: IStartedProcess[] = [];
afterEach(() => {
  // A failed assertion must not leave this test's processes running.
  killStillRunning(started);
  started = [];
  jest.restoreAllMocks();
});

/** Leaves what a SIGKILLed daemon leaves behind: its operations, its lockfile and its socket. */
async function crashFakeDaemonAsync(paths: IDaemonPaths): Promise<IFakeDaemon> {
  const fake: IFakeDaemon = await startFakeDaemonAsync(paths);
  started = identifyStarted([Number(fake.daemon.pid), ...fake.pids]);
  await killFakeDaemonAsync(fake);
  writeDeadOwnerLockfile(paths, fake);
  fs.writeFileSync(paths.socketPath, STALE_SOCKET);
  return fake;
}

/** Binds a listener at the crashed daemon's socket path, which reclaims it, and closes the listener again. */
async function listenOverCrashAsync(
  paths: IDaemonPaths,
  fake: IFakeDaemon,
  options: IDaemonReclaimOptions
): Promise<void> {
  const listener: DaemonFrameListener = await DaemonFrameListener.listenAsync(paths, {
    ...options,
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    onConnection: () => undefined
  });
  await listener.closeAsync();
  expect(await waitUntilAsync(() => !fake.pids.some(isAlive))).toBe(true);
}

async function reportsReapsToListenerOptionAsync(): Promise<void> {
  const warning: jest.SpyInstance = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
  const paths: IDaemonPaths = createTestDaemonPaths();
  const fake: IFakeDaemon = await crashFakeDaemonAsync(paths);
  const reaps: IDaemonOrphanReap[] = [];
  await listenOverCrashAsync(paths, fake, { onOrphansReaped: (reap: IDaemonOrphanReap) => reaps.push(reap) });
  const [waitingLeader, , exitingLeader] = fake.pids;
  expect(reaps).toEqual([
    { daemonPid: Number(fake.daemon.pid), processGroupIds: expect.any(Array), outcome: 'terminated' }
  ]);
  const [{ processGroupIds }] = reaps;
  expect(new Set(processGroupIds)).toEqual(new Set([waitingLeader, exitingLeader]));
  expect(warning).not.toHaveBeenCalled();
}

linuxIt(
  "reports the operations it stops while reclaiming a dead daemon's socket to onOrphansReaped",
  reportsReapsToListenerOptionAsync,
  REAP_TEST_TIMEOUT_MS
);

async function warnsWithoutListenerOptionAsync(): Promise<void> {
  const warning: jest.SpyInstance = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
  const paths: IDaemonPaths = createTestDaemonPaths();
  const fake: IFakeDaemon = await crashFakeDaemonAsync(paths);
  await listenOverCrashAsync(paths, fake, {});
  const [waitingLeader, , exitingLeader] = fake.pids;
  expect(warning).toHaveBeenCalledWith(expect.stringContaining(`${waitingLeader}`), WARNING_CODE);
  expect(warning).toHaveBeenCalledWith(expect.stringContaining(`${exitingLeader}`), WARNING_CODE);
}

linuxIt(
  'reports them as a process warning without onOrphansReaped',
  warnsWithoutListenerOptionAsync,
  REAP_TEST_TIMEOUT_MS
);
