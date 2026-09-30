// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';

import { DAEMON_OPERATION_GROUPS_ENV_VAR } from '../DaemonOperationGroupMarker';
import { listProcesses } from '../DaemonProcessList';
import { hasEnvironmentEntry } from '../DaemonProcessStat';
import type { IProcessStat } from '../DaemonProcessStat';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
// Another user's process: its environment can't be read (EACCES), unless the tests run as root.
const INIT_PID: number = 1;
// Linux caps pid_max at 2^22, so this pid never exists (ENOENT).
const IMPOSSIBLE_PID: number = 4194305;
const ENTRY: string = `${DAEMON_OPERATION_GROUPS_ENV_VAR}=/nonexistent/rushd-read-errors`;

afterEach(() => {
  jest.restoreAllMocks();
});

// Fails every read of `/proc/<pid>/stat` as a process that exits during a scan, or is hidden, would.
function failStatReadsOf(pid: number): void {
  const statPath: string = `/proc/${pid}/stat`;
  const { readFileSync } = fs;
  jest.spyOn(fs, 'readFileSync').mockImplementation(((
    ...args: Parameters<typeof readFileSync>
  ): string | Buffer => {
    const [file] = args;
    if (file === statPath) throw Object.assign(new Error(`ENOENT: ${statPath}`), { code: 'ENOENT' });
    return readFileSync(...args);
  }) as typeof readFileSync);
}

linuxIt('lists every process but one whose /proc record cannot be read, without throwing', () => {
  failStatReadsOf(process.ppid);
  const pids: number[] = listProcesses().map((stat: IProcessStat) => stat.pid);
  expect({ self: pids.includes(process.pid), parent: pids.includes(process.ppid) }).toEqual({
    self: true,
    parent: false
  });
});

linuxIt('reads an environment that cannot be read as not holding the entry, without throwing', () => {
  expect([hasEnvironmentEntry(INIT_PID, ENTRY), hasEnvironmentEntry(IMPOSSIBLE_PID, ENTRY)]).toEqual([
    false,
    false
  ]);
});
