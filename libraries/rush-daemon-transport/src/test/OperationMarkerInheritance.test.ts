// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getOperationGroupsMarker } from '../DaemonOperationGroupMarker';
import { getOperationGroupsFolder } from '../DaemonOperationGroups';
import type { IDaemonPaths } from '../DaemonPaths';
import { hasEnvironmentEntry } from '../DaemonProcessStat';

import { killFakeDaemonAsync, startFakeDaemonAsync } from './FakeOperationDaemonFixture';
import type { IFakeDaemon } from './FakeOperationDaemonFixture';
import { identifyStarted, killStillRunning } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;

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
    expect(fake.pids.map((pid: number) => hasEnvironmentEntry(pid, marker))).toEqual(
      fake.pids.map(() => true)
    );
    expect(fake.pids.some((pid: number) => hasEnvironmentEntry(pid, otherMarker))).toBe(false);
    await killFakeDaemonAsync(fake);
  }
);
