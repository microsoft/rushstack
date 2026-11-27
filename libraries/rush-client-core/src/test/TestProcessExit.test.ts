// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import { once } from 'node:events';

import { createTestProcessExitWaiter } from './TestProcessExit';

describe(createTestProcessExitWaiter.name, () => {
  const pid: number = process.pid + 1;
  const missing: NodeJS.ErrnoException = Object.assign(new Error('Process exited'), { code: 'ESRCH' });
  let kill: jest.SpyInstance;

  beforeEach(() => {
    kill = jest.spyOn(process, 'kill').mockImplementation(() => {
      throw missing;
    });
  });

  afterEach(() => {
    kill.mockRestore();
  });

  it('does not probe a completed lifetime when its PID is reused', async () => {
    const waitForExit = createTestProcessExitWaiter(pid);
    await waitForExit();
    kill.mockImplementation(() => {
      throw new Error('The PID now belongs to another process');
    });
    await expect(waitForExit()).resolves.toBeUndefined();
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it('still probes a newly registered lifetime with the same PID', async () => {
    await createTestProcessExitWaiter(pid)();
    const unavailable: Error = new Error('Cannot inspect new fixture');
    kill.mockImplementation(() => {
      throw unavailable;
    });
    await expect(createTestProcessExitWaiter(pid)()).rejects.toBe(unavailable);
    expect(kill).toHaveBeenCalledTimes(2);
  });

  it('does not turn a failed join into successful cleanup', async () => {
    const denied: NodeJS.ErrnoException = Object.assign(new Error('Cannot inspect fixture'), {
      code: 'EPERM'
    });
    kill.mockImplementation(() => {
      throw denied;
    });
    const waitForExit = createTestProcessExitWaiter(pid);
    await expect(waitForExit()).rejects.toBe(denied);
    await expect(waitForExit()).rejects.toBe(denied);
  });
});

it('waits for fixture process exit rather than its work-finished marker', async () => {
  const child = spawn(process.execPath, ['-e', "process.stdout.write('finished'); process.stdin.resume();"], {
    stdio: 'pipe'
  });
  const closed: Promise<unknown[]> = once(child, 'close');
  try {
    await once(child.stdout, 'data');
    let exited: boolean = false;
    const waiting: Promise<void> = createTestProcessExitWaiter(child.pid!)().then(() => {
      exited = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(exited).toBe(false);
    child.stdin.end();
    await Promise.all([closed, waiting]);
    expect(exited).toBe(true);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
  }
});
