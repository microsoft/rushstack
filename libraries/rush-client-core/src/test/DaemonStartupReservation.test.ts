// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { LockFile } from '@rushstack/node-core-library';
import type { IDaemonPaths } from '@rushstack/rush-daemon-transport';

import {
  getDaemonStartupFilePath,
  reclaimStaleDaemonStartupReservation,
  releaseDaemonStartup,
  reserveDaemonStartup,
  updateDaemonStartupReservation
} from '../DaemonStartupReservation';

describe('daemon startup reservation mutations', () => {
  let folder: string;
  let paths: IDaemonPaths;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-reservation-'));
    paths = {
      runtimeDir: folder,
      socketPath: path.join(folder, 'd.sock'),
      lockfilePath: path.join(folder, 'daemon.pid.json')
    };
  });

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('never lets a stale owner update or release a replacement reservation', () => {
    const staleToken: string = reserveDaemonStartup(paths, 0);
    fs.rmSync(getDaemonStartupFilePath(paths));
    reserveDaemonStartup(paths, 1000);
    const replacement: string = fs.readFileSync(getDaemonStartupFilePath(paths), 'utf8');
    expect(() => updateDaemonStartupReservation(paths, staleToken, { launcherPid: 1 })).toThrow(
      'changed ownership'
    );
    expect(() => releaseDaemonStartup(paths, staleToken)).toThrow('changed ownership');
    expect(fs.readFileSync(getDaemonStartupFilePath(paths), 'utf8')).toBe(replacement);
  });

  it('serializes reclaim with other reservation mutations', () => {
    reserveDaemonStartup(paths, 1000);
    const lock: LockFile | undefined = LockFile.tryAcquire(folder, 'daemon.pid.json-reservation');
    expect(lock).toBeDefined();
    const started: number = Date.now();
    try {
      expect(() => reclaimStaleDaemonStartupReservation(paths, 1000)).toThrow('reservation lock');
    } finally {
      lock?.release();
    }
    expect(Date.now() - started).toBeGreaterThanOrEqual(4000);
    expect(reclaimStaleDaemonStartupReservation(paths, 1000)).toBe(false);
    expect(fs.existsSync(getDaemonStartupFilePath(paths))).toBe(true);
  }, 15000);
});
