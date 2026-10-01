// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import { getOperationGroupsFolder, writeOperationGroupRecord } from '../DaemonOperationGroups';
import { POSIX_PROCESS_GROUP_OPS } from '../DaemonProcessGroup';
import { readProcessStat } from '../DaemonProcessStat';
import type { IProcessStat } from '../DaemonProcessStat';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';
import type { IDaemonOrphanReap } from '../DaemonReclaimOptions';

import { OPERATION_GROUP, recordGroups, stat } from './OperationGroupFixture';
import { DEAD_PID, createFakeGroup } from './OrphanReaperFixture';
import type { IFakeGroup } from './OrphanReaperFixture';
import { waitUntilAsync } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';
import { isZombie, killUnreapedLeaders, startUnreapedLeaderAsync } from './UnreapedLeaderFixture';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
// Short, so that a group that never counts as gone fails its test within about a second.
const GRACE_MS: number = 500;
const TEST_TIMEOUT_MS: number = 30000;
// The real process table, in which daemon DEAD_PID is dead whatever this host runs under that pid.
const REAL_OPTIONS: IDaemonOrphanReaperOptions = {
  ops: { ...POSIX_PROCESS_GROUP_OPS, isProcessAlive: () => false },
  graceMs: GRACE_MS
};

let folders: string[] = [];
afterEach(() => {
  killUnreapedLeaders();
  for (const folder of folders) fs.rmSync(folder, { recursive: true, force: true });
  folders = [];
});

/** Records `leader` with its real start time for dead daemon DEAD_PID; returns the lockfile path. */
function recordLeader(leader: number): string {
  const { lockfilePath } = createTestDaemonPaths();
  const folder: string = getOperationGroupsFolder(lockfilePath, DEAD_PID);
  folders.push(folder);
  fs.mkdirSync(folder, { recursive: true });
  const { startTime } = readProcessStat(leader) as IProcessStat;
  writeOperationGroupRecord(folder, { groupId: leader, startTime });
  return lockfilePath;
}

linuxIt(
  'counts a group whose only member is a zombie as gone',
  async () => {
    const leader: number = await startUnreapedLeaderAsync();
    expect(POSIX_PROCESS_GROUP_OPS.groupExists(leader)).toBe(true);
    process.kill(leader, 'SIGKILL');
    expect(await waitUntilAsync(() => isZombie(leader))).toBe(true);
    expect(POSIX_PROCESS_GROUP_OPS.groupExists(leader)).toBe(false);
  },
  TEST_TIMEOUT_MS
);

async function stopsGroupLeftAsZombieAsync(): Promise<void> {
  const leader: number = await startUnreapedLeaderAsync();
  const lockfilePath: string = recordLeader(leader);
  const reaps: IDaemonOrphanReap[] = [];
  const options: IDaemonOrphanReaperOptions = {
    ...REAL_OPTIONS,
    onOrphansReaped: (reap: IDaemonOrphanReap) => reaps.push(reap)
  };
  const outcome: Promise<string> = reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, options);
  await expect(outcome).resolves.toBe('terminated');
  expect(isZombie(leader)).toBe(true);
  expect(reaps).toEqual([{ daemonPid: DEAD_PID, processGroupIds: [leader], outcome: 'terminated' }]);
  expect(fs.existsSync(getOperationGroupsFolder(lockfilePath, DEAD_PID))).toBe(false);
}

linuxIt('stops a group whose parent never reaps it', stopsGroupLeftAsZombieAsync, TEST_TIMEOUT_MS);

async function dropsZombieLeaderAsync(): Promise<void> {
  const leader: number = await startUnreapedLeaderAsync();
  const lockfilePath: string = recordLeader(leader);
  process.kill(leader, 'SIGKILL');
  expect(await waitUntilAsync(() => isZombie(leader))).toBe(true);
  const outcome: Promise<string> = reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, REAL_OPTIONS);
  await expect(outcome).resolves.toBe('none');
  expect(fs.existsSync(getOperationGroupsFolder(lockfilePath, DEAD_PID))).toBe(false);
}

linuxIt('drops the record of a leader that is already a zombie', dropsZombieLeaderAsync, TEST_TIMEOUT_MS);

it('never signals a recorded group whose leader is a zombie and that has no live member', async () => {
  const zombieLeader: IProcessStat = { ...stat(OPERATION_GROUP, OPERATION_GROUP), exited: true };
  const fake: IFakeGroup = createFakeGroup({ exitsOn: 'SIGTERM', processes: [zombieLeader] });
  const lockfilePath: string = recordGroups([OPERATION_GROUP]);
  const outcome: Promise<string> = reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, fake.options);
  await expect(outcome).resolves.toBe('none');
  expect(fake.signals).toEqual([]);
});
