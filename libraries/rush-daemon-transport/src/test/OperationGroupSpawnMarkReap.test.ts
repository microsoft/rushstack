// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { DAEMON_OPERATION_GROUPS_ENV_VAR } from '../DaemonOperationGroupMarker';
import { reapDeadDaemonOperationGroupsAsync } from '../DaemonOperationGroupReaper';
import { getOperationGroupsFolder } from '../DaemonOperationGroups';
import { POSIX_PROCESS_GROUP_OPS } from '../DaemonProcessGroup';
import type { IDaemonOrphanReaperOptions } from '../DaemonReapOptions';
import type { IDaemonOrphanReap } from '../DaemonReclaimOptions';

import { DEAD_PID } from './OrphanReaperFixture';
import { identifyStarted, isAlive, killStillRunning, waitUntilAsync } from './ProcessWaitFixture';
import type { IStartedProcess } from './ProcessWaitFixture';
import { createTestDaemonPaths } from './TestDaemonFixture';

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
const PROC_UPTIME: string = '/proc/uptime';
const UTF8: BufferEncoding = 'utf8';
const DECIMAL_POINT: string = '.';
const FRACTION_START: number = 0;
const HUNDREDTHS_DIGITS: number = 2;
const TICKS_PER_SECOND: number = 100;
// Twice the 1 s after a mark in which a reap considers a process as started by the marked spawn.
const LONG_BEFORE_TICKS: number = 200;
const NO_TICKS: number = 0;
const GRACE_MS: number = 500;
// Enough for the 5 s wait for the sleeper to be gone, so a failure shows what the reap did.
const TEST_TIMEOUT_MS: number = 15000;
const SLEEP_SECONDS: string = '30';
const OPTIONS: IDaemonOrphanReaperOptions = {
  ops: { ...POSIX_PROCESS_GROUP_OPS, isProcessAlive: () => false, log: () => undefined },
  graceMs: GRACE_MS
};

interface IMarkedReap {
  readonly sleeper: number;
  readonly outcome: string;
  readonly reaped: (readonly number[])[];
}

let started: IStartedProcess[] = [];
afterEach(() => {
  killStillRunning(started);
  started = [];
});

// The clock ticks since boot, read with this test's own parser.
function readTicks(): number {
  const [seconds, fraction] = fs.readFileSync(PROC_UPTIME, UTF8).split(DECIMAL_POINT);
  return Number(seconds) * TICKS_PER_SECOND + Number(fraction.slice(FRACTION_START, HUNDREDTHS_DIGITS));
}

async function spawnMarkedSleeperAsync(folder: string): Promise<number> {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, [DAEMON_OPERATION_GROUPS_ENV_VAR]: folder };
  const sleeper: ChildProcess = spawn('sleep', [SLEEP_SECONDS], { detached: true, stdio: 'ignore', env });
  await once(sleeper, 'spawn');
  started = identifyStarted([Number(sleeper.pid)]);
  return Number(sleeper.pid);
}

// Marks a spawn `ticksBefore` ticks ago in the dead daemon's folder, starts a detached sleeper with the daemon's
// marker and no record, and reaps.
async function reapAfterMarkAsync(ticksBefore: number): Promise<IMarkedReap> {
  const { lockfilePath } = createTestDaemonPaths();
  const folder: string = getOperationGroupsFolder(lockfilePath, DEAD_PID);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `spawn-${readTicks() - ticksBefore}`), '');
  const sleeper: number = await spawnMarkedSleeperAsync(folder);
  const reaped: (readonly number[])[] = [];
  const onOrphansReaped = (reap: IDaemonOrphanReap): void => {
    reaped.push(reap.processGroupIds);
  };
  const outcome: string = await reapDeadDaemonOperationGroupsAsync(lockfilePath, DEAD_PID, {
    ...OPTIONS,
    onOrphansReaped
  });
  expect(fs.existsSync(folder)).toBe(false);
  return { sleeper, outcome, reaped };
}

linuxIt('reaps an unrecorded detached process with the marker that started just after a spawn mark', async () => {
  const { sleeper, outcome, reaped } = await reapAfterMarkAsync(NO_TICKS);
  const gone: boolean = await waitUntilAsync(() => !isAlive(sleeper));
  expect({ outcome, reaped, gone }).toEqual({ outcome: 'terminated', reaped: [[sleeper]], gone: true });
}, TEST_TIMEOUT_MS);

linuxIt('never signals a process with the marker that started over 1 s after the spawn mark', async () => {
  const { sleeper, outcome, reaped } = await reapAfterMarkAsync(LONG_BEFORE_TICKS);
  expect({ outcome, reaped, alive: isAlive(sleeper) }).toEqual({ outcome: 'none', reaped: [], alive: true });
});
