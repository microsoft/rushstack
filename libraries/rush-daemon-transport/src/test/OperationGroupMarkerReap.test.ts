// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import type { Readable } from 'node:stream';

import { DAEMON_OPERATION_GROUPS_ENV_VAR } from '../DaemonOperationGroupMarker';
import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import { getOperationGroupsFolder, writeOperationGroupRecord } from '../DaemonOperationGroups';
import { POSIX_PROCESS_GROUP_OPS } from '../DaemonProcessGroup';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';

import { RECORDED_START } from './OperationGroupFixture';
import { DEAD_PID } from './OrphanReaperFixture';
import { identifyStarted, isAlive, isGone, killStillRunning, waitUntilAsync } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
// A detached shell leads a new session and group, starts a member in them, prints its pid and exits, which
// leaves the group without its leader, as an operation whose shell has exited does.
const LEADERLESS_SCRIPT: string = 'sleep 600 </dev/null >/dev/null 2>&1 & echo $!';
const SHELL_OPTIONS: { detached: true; stdio: ['ignore', 'pipe', 'ignore'] } = {
  detached: true,
  stdio: ['ignore', 'pipe', 'ignore']
};
const GRACE_MS: number = 500;
const OTHER_WORKSPACE_SUFFIX: string = '.other';
const OPTIONS: IDaemonOrphanReaperOptions = {
  ops: { ...POSIX_PROCESS_GROUP_OPS, isProcessAlive: () => false, log: () => undefined },
  graceMs: GRACE_MS
};

interface ILeaderlessGroup {
  readonly groupId: number;
  readonly member: number;
}

let started: IStartedProcess[] = [];
afterEach(() => {
  killStillRunning(started);
  started = [];
});

async function startLeaderlessGroupAsync(marker: string | undefined): Promise<ILeaderlessGroup> {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, [DAEMON_OPERATION_GROUPS_ENV_VAR]: marker };
  const shell: ChildProcess = spawn('/bin/sh', ['-c', LEADERLESS_SCRIPT], { ...SHELL_OPTIONS, env });
  const exited: Promise<unknown[]> = once(shell, 'exit');
  const [chunk] = (await once(shell.stdout as Readable, 'data')) as [Buffer];
  const member: number = Number(chunk.toString().trim());
  started = identifyStarted([member]);
  await exited;
  const groupId: number = Number(shell.pid);
  expect(await waitUntilAsync(() => isGone(groupId))).toBe(true);
  return { groupId, member };
}

function deadDaemonFolder(lockfilePath: string): string {
  return getOperationGroupsFolder(lockfilePath, DEAD_PID);
}

// Records a real leaderless group for the dead daemon, whose member has the marker `markerOf(lockfilePath)`.
async function reapWithMarkerAsync(markerOf: (lockfilePath: string) => string | undefined): Promise<string> {
  const { lockfilePath } = createTestDaemonPaths();
  const folder: string = deadDaemonFolder(lockfilePath);
  const { groupId, member } = await startLeaderlessGroupAsync(markerOf(lockfilePath));
  expect(isAlive(member)).toBe(true);
  fs.mkdirSync(folder, { recursive: true });
  writeOperationGroupRecord(folder, { groupId, startTime: RECORDED_START });
  const outcome: string = await reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, OPTIONS);
  expect(fs.existsSync(folder)).toBe(false);
  return outcome;
}

linuxIt('never signals a real leaderless group whose live member has no marker', async () => {
  await expect(reapWithMarkerAsync(() => undefined)).resolves.toBe('none');
  expect(started.map(({ pid }) => isAlive(pid))).toEqual([true]);
});

linuxIt(
  'never signals a real leaderless group whose live member has the marker of another workspace',
  async () => {
    const otherWorkspaceFolder = (lockfilePath: string): string =>
      deadDaemonFolder(`${lockfilePath}${OTHER_WORKSPACE_SUFFIX}`);
    await expect(reapWithMarkerAsync(otherWorkspaceFolder)).resolves.toBe('none');
    expect(started.map(({ pid }) => isAlive(pid))).toEqual([true]);
  }
);

linuxIt("signals a real leaderless group whose live member has the dead daemon's marker", async () => {
  await expect(reapWithMarkerAsync(deadDaemonFolder)).resolves.toBe('terminated');
  expect(await waitUntilAsync(() => !started.some(({ pid }) => isAlive(pid)))).toBe(true);
});
