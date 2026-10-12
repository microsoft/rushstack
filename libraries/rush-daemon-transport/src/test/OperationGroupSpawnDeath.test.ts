// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import { getOperationGroupsFolder } from '../DaemonOperationGroups';
import { POSIX_PROCESS_GROUP_OPS } from '../DaemonProcessGroup';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';
import type { IDaemonOrphanReap } from '../DaemonReclaimOptions';

import { identifyStarted, isAlive, killStillRunning, waitUntilAsync } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
// The fake daemon records with the real recorder, except that writing a record writes the child's pid to a file
// and SIGKILLs the daemon instead. So it dies after Node has started its detached operation, before the operation
// has a record: whatever the recorder leaves in its folder then is all that a successor finds.
const DYING_DAEMON_SCRIPT: string = `
const [recorder, groups, lockfile, pidFile] = process.argv.slice(1);
const groupsModule = require(groups);
groupsModule.writeOperationGroupRecord = (folder, record) => {
  require('node:fs').writeFileSync(pidFile, String(record.groupId));
  process.kill(process.pid, 'SIGKILL');
};
require(recorder).startOperationGroupRecording(groupsModule.getOperationGroupsFolder(lockfile, process.pid));
require('node:child_process').spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });`;
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
  readonly signal: NodeJS.Signals | null;
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
  const [, signal] = (await once(daemon, 'exit')) as [number | null, NodeJS.Signals | null];
  const sleeper: number = Number(fs.readFileSync(pidFile, UTF8));
  fs.rmSync(pidFile);
  started = identifyStarted([sleeper]);
  return { daemonPid: Number(daemon.pid), signal, sleeper };
}

linuxIt(
  'reaps a detached operation whose daemon died after starting it, before recording it',
  async () => {
    const { lockfilePath } = createTestDaemonPaths();
    const { daemonPid, signal, sleeper } = await runDyingDaemonAsync(lockfilePath);
    const folder: string = getOperationGroupsFolder(lockfilePath, daemonPid);
    const entries: string[] = fs.existsSync(folder) ? fs.readdirSync(folder) : [];
    const reaped: (readonly number[])[] = [];
    const onOrphansReaped = (reap: IDaemonOrphanReap): void => {
      reaped.push(reap.processGroupIds);
    };
    const outcome: string = await reapDeadDaemonOperationGroupsAsync(lockfilePath, daemonPid, {
      ...OPTIONS,
      onOrphansReaped
    });
    const gone: boolean = await waitUntilAsync(() => !isAlive(sleeper));
    expect({ signal, entries, outcome, reaped, gone }).toEqual({
      signal: 'SIGKILL',
      entries: [expect.stringMatching(/^spawn-\d+$/)],
      outcome: 'terminated',
      reaped: [[sleeper]],
      gone: true
    });
  },
  TEST_TIMEOUT_MS
);
