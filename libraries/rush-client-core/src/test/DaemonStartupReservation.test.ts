// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import {
  getDaemonStartupFilePath,
  readDaemonStartupReservation,
  reserveDaemonStartup,
  type IDaemonStartupReservation
} from '../DaemonStartup';
import {
  getStartupHelperState,
  tryTakeOverAbandonedStartupReservationAsync
} from '../DaemonStartupReservation';
import { isProcessDefunct } from '../ProcessStartTime';
import { removeTestFolderAsync } from './TestProcessExit';
import { withUnreapedChildAsync } from './UnreapedChildProcess';

const linuxIt: typeof it = process.platform === 'linux' ? it : it.skip;

function getDaemonPaths(runtimeDir: string): IDaemonPaths {
  return {
    runtimeDir,
    socketPath:
      process.platform === 'win32'
        ? `\\\\.\\pipe\\rush-client-reservation-${path.basename(runtimeDir)}`
        : path.join(runtimeDir, 'd.sock'),
    lockfilePath: path.join(runtimeDir, 'daemon.pid.json')
  };
}

function getIsoOffset(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

describe('daemon startup reservations', () => {
  let folder: string;
  let paths: IDaemonPaths;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-reservation-'));
    paths = getDaemonPaths(folder);
  });

  afterEach(async () => {
    await removeTestFolderAsync(folder);
  });

  it('takes over an expired helper readiness deadline even when the recorded PID is live', async () => {
    reserveDaemonStartup(paths, {
      pid: process.pid,
      startedAt: getIsoOffset(-180_000),
      readinessDeadline: getIsoOffset(-61_000)
    });
    const reservation = getRequiredReservation();

    await expect(tryTakeOverAbandonedStartupReservationAsync(paths, reservation)).resolves.toBe(true);
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(false);
  });

  it('keeps a live helper reservation within its readiness deadline', async () => {
    reserveDaemonStartup(paths, {
      pid: process.pid,
      startedAt: getIsoOffset(-1_000),
      readinessDeadline: getIsoOffset(60_000)
    });
    const reservation = getRequiredReservation();

    await expect(tryTakeOverAbandonedStartupReservationAsync(paths, reservation)).resolves.toBe(false);
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(true);
  });

  linuxIt('treats a defunct startup helper as exited', async () => {
    await withUnreapedChildAsync(async (pid) => {
      const deadline: number = Date.now() + 5000;
      while (!isProcessDefunct(pid) && Date.now() < deadline) await delayAsync(20);
      expect(isProcessDefunct(pid)).toBe(true);
      reserveDaemonStartup(paths, {
        pid,
        startedAt: getIsoOffset(-1_000),
        readinessDeadline: getIsoOffset(60_000)
      });

      expect(getStartupHelperState(getRequiredReservation())).toBe('exited');
    });
  });

  function getRequiredReservation(): IDaemonStartupReservation {
    const reservation: IDaemonStartupReservation | undefined = readDaemonStartupReservation(paths);
    if (!reservation) throw new Error('Expected a startup reservation.');
    return reservation;
  }
});
