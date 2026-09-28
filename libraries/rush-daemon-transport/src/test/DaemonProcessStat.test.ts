// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { POSIX_PROCESS_GROUP_OPS } from '../DaemonProcessGroup';
import { listLiveGroupMembers, readProcessStat } from '../DaemonProcessStat';
import type { IProcessStat } from '../DaemonProcessStat';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
// Linux caps pid_max at 2^22, so this pid never exists.
const IMPOSSIBLE_PID: number = 4194305;
const SLEEP_SECONDS: string = '30';
const DIGITS: RegExp = /^\d+$/;

linuxIt('reads the group, session and start time of a live process', () => {
  const self: IProcessStat | undefined = readProcessStat(process.pid);
  expect(self).toMatchObject({
    pid: process.pid,
    groupId: POSIX_PROCESS_GROUP_OPS.ownGroupId(),
    exited: false
  });
  expect(self?.startTime).toMatch(DIGITS);
  expect(readProcessStat(IMPOSSIBLE_PID)).toBeUndefined();
});

linuxIt('lists the live members of a process group', () => {
  const members: IProcessStat[] = listLiveGroupMembers(Number(POSIX_PROCESS_GROUP_OPS.ownGroupId()));
  expect(members.map((member: IProcessStat) => member.pid)).toContain(process.pid);
});

linuxIt('parses a command name that contains spaces and parentheses', async () => {
  const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-stat-'));
  const executable: string = path.join(folder, 'a) b (c');
  fs.symlinkSync('/bin/sleep', executable);
  const child: ChildProcess = spawn(executable, [SLEEP_SECONDS], { detached: true, stdio: 'ignore' });
  await once(child, 'spawn');
  const pid: number = Number(child.pid);
  const stat: IProcessStat | undefined = readProcessStat(pid);
  child.kill('SIGKILL');
  await once(child, 'exit');
  fs.rmSync(folder, { recursive: true, force: true });
  expect(stat).toMatchObject({ pid, groupId: pid, sessionId: pid, exited: false });
  expect(stat?.startTime).toMatch(DIGITS);
});
