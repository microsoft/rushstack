// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';

import { startOperationGroupRecording } from '../DaemonOperationGroupRecorder';
import type { StopOperationGroupRecording } from '../DaemonOperationGroupRecorder';
import { getOperationGroupsFolder, readOperationGroupRecords } from '../DaemonOperationGroups';
import type { IOperationGroupRecord } from '../DaemonOperationGroups';
import { readProcessStat } from '../DaemonProcessStat';

import { identifyStarted, killStillRunning, waitUntilAsync } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
const SLEEP_ARGS: string[] = ['-e', 'setTimeout(() => {}, 30000)'];
// SubprocessTerminator.RECOMMENDED_OPTIONS on POSIX.
const DETACHED: SpawnOptions = { detached: true, stdio: 'ignore' };
const ATTACHED: SpawnOptions = { stdio: 'ignore' };
const NO_RECORDS: number = 0;

let started: IStartedProcess[] = [];
afterEach(() => {
  killStillRunning(started);
  started = [];
});

async function spawnAsync(options: SpawnOptions): Promise<ChildProcess> {
  const child: ChildProcess = spawn(process.execPath, SLEEP_ARGS, options);
  await once(child, 'spawn');
  started = [...started, ...identifyStarted([Number(child.pid)])];
  return child;
}

function recordOf(child: ChildProcess): IOperationGroupRecord {
  const pid: number = Number(child.pid);
  return { groupId: pid, startTime: String(readProcessStat(pid)?.startTime) };
}

linuxIt('records a detached child while it runs, and no child that shares the daemon group', async () => {
  const folder: string = getOperationGroupsFolder(createTestDaemonPaths().lockfilePath, process.pid);
  const stop: StopOperationGroupRecording = startOperationGroupRecording(folder);
  const detached: ChildProcess = await spawnAsync(DETACHED);
  await spawnAsync(ATTACHED);
  expect(readOperationGroupRecords(folder)).toEqual([recordOf(detached)]);
  detached.kill('SIGKILL');
  expect(await waitUntilAsync(() => readOperationGroupRecords(folder).length === NO_RECORDS)).toBe(true);
  stop();
  expect(fs.existsSync(folder)).toBe(false);
});

linuxIt('records nothing after it stops', async () => {
  const folder: string = getOperationGroupsFolder(createTestDaemonPaths().lockfilePath, process.pid);
  startOperationGroupRecording(folder)();
  await spawnAsync(DETACHED);
  expect(readOperationGroupRecords(folder)).toEqual([]);
});
