// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';

import { DaemonFrameListener } from '../DaemonListener';
import { readDaemonLockfile, writeDaemonLockfile } from '../DaemonLockfile';
import type { IDaemonPaths } from '../DaemonPaths';
import { DaemonTransportErrorCode } from '../DaemonTransportError';

import { createTestDaemonPaths } from './TestDaemonFixture';

const NO_ARGS: readonly string[] = [];
const DIR_MODE: number = 0o700;
const MISSING_PID: number = 0;

function listen(paths: IDaemonPaths): Promise<DaemonFrameListener> {
  return DaemonFrameListener.listenAsync(paths, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    onConnection: () => undefined
  });
}

async function getDeadPidAsync(): Promise<number> {
  const child: ReturnType<typeof spawn> = spawn(process.execPath, NO_ARGS, { stdio: 'ignore' });
  await once(child, 'exit');
  return child.pid ?? MISSING_PID;
}

function plantStaleArtifacts(paths: IDaemonPaths, deadPid: number): void {
  const staleDir: string = paths.runtimeDir ?? path.dirname(paths.lockfilePath);
  fs.mkdirSync(staleDir, { recursive: true, mode: DIR_MODE });
  if (paths.runtimeDir !== undefined) {
    fs.writeFileSync(paths.socketPath, 'stale');
  }
  writeDaemonLockfile(paths.lockfilePath, {
    pid: deadPid,
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    startedAt: new Date().toISOString(),
    socketPath: paths.socketPath
  });
}

it('reclaims a stale socket and dead-PID lockfile without manual cleanup', async () => {
  const paths: IDaemonPaths = createTestDaemonPaths();
  plantStaleArtifacts(paths, await getDeadPidAsync());
  const listener: DaemonFrameListener = await listen(paths);
  try {
    expect(readDaemonLockfile(paths.lockfilePath)?.pid).toBe(process.pid);
  } finally {
    await listener.closeAsync();
  }
});

it('refuses to reclaim a path owned by a live daemon', async () => {
  const paths: IDaemonPaths = createTestDaemonPaths();
  const listener: DaemonFrameListener = await listen(paths);
  try {
    await expect(listen(paths)).rejects.toMatchObject({
      name: 'DaemonTransportError',
      code: DaemonTransportErrorCode.daemonAlreadyRunning
    });
  } finally {
    await listener.closeAsync();
  }
});
