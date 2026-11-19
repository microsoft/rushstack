// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import type { Readable } from 'node:stream';

import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import { getOperationGroupsFolder, writeOperationGroupRecord } from '../DaemonOperationGroups';
import { POSIX_PROCESS_GROUP_OPS } from '../DaemonProcessGroup';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';
import type { IDaemonOperationGroupLeftRunning } from '../DaemonReclaimOptions';

import { RECORDED_START } from './OperationGroupFixture';
import { DEAD_PID } from './OrphanReaperFixture';
import { identifyStarted, isAlive, isGone, killStillRunning, waitUntilAsync } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
// A detached shell leads a new session and group, starts a member in them, prints its pid and exits, which
// leaves the group without its leader. Nothing in the group has RUSHD_OPERATION_GROUPS, as in an operation of
// a daemon from a release before that variable.
const LEADERLESS_SCRIPT: string = 'sleep 600 </dev/null >/dev/null 2>&1 & echo $!';
const GRACE_MS: number = 500;

let started: IStartedProcess[] = [];
afterEach(() => {
  killStillRunning(started);
  started = [];
});

async function startUnmarkedLeaderlessGroupAsync(): Promise<number> {
  const shell: ChildProcess = spawn('/bin/sh', ['-c', LEADERLESS_SCRIPT], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { PATH: process.env.PATH }
  });
  const exited: Promise<unknown[]> = once(shell, 'exit');
  const [chunk] = (await once(shell.stdout as Readable, 'data')) as [Buffer];
  started = identifyStarted([Number(chunk.toString().trim())]);
  await exited;
  const groupId: number = Number(shell.pid);
  expect(await waitUntilAsync(() => isGone(groupId))).toBe(true);
  return groupId;
}

linuxIt(
  'reports a real leaderless group without the marker once, as noMarker, and signals nothing',
  async () => {
    const { lockfilePath } = createTestDaemonPaths();
    const folder: string = getOperationGroupsFolder(lockfilePath, DEAD_PID);
    const groupId: number = await startUnmarkedLeaderlessGroupAsync();
    fs.mkdirSync(folder, { recursive: true });
    writeOperationGroupRecord(folder, { groupId, startTime: RECORDED_START });
    const groups: IDaemonOperationGroupLeftRunning[] = [];
    const signalGroup: jest.Mock = jest.fn();
    const options: IDaemonOrphanReaperOptions = {
      ops: { ...POSIX_PROCESS_GROUP_OPS, isProcessAlive: () => false, signalGroup, log: () => undefined },
      graceMs: GRACE_MS,
      onOperationGroupLeftRunning: (group: IDaemonOperationGroupLeftRunning) => groups.push(group)
    };
    await expect(reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, options)).resolves.toBe('none');
    expect(groups).toEqual([{ daemonPid: DEAD_PID, processGroupId: groupId, reason: 'noMarker' }]);
    expect(signalGroup).not.toHaveBeenCalled();
    expect(fs.existsSync(folder)).toBe(false);
    expect(started.map(({ pid }) => isAlive(pid))).toEqual([true]);
  }
);
