// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { once } from 'node:events';
import * as path from 'node:path';
import type { Readable } from 'node:stream';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import { writeDaemonLockfile } from '../DaemonLockfile';
import type { IDaemonPaths } from '../DaemonPaths';

const FAKE_DAEMON_OPTIONS: SpawnOptions = { detached: true, stdio: ['ignore', 'pipe', 'ignore'] };
const SPACE: string = ' ';
// The fake daemon runs the real recorder, then spawns two operations the way Rush does
// (`detached: true` = SubprocessTerminator.RECOMMENDED_OPTIONS on POSIX), each with a grandchild. The
// first operation's shell waits for its grandchild; the second exits when the daemon's stdin pipe closes,
// which leaves a leaderless group behind.
const FAKE_DAEMON_SCRIPT: string = `
const [recorder, groups, lockfile] = process.argv.slice(1);
require(recorder).startOperationGroupRecording(require(groups).getOperationGroupsFolder(lockfile, process.pid));
const spawnOperation = (tail) => require('node:child_process').spawn('/bin/sh',
  ['-c', 'sleep 30 </dev/null >/dev/null 2>&1 & echo $!; ' + tail], { detached: true, stdio: ['pipe', 'pipe', 'ignore'] });
const pidsOf = (op) => new Promise((resolve) => op.stdout.once('data', (d) => resolve(op.pid + ' ' + String(d).trim())));
Promise.all([spawnOperation('wait'), spawnOperation('read line')].map(pidsOf))
  .then((pids) => process.stdout.write(pids.join(' ') + '\\n'));
setInterval(() => {}, 1000);`;

/** A fake daemon that recorded two detached operations, each with a grandchild. */
export interface IFakeDaemon {
  readonly daemon: ChildProcess;
  /** Leader and grandchild of the waiting operation, then of the exiting one. */
  readonly pids: number[];
}

/** Starts the fake daemon and waits until both operations and their grandchildren run. */
export async function startFakeDaemonAsync(paths: IDaemonPaths): Promise<IFakeDaemon> {
  const modules: string[] = ['DaemonOperationGroupRecorder', 'DaemonOperationGroups'].map((name: string) =>
    path.join(__dirname, '..', `${name}.js`)
  );
  const args: string[] = ['-e', FAKE_DAEMON_SCRIPT, ...modules, paths.lockfilePath];
  const daemon: ChildProcess = spawn(process.execPath, args, FAKE_DAEMON_OPTIONS);
  const [chunk] = (await once(daemon.stdout as Readable, 'data')) as [Buffer];
  return { daemon, pids: chunk.toString().trim().split(SPACE).map(Number) };
}

/** SIGKILLs the fake daemon, as the OOM killer would, leaving its operations behind. */
export async function killFakeDaemonAsync(fake: IFakeDaemon): Promise<void> {
  fake.daemon.kill('SIGKILL');
  await once(fake.daemon, 'exit');
  (fake.daemon.stdout as Readable).destroy();
}

/** Writes the lockfile the dead fake daemon would have left. */
export function writeDeadOwnerLockfile(paths: IDaemonPaths, fake: IFakeDaemon): void {
  writeDaemonLockfile(paths.lockfilePath, {
    pid: Number(fake.daemon.pid),
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    startedAt: new Date().toISOString(),
    socketPath: paths.socketPath
  });
}
