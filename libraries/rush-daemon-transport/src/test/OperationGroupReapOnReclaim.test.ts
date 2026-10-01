// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getOperationGroupsFolder, readOperationGroupRecords } from '../DaemonOperationGroups';
import type { IOperationGroupRecord } from '../DaemonOperationGroups';
import type { IDaemonPaths } from '../DaemonPaths';
import { reclaimStaleDaemonAsync } from '../DaemonReclaim';
import type { IDaemonOrphanReap } from '../DaemonReclaimOptions';

import {
  killFakeDaemonAsync,
  startFakeDaemonAsync,
  writeDeadOwnerLockfile
} from './FakeOperationDaemonFixture';
import type { IFakeDaemon } from './FakeOperationDaemonFixture';
import { identifyStarted, isAlive, isGone, killStillRunning, waitUntilAsync } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const posixIt: jest.It = process.platform === 'linux' ? it : it.skip;
// Above the worst case of two 5 s polls plus the reaper's SIGTERM and SIGKILL grace periods, so that a
// regression fails an assertion instead of timing out.
const REAP_TEST_TIMEOUT_MS: number = 30000;

function recordedGroupIds(folder: string): Set<number> {
  return new Set(readOperationGroupRecords(folder).map((record: IOperationGroupRecord) => record.groupId));
}

let started: IStartedProcess[] = [];
afterEach(() => {
  // A failed assertion must not leave this test's processes running.
  killStillRunning(started);
  started = [];
  jest.restoreAllMocks();
});

async function reapsOrphanedOperationGroupsAsync(): Promise<void> {
  const warning: jest.SpyInstance = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
  const paths: IDaemonPaths = createTestDaemonPaths();
  const fake: IFakeDaemon = await startFakeDaemonAsync(paths);
  started = identifyStarted([Number(fake.daemon.pid), ...fake.pids]);
  const [waitingLeader, , exitingLeader] = fake.pids;
  const folder: string = getOperationGroupsFolder(paths.lockfilePath, Number(fake.daemon.pid));
  expect(recordedGroupIds(folder)).toEqual(new Set([waitingLeader, exitingLeader]));
  await killFakeDaemonAsync(fake);
  // Reaped, not merely a zombie, so reclaim finds a group without its leader.
  expect(await waitUntilAsync(() => isGone(exitingLeader))).toBe(true);
  writeDeadOwnerLockfile(paths, fake);
  await reclaimStaleDaemonAsync(paths);
  expect(await waitUntilAsync(() => !fake.pids.some(isAlive))).toBe(true);
  expect(readOperationGroupRecords(folder)).toEqual([]);
  expect(warning).toHaveBeenCalledWith(expect.stringContaining(`${waitingLeader}`), expect.anything());
  expect(warning).toHaveBeenCalledWith(expect.stringContaining(`${exitingLeader}`), expect.anything());
}

posixIt(
  'reaps detached operation groups orphaned by a SIGKILLed daemon, with or without their leader',
  reapsOrphanedOperationGroupsAsync,
  REAP_TEST_TIMEOUT_MS
);

async function reportsReapedOperationGroupsAsync(): Promise<void> {
  const warning: jest.SpyInstance = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
  const paths: IDaemonPaths = createTestDaemonPaths();
  const fake: IFakeDaemon = await startFakeDaemonAsync(paths);
  started = identifyStarted([Number(fake.daemon.pid), ...fake.pids]);
  const [waitingLeader, , exitingLeader] = fake.pids;
  await killFakeDaemonAsync(fake);
  expect(await waitUntilAsync(() => isGone(exitingLeader))).toBe(true);
  writeDeadOwnerLockfile(paths, fake);
  const reaps: IDaemonOrphanReap[] = [];
  await reclaimStaleDaemonAsync(paths, { onOrphansReaped: (reap: IDaemonOrphanReap) => reaps.push(reap) });
  expect(await waitUntilAsync(() => !fake.pids.some(isAlive))).toBe(true);
  const operations: IDaemonOrphanReap[] = reaps.filter((reap: IDaemonOrphanReap) =>
    reap.processGroupIds.includes(waitingLeader)
  );
  expect(operations).toEqual([
    { daemonPid: Number(fake.daemon.pid), processGroupIds: expect.any(Array), outcome: 'terminated' }
  ]);
  const [{ processGroupIds }] = operations;
  expect(new Set(processGroupIds)).toEqual(new Set([waitingLeader, exitingLeader]));
  expect(warning).not.toHaveBeenCalled();
}

posixIt(
  'reports the reaped operation groups to onOrphansReaped instead of logging them',
  reportsReapedOperationGroupsAsync,
  REAP_TEST_TIMEOUT_MS
);
