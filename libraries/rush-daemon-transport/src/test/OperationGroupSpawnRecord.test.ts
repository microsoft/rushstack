// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import { getOperationGroupsFolder, readOperationGroupRecords } from '../DaemonOperationGroups';
import type { IOperationGroupRecord } from '../DaemonOperationGroups';
import { POSIX_PROCESS_GROUP_OPS } from '../DaemonProcessGroup';
import { readProcessStat } from '../DaemonProcessStat';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';

import { identifyStarted, isAlive, killStillRunning, waitUntilAsync } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
// The fake daemon records, starts an operation the way Rush does (`detached: true`), writes its pid, and
// SIGKILLs itself in the same synchronous block, before Node can emit the child's 'spawn' event.
const DYING_DAEMON_SCRIPT: string = `
const [recorder, groups, lockfile, pidFile] = process.argv.slice(1);
require(recorder).startOperationGroupRecording(require(groups).getOperationGroupsFolder(lockfile, process.pid));
const child = require('node:child_process').spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
require('node:fs').writeFileSync(pidFile, String(child.pid));
process.kill(process.pid, 'SIGKILL');`;
const PID_FILE_SUFFIX: string = '.sleeper';
const UTF8: BufferEncoding = 'utf8';
const GRACE_MS: number = 500;
// Enough for the 5 s wait for the sleeper to be gone, so a failure shows what the reap did.
const TEST_TIMEOUT_MS: number = 15000;
const OPTIONS: IDaemonOrphanReaperOptions = {
  ops: { ...POSIX_PROCESS_GROUP_OPS, isProcessAlive: () => false, log: () => undefined },
  graceMs: GRACE_MS
};

interface IDeadDaemon {
  readonly daemonPid: number;
  readonly sleeper: number;
}

let started: IStartedProcess[] = [];
afterEach(() => {
  killStillRunning(started);
  started = [];
});

async function runDyingDaemonAsync(lockfilePath: string): Promise<IDeadDaemon> {
  const pidFile: string = `${lockfilePath}${PID_FILE_SUFFIX}`;
  const modules: string[] = ['DaemonOperationGroupRecorder', 'DaemonOperationGroups'].map((name: string) =>
    path.join(__dirname, '..', `${name}.js`)
  );
  const args: string[] = ['-e', DYING_DAEMON_SCRIPT, ...modules, lockfilePath, pidFile];
  const daemon: ChildProcess = spawn(process.execPath, args, { stdio: 'ignore' });
  await once(daemon, 'exit');
  const sleeper: number = Number(fs.readFileSync(pidFile, UTF8));
  fs.rmSync(pidFile);
  started = identifyStarted([sleeper]);
  return { daemonPid: Number(daemon.pid), sleeper };
}

function recordOf(pid: number): IOperationGroupRecord {
  return { groupId: pid, startTime: String(readProcessStat(pid)?.startTime) };
}

linuxIt('reaps a detached operation that its daemon started in the same tick as its SIGKILL', async () => {
  const { lockfilePath } = createTestDaemonPaths();
  const { daemonPid, sleeper } = await runDyingDaemonAsync(lockfilePath);
  const expected: IOperationGroupRecord = recordOf(sleeper);
  const folder: string = getOperationGroupsFolder(lockfilePath, daemonPid);
  const records: IOperationGroupRecord[] = readOperationGroupRecords(folder);
  const outcome: string = await reapDeadDaemonOperationGroupsAsync(lockfilePath, daemonPid, OPTIONS);
  const gone: boolean = await waitUntilAsync(() => !isAlive(sleeper));
  expect({ records, outcome, gone }).toEqual({ records: [expected], outcome: 'terminated', gone: true });
}, TEST_TIMEOUT_MS);
