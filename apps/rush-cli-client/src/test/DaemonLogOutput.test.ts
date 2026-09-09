// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { DaemonLogOutput } from '../DaemonLogOutput';
import { MAX_LOG_OUTPUT_BYTES } from '../DaemonLogOutputProtocol';

describe(DaemonLogOutput.name, () => {
  let folder: string;
  let filename: string;
  let fd: number;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-log-output-'));
    filename = path.join(folder, 'bytes.log');
    fd = fs.openSync(filename, 'w');
  });

  afterEach(() => {
    fs.closeSync(fd);
    fs.rmSync(folder, { recursive: true });
  });

  it('acknowledges bounded binary writes and joins its output-only process', async () => {
    const output = new DaemonLogOutput(undefined, fd);
    const bytes: Buffer = Buffer.alloc(MAX_LOG_OUTPUT_BYTES);
    for (let index: number = 0; index < bytes.length; index++) bytes[index] = index % 256;
    let pid: number | undefined;
    try {
      await output.writeAsync(bytes);
      pid = output.workerPid;
      await output.writeAsync(Buffer.from([0, 255, 3]));
    } finally {
      await output.closeAsync();
    }
    expect(fs.readFileSync(filename)).toEqual(Buffer.concat([bytes, Buffer.from([0, 255, 3])]));
    expect(pid).toEqual(expect.any(Number));
    expect(() => process.kill(pid!, 0)).toThrow();
  });

  it('rejects oversized writes before starting a process', async () => {
    const output = new DaemonLogOutput(undefined, fd);
    try {
      await expect(output.writeAsync(Buffer.alloc(MAX_LOG_OUTPUT_BYTES + 1))).rejects.toThrow('too large');
      expect(output.workerPid).toBeUndefined();
    } finally {
      await output.closeAsync();
    }
  });

  it('rejects an already cancelled write without consuming output resources', async () => {
    const abort = new AbortController();
    const reason: Error = new Error('Cancelled output.');
    abort.abort(reason);
    const output = new DaemonLogOutput(abort.signal, fd);
    try {
      await expect(output.writeAsync(Buffer.from('unwritten'))).rejects.toBe(reason);
      expect(output.workerPid).toBeUndefined();
    } finally {
      await output.closeAsync();
    }
    expect(fs.readFileSync(filename)).toHaveLength(0);
  });

  it('propagates a real descriptor write failure and joins the failed helper', async () => {
    const readFd: number = fs.openSync(filename, 'r');
    const output = new DaemonLogOutput(undefined, readFd);
    try {
      await expect(output.writeAsync(Buffer.from('cannot write'))).rejects.toThrow('output failed');
      await expect(output.closeAsync()).rejects.toThrow('output failed');
      expect(output.failureSignal.aborted).toBe(true);
      expect(() => process.kill(output.workerPid!, 0)).toThrow();
    } finally {
      await output.closeAsync().catch((error: unknown) => {
        if (error !== output.failureSignal.reason) throw error;
      });
      fs.closeSync(readFd);
    }
  });

  it('does not orphan a blocked output worker when its owning process disappears', async () => {
    const owner = spawn(process.execPath, [path.join(__dirname, 'DaemonLogOutputTestProcess.js')], {
      cwd: folder,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    const closed = once(owner, 'close');
    const worker = once(owner, 'message');
    const readable = once(owner.stdout!, 'readable');
    owner.stderr!.resume();
    let workerPid: number | undefined;
    let forcedCleanup: boolean = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const [message]: unknown[] = await Promise.race([
        worker,
        closed.then(() => {
          throw new Error('Output owner exited before worker startup.');
        })
      ]);
      if (
        typeof message !== 'object' ||
        message === null ||
        !('workerPid' in message) ||
        typeof message.workerPid !== 'number'
      )
        throw new Error('Output owner did not identify its worker.');
      workerPid = message.workerPid;
      expect(workerPid).toEqual(expect.any(Number));
      await Promise.race([
        readable,
        closed.then(() => {
          throw new Error('Output owner exited before filling the pipe.');
        })
      ]);
      await delayAsync(150);
      deadline = setTimeout(() => {
        forcedCleanup = true;
        try {
          process.kill(workerPid!, 'SIGKILL');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        }
        owner.stdout!.destroy();
      }, 3000);
      owner.kill('SIGKILL');
      await closed;
      expect(forcedCleanup).toBe(false);
      expect(() => process.kill(workerPid!, 0)).toThrow();
    } finally {
      clearTimeout(deadline);
      if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
      owner.stdout!.destroy();
      await closed;
    }
  }, 10000);
});
