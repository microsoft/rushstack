// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { getOperationGroupsFolder, readOperationGroupRecords } from '../DaemonOperationGroups';
import type { IDaemonPaths } from '../DaemonPaths';
import { reclaimStaleDaemonAsync } from '../DaemonReclaim';
import type { IDaemonOrphanReap } from '../DaemonReclaimOptions';

import { killFakeDaemonAsync, startFakeDaemonAsync } from './FakeOperationDaemonFixture';
import type { IFakeDaemon } from './FakeOperationDaemonFixture';
import { identifyStarted, isAlive, isGone, killStillRunning, waitUntilAsync } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const posixIt: jest.It = process.platform === 'linux' ? it : it.skip;
// Above the worst case of the reaper's SIGTERM and SIGKILL grace periods plus the polls below.
const REAP_TEST_TIMEOUT_MS: number = 30000;
const RECORDED_OPERATIONS: number = 2;

let started: IStartedProcess[] = [];
let folders: string[] = [];
afterEach(() => {
  // A failed assertion must not leave this test's processes or record folders behind.
  killStillRunning(started);
  for (const folder of folders) fs.rmSync(folder, { recursive: true, force: true });
  started = [];
  folders = [];
});

// A fake daemon records its operations, but no lockfile names it, as after an older `daemon stop --force`
// that removed the lockfile, without a reclaim, while the daemon's operations still ran.
async function startUnnamedDaemonAsync(paths: IDaemonPaths): Promise<[IFakeDaemon, string]> {
  const fake: IFakeDaemon = await startFakeDaemonAsync(paths);
  started = identifyStarted([Number(fake.daemon.pid), ...fake.pids]);
  const folder: string = getOperationGroupsFolder(paths.lockfilePath, Number(fake.daemon.pid));
  folders.push(folder);
  return [fake, folder];
}

async function reapsStrandedGroupsAsync(): Promise<void> {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const [fake, folder] = await startUnnamedDaemonAsync(paths);
  const [waitingLeader, , exitingLeader] = fake.pids;
  await killFakeDaemonAsync(fake);
  expect(await waitUntilAsync(() => isGone(exitingLeader))).toBe(true);
  const reaps: IDaemonOrphanReap[] = [];
  await reclaimStaleDaemonAsync(paths, { onOrphansReaped: (reap: IDaemonOrphanReap) => reaps.push(reap) });
  expect(await waitUntilAsync(() => !fake.pids.some(isAlive))).toBe(true);
  expect(fs.existsSync(folder)).toBe(false);
  expect(reaps).toEqual([
    { daemonPid: Number(fake.daemon.pid), processGroupIds: expect.any(Array), outcome: 'terminated' }
  ]);
  const [{ processGroupIds }] = reaps;
  expect(new Set(processGroupIds)).toEqual(new Set([waitingLeader, exitingLeader]));
}

posixIt(
  'reaps the operation groups of a dead daemon that no lockfile names',
  reapsStrandedGroupsAsync,
  REAP_TEST_TIMEOUT_MS
);

async function leavesLiveDaemonGroupsAsync(): Promise<void> {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const [fake, folder] = await startUnnamedDaemonAsync(paths);
  await reclaimStaleDaemonAsync(paths);
  expect(fake.pids.every(isAlive)).toBe(true);
  expect(readOperationGroupRecords(folder)).toHaveLength(RECORDED_OPERATIONS);
}

posixIt(
  'leaves the operation groups of a live daemon that no lockfile names',
  leavesLiveDaemonGroupsAsync,
  REAP_TEST_TIMEOUT_MS
);
