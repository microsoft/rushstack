// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { Writable } from 'node:stream';

import {
  CLOSED_OUTPUT_EXIT_CODE,
  ClientOutput,
  getClosedOutputCode,
  type ClientOutputStream
} from '../clientOutput';

function errnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`write ${code}`), { code, syscall: 'write' });
}

/** A stream whose writes fail with `failure` once it is set, as a pipe's do after its reader exits. */
class FakeOutput extends Writable {
  public readonly chunks: string[] = [];
  public attempts: number = 0;
  public failure: string | undefined;

  public constructor() {
    super({
      write: (chunk: Buffer, encoding, callback) => {
        this.attempts++;
        if (this.failure) {
          callback(errnoError(this.failure));
        } else {
          this.chunks.push(chunk.toString());
          callback();
        }
      }
    });
  }
}

describe('ClientOutput', () => {
  let stdout: FakeOutput;
  let stderr: FakeOutput;
  let output: ClientOutput;
  let closed: ClientOutputStream[];

  beforeEach(() => {
    stdout = new FakeOutput();
    stderr = new FakeOutput();
    output = new ClientOutput({ stdout, stderr });
    closed = [];
    output.onClosed((stream) => closed.push(stream));
  });

  afterEach(() => {
    output.release();
  });

  it('exits like a writer that SIGPIPE ended', () => {
    expect(CLOSED_OUTPUT_EXIT_CODE).toBe(141);
  });

  it('only takes EPIPE and ECONNRESET for a reader that exited', () => {
    expect(getClosedOutputCode(errnoError('EPIPE'))).toBe('EPIPE');
    expect(getClosedOutputCode(errnoError('ECONNRESET'))).toBe('ECONNRESET');
    expect(getClosedOutputCode(errnoError('ENOSPC'))).toBeUndefined();
    expect(getClosedOutputCode(new Error('write EPIPE'))).toBeUndefined();
    expect(getClosedOutputCode('EPIPE')).toBeUndefined();
    expect(getClosedOutputCode(undefined)).toBeUndefined();
  });

  it('reports a reader that exited once, and then drops the writes to its stream', async () => {
    await output.stdout.writeAsync(Buffer.from('first\n'));
    stdout.failure = 'EPIPE';
    await expect(output.stdout.writeAsync(Buffer.from('second\n'))).resolves.toBeUndefined();
    await expect(output.stdout.writeAsync(Buffer.from('third\n'))).resolves.toBeUndefined();
    expect(stdout.chunks).toEqual(['first\n']);
    expect(stdout.attempts).toBe(2);
    expect(closed).toEqual([output.stdout]);
    expect(output.stdout.closedCode).toBe('EPIPE');
    // The other stream is still read.
    await output.stderr.writeAsync(Buffer.from('still read\n'));
    expect(stderr.chunks).toEqual(['still read\n']);
    expect(output.stderr.closedCode).toBeUndefined();
  });

  it('rejects any other write error, and keeps writing', async () => {
    stdout.failure = 'ENOSPC';
    await expect(output.stdout.writeAsync(Buffer.from('lost\n'))).rejects.toMatchObject({ code: 'ENOSPC' });
    expect(closed).toEqual([]);
    expect(output.stdout.closedCode).toBeUndefined();
  });

  it('reports a stream whose reader already exited to a later listener at once, until it is removed', async () => {
    stderr.failure = 'ECONNRESET';
    await output.stderr.writeAsync(Buffer.from('lost\n'));
    const late: ClientOutputStream[] = [];
    const remove: () => void = output.onClosed((stream) => late.push(stream));
    expect(late).toEqual([output.stderr]);
    remove();
    stdout.failure = 'EPIPE';
    await output.stdout.writeAsync(Buffer.from('lost\n'));
    expect(late).toEqual([output.stderr]);
    expect(closed).toEqual([output.stderr, output.stdout]);
  });

  it('keeps an error event of a reader that exited from failing the process, while guarded', () => {
    output.guard();
    output.guard();
    expect(stdout.listenerCount('error')).toBe(1);
    expect(() => stdout.emit('error', errnoError('EPIPE'))).not.toThrow();
    expect(closed).toEqual([output.stdout]);
    // No write waits for an unexpected error, so it still fails the process.
    expect(() => stderr.emit('error', errnoError('ENOSPC'))).toThrow('write ENOSPC');
    const handler: jest.Mock = jest.fn();
    stderr.on('error', handler);
    expect(() => stderr.emit('error', errnoError('ENOSPC'))).not.toThrow();
    expect(handler).toHaveBeenCalledTimes(1);
    stderr.removeListener('error', handler);
    output.release();
    expect(stdout.listenerCount('error')).toBe(0);
    expect(stderr.listenerCount('error')).toBe(0);
  });

  it('drops the text of a write that does not wait once the reader exited', async () => {
    stdout.failure = 'EPIPE';
    output.guard();
    output.stdout.write('lost\n');
    await new Promise((resolve) => setImmediate(resolve));
    output.stdout.write('dropped\n');
    expect(stdout.attempts).toBe(1);
    expect(closed).toEqual([output.stdout]);
  });

  // On Windows, libuv never closes file descriptors 0 to 2, so the reader cannot close its end of the pipe.
  (process.platform === 'win32' ? it.skip : it)('recognizes a real pipe whose reader closed it', async () => {
    // The reader closes its end of the pipe, and then waits, so that the parent does not destroy the pipe on exit.
    const reader: ChildProcess = spawn(
      process.execPath,
      ['-e', "require('node:fs').closeSync(0);process.stdout.write('closed');setTimeout(()=>{},30000)"],
      { stdio: ['pipe', 'pipe', 'ignore'] }
    );
    const exited: Promise<unknown[]> = once(reader, 'close');
    const real: ClientOutput = new ClientOutput({ stdout: reader.stdin!, stderr });
    const realClosed: ClientOutputStream[] = [];
    real.onClosed((stream) => realClosed.push(stream));
    real.guard();
    try {
      await once(reader.stdout!, 'data');
      for (let attempt: number = 0; attempt < 20 && !realClosed.length; attempt++) {
        await real.stdout.writeAsync(Buffer.alloc(64 * 1024));
      }
      expect(realClosed).toEqual([real.stdout]);
      expect(real.stdout.closedCode).toBe('EPIPE');
    } finally {
      real.release();
      reader.kill();
      await exited;
    }
  });
});
