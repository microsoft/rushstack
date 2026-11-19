// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import { EventEmitter, once } from 'node:events';

import { startOperationGroupRecording } from '../DaemonOperationGroupRecorder';
import type { StopOperationGroupRecording } from '../DaemonOperationGroupRecorder';
import {
  getOperationGroupsFolder,
  readFolderNames,
  readOperationGroupRecords
} from '../DaemonOperationGroups';
import type { IOperationGroupRecord } from '../DaemonOperationGroups';
import { readProcessStat } from '../DaemonProcessStat';

import { identifyStarted, killStillRunning } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
const CHILD_PROCESS_CHANNEL: string = 'child_process';
const SLEEP_ARGS: string[] = ['-e', 'setTimeout(() => {}, 30000)'];
const MISSING_COMMAND: string = '/nonexistent/rushd-spawn-test';
const ERROR_FIELDS: string[] = ['message', 'code', 'errno', 'syscall', 'path', 'spawnargs'];

interface IFailedSpawn {
  readonly entries: string[];
  readonly pid: number | undefined;
  readonly error: Record<string, unknown>;
}

let started: IStartedProcess[] = [];
afterEach(() => {
  killStillRunning(started);
  started = [];
});

function createFolder(): string {
  return getOperationGroupsFolder(createTestDaemonPaths().lockfilePath, process.pid);
}

linuxIt("records a published child without a spawn method on its 'spawn' event", async () => {
  // Started before the recording, so only the published stand-in below can record it.
  const sleeper: ChildProcess = spawn(process.execPath, SLEEP_ARGS, { detached: true, stdio: 'ignore' });
  await once(sleeper, 'spawn');
  const pid: number = Number(sleeper.pid);
  started = identifyStarted([pid]);
  const folder: string = createFolder();
  const stop: StopOperationGroupRecording = startOperationGroupRecording(folder);
  const standIn: EventEmitter & { pid: number } = Object.assign(new EventEmitter(), { pid });
  diagnosticsChannel.channel(CHILD_PROCESS_CHANNEL).publish({ process: standIn });
  const beforeSpawnEvent: IOperationGroupRecord[] = readOperationGroupRecords(folder);
  standIn.emit('spawn');
  const afterSpawnEvent: IOperationGroupRecord[] = readOperationGroupRecords(folder);
  stop();
  const record: IOperationGroupRecord = { groupId: pid, startTime: String(readProcessStat(pid)?.startTime) };
  expect({ beforeSpawnEvent, afterSpawnEvent }).toEqual({ beforeSpawnEvent: [], afterSpawnEvent: [record] });
});

// A detached spawn of a missing command: the entries in `folder` right after it, and its 'error' event.
async function spawnMissingAsync(folder: string): Promise<IFailedSpawn> {
  const child: ChildProcess = spawn(MISSING_COMMAND, [], { detached: true, stdio: 'ignore' });
  const entries: string[] = readFolderNames(folder);
  const [error] = (await once(child, 'error')) as [NodeJS.ErrnoException & Record<string, unknown>];
  const reported: Record<string, unknown> = Object.fromEntries(
    ERROR_FIELDS.map((field: string) => [field, error[field]])
  );
  return { entries, pid: child.pid, error: reported };
}

linuxIt(
  "emits the same 'error' as without recording when a detached spawn fails, with no mark or record",
  async () => {
    const unrecorded: IFailedSpawn = await spawnMissingAsync(createFolder());
    const folder: string = createFolder();
    const stop: StopOperationGroupRecording = startOperationGroupRecording(folder);
    const recorded: IFailedSpawn = await spawnMissingAsync(folder);
    const entriesAfterError: string[] = readFolderNames(folder);
    stop();
    expect(unrecorded.error.code).toBe('ENOENT');
    expect({ recorded, entriesAfterError }).toEqual({ recorded: unrecorded, entriesAfterError: [] });
  }
);
