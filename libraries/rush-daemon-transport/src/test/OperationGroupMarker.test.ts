// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';

import { DAEMON_OPERATION_GROUPS_ENV_VAR, getOperationGroupsMarker } from '../DaemonOperationGroupMarker';
import { startOperationGroupRecording } from '../DaemonOperationGroupRecorder';
import type { StopOperationGroupRecording } from '../DaemonOperationGroupRecorder';
import { getOperationGroupsFolder } from '../DaemonOperationGroups';
import { hasEnvironmentEntry } from '../DaemonProcessStat';

import { identifyStarted, isGone, killStillRunning, waitUntilAsync } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
const SLEEP_ARGS: string[] = ['-e', 'setTimeout(() => {}, 30000)'];
const NAME: string = 'RUSHD_TEST_ENVIRONMENT_ENTRY';
const VALUE: string = '/tmp/rushd-1000/key.pid.json.groups-4242';
const FOREIGN_FOLDER: string = '/elsewhere.groups-4242';
const ENTRY: string = `${NAME}=${VALUE}`;

let started: IStartedProcess[] = [];
afterEach(() => {
  killStillRunning(started);
  started = [];
  delete process.env[DAEMON_OPERATION_GROUPS_ENV_VAR];
});

function recordingFolder(): string {
  return getOperationGroupsFolder(createTestDaemonPaths().lockfilePath, process.pid);
}

linuxIt('marks the processes started while it records, and removes only its own marker', () => {
  const folder: string = recordingFolder();
  const stop: StopOperationGroupRecording = startOperationGroupRecording(folder);
  expect(process.env[DAEMON_OPERATION_GROUPS_ENV_VAR]).toBe(folder);
  expect(getOperationGroupsMarker(folder)).toBe(`${DAEMON_OPERATION_GROUPS_ENV_VAR}=${folder}`);
  stop();
  expect(process.env[DAEMON_OPERATION_GROUPS_ENV_VAR]).toBeUndefined();
  const stopAgain: StopOperationGroupRecording = startOperationGroupRecording(recordingFolder());
  process.env[DAEMON_OPERATION_GROUPS_ENV_VAR] = FOREIGN_FOLDER;
  stopAgain();
  expect(process.env[DAEMON_OPERATION_GROUPS_ENV_VAR]).toBe(FOREIGN_FOLDER);
});

linuxIt('finds only an exact entry of the environment that a process started with', async () => {
  const child: ChildProcess = spawn(process.execPath, SLEEP_ARGS, {
    env: { [NAME]: VALUE },
    stdio: 'ignore'
  });
  await once(child, 'spawn');
  const pid: number = Number(child.pid);
  started = identifyStarted([pid]);
  expect(hasEnvironmentEntry(pid, ENTRY)).toBe(true);
  for (const entry of [`${NAME}=${FOREIGN_FOLDER}`, `${NAME}=`, NAME, `${ENTRY}/`, VALUE]) {
    expect(hasEnvironmentEntry(pid, entry)).toBe(false);
  }
  child.kill('SIGKILL');
  expect(await waitUntilAsync(() => isGone(pid))).toBe(true);
  expect(hasEnvironmentEntry(pid, ENTRY)).toBe(false);
});
