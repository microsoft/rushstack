// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getOperationGroupsMarker } from '../DaemonOperationGroupMarker';
import { getOperationGroupsFolder } from '../DaemonOperationGroups';
import type { IDaemonPaths } from '../DaemonPaths';
import { hasEnvironmentEntry } from '../DaemonProcessStat';

import { killFakeDaemonAsync, startFakeDaemonAsync } from './FakeOperationDaemonFixture';
import type { IFakeDaemon } from './FakeOperationDaemonFixture';
import { identifyStarted, killStillRunning, waitUntilAsync } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
// Enough for the 5 s wait for the marker, so a failure shows which process lacks it.
const TEST_TIMEOUT_MS: number = 15000;

let started: IStartedProcess[] = [];
afterEach(() => {
  // The fake daemon's operations outlive it.
  killStillRunning(started);
  started = [];
});

linuxIt(
  'gives the operations of a recording daemon, and their children, the marker of its records',
  async () => {
    const paths: IDaemonPaths = createTestDaemonPaths();
    const fake: IFakeDaemon = await startFakeDaemonAsync(paths);
    const daemonPid: number = Number(fake.daemon.pid);
    started = identifyStarted([daemonPid, ...fake.pids]);
    const marker: string = getOperationGroupsMarker(getOperationGroupsFolder(paths.lockfilePath, daemonPid));
    const otherMarker: string = getOperationGroupsMarker(
      getOperationGroupsFolder(paths.lockfilePath, process.pid)
    );
    const hasMarker = (pid: number): boolean => hasEnvironmentEntry(pid, marker);
    // A grandchild can still be in exec, before /proc shows its environment.
    await waitUntilAsync(() => fake.pids.every(hasMarker));
    expect(fake.pids.map(hasMarker)).toEqual(fake.pids.map(() => true));
    expect(fake.pids.some((pid: number) => hasEnvironmentEntry(pid, otherMarker))).toBe(false);
    await killFakeDaemonAsync(fake);
  },
  TEST_TIMEOUT_MS
);
