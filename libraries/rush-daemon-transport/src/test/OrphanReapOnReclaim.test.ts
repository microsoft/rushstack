// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import type { Readable } from 'node:stream';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import { isDaemonProcessAlive, writeDaemonLockfile } from '../DaemonLockfile';
import type { IDaemonPaths } from '../DaemonPaths';
import { reclaimStaleDaemonAsync } from '../DaemonReclaim';
import type { IDaemonOrphanReap } from '../DaemonReclaimOptions';

import { createTestDaemonPaths } from './TestDaemonFixture';

const posixIt: jest.It = process.platform === 'win32' ? it.skip : it;
const FIRST_ATTEMPT: number = 0;
const POLL_ATTEMPTS: number = 100;
const POLL_INTERVAL_MS: number = 20;
// The operation child exits by itself after a minute, so a run where the reap fails doesn't leave it running.
// The test waits only 2 s for the reap, so the child's own exit can't make the test pass.
const OPERATION_SCRIPT: string = 'setTimeout(()=>{},60000)';
// A stand-in daemon: spawns one operation child and prints the child pid. Like a phased operation (spawned
// without `detached`), the child inherits the daemon's process group.
const FAKE_DAEMON_SCRIPT: string =
  "const c=require('node:child_process')" +
  `.spawn(process.execPath,['-e','${OPERATION_SCRIPT}'],{stdio:'ignore'});` +
  "process.stdout.write(String(c.pid)+'\\n');setInterval(()=>{},1000);";

interface IOrphanedGroup {
  readonly daemonPid: number;
  readonly orphanPid: number;
}

/** Spawns a detached fake daemon with one child in its group, then SIGKILLs only the daemon. */
async function createOrphanedGroupAsync(): Promise<IOrphanedGroup> {
  const daemon: ChildProcess = spawn(process.execPath, ['-e', FAKE_DAEMON_SCRIPT], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore']
  });
  const stdout: Readable = daemon.stdout as Readable;
  const [chunk] = (await once(stdout, 'data')) as [Buffer];
  daemon.kill('SIGKILL');
  await once(daemon, 'exit');
  stdout.destroy();
  return { daemonPid: Number(daemon.pid), orphanPid: Number(chunk.toString().trim()) };
}

async function waitUntilDeadAsync(pid: number): Promise<boolean> {
  for (let attempt: number = FIRST_ATTEMPT; attempt < POLL_ATTEMPTS; attempt++) {
    if (!isDaemonProcessAlive(pid)) return true;
    await delayAsync(POLL_INTERVAL_MS);
  }
  return false;
}

/** Records `daemonPid` as the owner of new test paths. */
function recordDeadOwner(daemonPid: number): IDaemonPaths {
  const paths: IDaemonPaths = createTestDaemonPaths();
  writeDaemonLockfile(paths.lockfilePath, {
    pid: daemonPid,
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    startedAt: new Date().toISOString(),
    socketPath: paths.socketPath
  });
  return paths;
}

posixIt('reaps operation processes orphaned by a SIGKILLed daemon before reclaiming', async () => {
  const warning: jest.SpyInstance = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
  const { daemonPid, orphanPid } = await createOrphanedGroupAsync();
  expect(isDaemonProcessAlive(orphanPid)).toBe(true);
  await reclaimStaleDaemonAsync(recordDeadOwner(daemonPid));
  expect(await waitUntilDeadAsync(orphanPid)).toBe(true);
  expect(warning).toHaveBeenCalledWith(expect.stringContaining(`dead daemon ${daemonPid}`), expect.anything());
  warning.mockRestore();
});

posixIt('reports what it stopped to onOrphansReaped instead of a process warning', async () => {
  const warning: jest.SpyInstance = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
  const { daemonPid, orphanPid } = await createOrphanedGroupAsync();
  const reaps: IDaemonOrphanReap[] = [];
  const onOrphansReaped = (reap: IDaemonOrphanReap): number => reaps.push(reap);
  await reclaimStaleDaemonAsync(recordDeadOwner(daemonPid), { onOrphansReaped });
  expect(await waitUntilDeadAsync(orphanPid)).toBe(true);
  expect(reaps).toEqual([{ daemonPid, processGroupIds: [daemonPid], outcome: 'terminated' }]);
  expect(warning).not.toHaveBeenCalled();
  warning.mockRestore();
});
