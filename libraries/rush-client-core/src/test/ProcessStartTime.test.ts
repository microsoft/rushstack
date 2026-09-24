// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';

import { isProcessStartedAfter, tryGetProcessStartTimeMs } from '../ProcessStartTime';

const linuxIt: typeof it = process.platform === 'linux' ? it : it.skip;

describe('process start time', () => {
  linuxIt('estimates this process start time from /proc', () => {
    const startMs: number | undefined = tryGetProcessStartTimeMs(process.pid);
    expect(startMs).toEqual(expect.any(Number));
    expect(Math.abs(startMs! - performance.timeOrigin)).toBeLessThan(1000);
  });

  linuxIt('detects a PID whose process started after a record was written', () => {
    expect(isProcessStartedAfter(process.pid, new Date(Date.now() - 3600000).toISOString())).toBe(true);
    expect(isProcessStartedAfter(process.pid, new Date().toISOString())).toBe(false);
  });

  it('treats unknown start times and invalid timestamps as not provably reused', async () => {
    const exited: ChildProcess = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    await once(exited, 'close');
    expect(tryGetProcessStartTimeMs(exited.pid!)).toBeUndefined();
    expect(isProcessStartedAfter(exited.pid!, new Date(0).toISOString())).toBe(false);
    expect(isProcessStartedAfter(process.pid, 'not a timestamp')).toBe(false);
  });
});
