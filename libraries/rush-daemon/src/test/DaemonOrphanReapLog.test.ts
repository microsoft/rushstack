// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Readable } from 'node:stream';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';
import {
  computeDaemonWorkspaceKey,
  ensureDaemonRuntimeDir,
  isDaemonProcessAlive,
  resolveDaemonPathsFromProcess,
  writeDaemonLockfile
} from '@rushstack/rush-daemon-transport';
import type {
  IDaemonOperationGroupLeftRunning,
  IDaemonOrphanReap,
  IDaemonPaths,
  IDaemonReclaimOptions
} from '@rushstack/rush-daemon-transport';

import {
  formatOperationGroupLeftRunningLogLine,
  formatOrphanReapLogLine,
  getOrphanReapLogOptions
} from '../DaemonOrphanReapLog';
import { RushDaemonHost } from '../RushDaemonHost';
import { TestWorkspaceSession } from './TestWorkspaceSession';

const RUSH_VERSION: string = '5.178.1';
const DEAD_PID: number = 4242;
const POLL_ATTEMPTS: number = 250;
const POLL_INTERVAL_MS: number = 20;
// Above the reaper's SIGTERM and SIGKILL grace periods plus the wait for the orphan to exit.
const REAP_TEST_TIMEOUT_MS: number = 30000;
const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;
// A stand-in for a daemon that is SIGKILLed while it runs an operation. The operation is spawned without
// `detached`, so it stays in the daemon's process group; it exits by itself after a minute, so that a
// regression cannot leave it running.
const FAKE_DAEMON_SCRIPT: string =
  "const c=require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},60000)'],{stdio:'ignore'});" +
  "process.stdout.write(String(c.pid)+'\\n');setInterval(()=>{},1000);";
// A detached operation leads its own process group and session. It exits by itself after a minute.
const DETACHED_OPERATION_SCRIPT: string = 'setTimeout(()=>{},60000)';
// No process of a test starts one clock tick after boot, so a record with this start time names no leader.
const OTHER_START_TIME: string = '1';
const LEFT_RUNNING_PREFIX: string = 'rushd: left process group ';
const GROUP_LEFT_RUNNING: IDaemonOperationGroupLeftRunning = {
  daemonPid: DEAD_PID,
  processGroupId: 5001,
  reason: 'otherSession'
};

describe(formatOrphanReapLogLine.name, () => {
  it('names the exited daemon and its process group', () => {
    expect(
      formatOrphanReapLogLine({ daemonPid: DEAD_PID, processGroupIds: [DEAD_PID], outcome: 'terminated' })
    ).toBe(
      'rushd: stopped the operations that the exited daemon (PID 4242) left running (process group 4242)'
    );
  });

  it('names every process group, and says so when they needed SIGKILL', () => {
    expect(
      formatOrphanReapLogLine({
        daemonPid: DEAD_PID,
        processGroupIds: [11, 12, 13, 14, 15],
        outcome: 'killed'
      })
    ).toBe(
      'rushd: killed the operations that the exited daemon (PID 4242) left running ' +
        '(process groups 11, 12, 13, 14 and 15); they did not exit after SIGTERM'
    );
  });
});

describe(formatOperationGroupLeftRunningLogLine.name, () => {
  it('names the group, the exited daemon and the reason that the reclaim left the group running', () => {
    expect(formatOperationGroupLeftRunningLogLine(GROUP_LEFT_RUNNING)).toBe(
      'rushd: left process group 5001 running, which the exited daemon (PID 4242) recorded for an ' +
        'operation: its leader has exited, and a process of the group is in another session'
    );
  });
});

describe(getOrphanReapLogOptions.name, () => {
  it('keeps the process warning without onLog', () => {
    expect(getOrphanReapLogOptions(undefined)).toEqual({});
  });

  it('writes each set of stopped process groups to onLog', () => {
    const messages: string[] = [];
    const reap: IDaemonOrphanReap = { daemonPid: DEAD_PID, processGroupIds: [11, 12], outcome: 'terminated' };
    getOrphanReapLogOptions((message: string) => messages.push(message)).onOrphansReaped?.(reap);
    expect(messages).toEqual([formatOrphanReapLogLine(reap)]);
  });

  it('writes each operation group that the reclaim left running to onLog', () => {
    const messages: string[] = [];
    const options: IDaemonReclaimOptions = getOrphanReapLogOptions((message: string) =>
      messages.push(message)
    );
    options.onOperationGroupLeftRunning?.(GROUP_LEFT_RUNNING);
    expect(messages).toEqual([formatOperationGroupLeftRunningLogLine(GROUP_LEFT_RUNNING)]);
  });
});

interface ICrashedDaemon {
  readonly daemonPid: number;
  readonly orphanPid: number;
}

/** Leaves what a daemon that was SIGKILLed while running an operation leaves: the operation, lockfile and socket. */
async function crashFakeDaemonAsync(paths: IDaemonPaths): Promise<ICrashedDaemon> {
  const daemon: ChildProcess = spawn(process.execPath, ['-e', FAKE_DAEMON_SCRIPT], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore']
  });
  const stdout: Readable = daemon.stdout as Readable;
  const [chunk] = (await once(stdout, 'data')) as [Buffer];
  daemon.kill('SIGKILL');
  await once(daemon, 'exit');
  stdout.destroy();
  const daemonPid: number = Number(daemon.pid);
  ensureDaemonRuntimeDir(paths);
  writeDaemonLockfile(paths.lockfilePath, {
    pid: daemonPid,
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    startedAt: new Date().toISOString(),
    socketPath: paths.socketPath
  });
  fs.writeFileSync(paths.socketPath, 'stale');
  return { daemonPid, orphanPid: Number(chunk.toString().trim()) };
}

/** Records a group for the daemon `daemonPid`, as that daemon does when it starts a detached operation. */
function recordOperationGroup(
  paths: IDaemonPaths,
  daemonPid: number,
  groupId: number,
  startTime: string
): string {
  const folder: string = `${paths.lockfilePath}.groups-${daemonPid}`;
  fs.mkdirSync(folder, { mode: 0o700 });
  fs.writeFileSync(path.join(folder, `${groupId}-${startTime}`), '', { mode: 0o600 });
  return folder;
}

async function waitUntilDeadAsync(pid: number): Promise<boolean> {
  for (let attempt: number = 0; attempt < POLL_ATTEMPTS && isDaemonProcessAlive(pid); attempt++) {
    await delayAsync(POLL_INTERVAL_MS);
  }
  return !isDaemonProcessAlive(pid);
}

describe('startup reclaim', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-orphan-log-'));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(repoRoot, { force: true, recursive: true });
  });

  linuxIt(
    'writes the operations that it stops for a SIGKILLed daemon to the daemon log, not as a process warning',
    async () => {
      const warning: jest.SpyInstance = jest
        .spyOn(process, 'emitWarning')
        .mockImplementation(() => undefined);
      const workspaceKey: string = computeDaemonWorkspaceKey({
        canonicalRepoRoot: fs.realpathSync.native(repoRoot),
        rushVersion: RUSH_VERSION
      });
      const { daemonPid, orphanPid } = await crashFakeDaemonAsync(
        resolveDaemonPathsFromProcess(workspaceKey)
      );
      const messages: string[] = [];
      const host: RushDaemonHost = await RushDaemonHost.startAsync({
        createWorkspaceSessionAsync: () => Promise.resolve(new TestWorkspaceSession(repoRoot)),
        daemonVersion: 'orphan-log-test',
        repoRoot,
        rushVersion: RUSH_VERSION,
        onLog: (message: string) => messages.push(message)
      });
      await host.closeAsync();
      // The host logs other things too, such as its shutdown. The reclaim must add exactly this one line.
      expect(messages.filter((message: string) => message.includes('left running'))).toEqual([
        `rushd: stopped the operations that the exited daemon (PID ${daemonPid}) left running ` +
          `(process group ${daemonPid})`
      ]);
      expect(warning).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ code: 'RUSH_DAEMON_ORPHANS_REAPED' })
      );
      expect(await waitUntilDeadAsync(orphanPid)).toBe(true);
    },
    REAP_TEST_TIMEOUT_MS
  );

  linuxIt(
    'writes a recorded operation group that it cannot prove to the daemon log, and leaves it running',
    async () => {
      const paths: IDaemonPaths = resolveDaemonPathsFromProcess(
        computeDaemonWorkspaceKey({
          canonicalRepoRoot: fs.realpathSync.native(repoRoot),
          rushVersion: RUSH_VERSION
        })
      );
      const operation: ChildProcess = spawn(process.execPath, ['-e', DETACHED_OPERATION_SCRIPT], {
        detached: true,
        stdio: 'ignore'
      });
      const groupId: number = Number(operation.pid);
      try {
        const { daemonPid } = await crashFakeDaemonAsync(paths);
        const folder: string = recordOperationGroup(paths, daemonPid, groupId, OTHER_START_TIME);
        const messages: string[] = [];
        const host: RushDaemonHost = await RushDaemonHost.startAsync({
          createWorkspaceSessionAsync: () => Promise.resolve(new TestWorkspaceSession(repoRoot)),
          daemonVersion: 'orphan-log-test',
          repoRoot,
          rushVersion: RUSH_VERSION,
          onLog: (message: string) => messages.push(message)
        });
        await host.closeAsync();
        expect(messages.filter((message: string) => message.startsWith(LEFT_RUNNING_PREFIX))).toEqual([
          `${LEFT_RUNNING_PREFIX}${groupId} running, which the exited daemon (PID ${daemonPid}) recorded ` +
            `for an operation: the process with PID ${groupId} now is not the leader that the daemon recorded`
        ]);
        expect(isDaemonProcessAlive(groupId)).toBe(true);
        expect(fs.existsSync(folder)).toBe(false);
      } finally {
        // The operation is this test's own child, which has not been waited for, so its PID is still its own.
        operation.kill('SIGKILL');
      }
    },
    REAP_TEST_TIMEOUT_MS
  );
});
