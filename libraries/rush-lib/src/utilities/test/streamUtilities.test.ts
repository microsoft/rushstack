// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';

import { type IFlushableStream, waitForStreamsToFlushAsync } from '../streamUtilities';

class FakeStream extends EventEmitter implements IFlushableStream {
  public writable: boolean = true;
  public writableLength: number;
  public readonly writeCallbacks: (() => void)[] = [];

  public constructor(writableLength: number) {
    super();
    this.writableLength = writableLength;
  }

  public write(chunk: string, callback: () => void): boolean {
    this.writeCallbacks.push(callback);
    return true;
  }
}

async function isSettledAsync(promise: Promise<unknown>): Promise<boolean> {
  let settled: boolean = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  await new Promise<void>((resolve: () => void) => setImmediate(resolve));
  return settled;
}

describe(waitForStreamsToFlushAsync.name, () => {
  it('does not write to a stream that has nothing queued', async () => {
    const stream: FakeStream = new FakeStream(0);

    await expect(waitForStreamsToFlushAsync([stream])).resolves.toBeUndefined();

    expect(stream.writeCallbacks).toHaveLength(0);
  });

  it('does not write to a stream that can no longer be written', async () => {
    const stream: FakeStream = new FakeStream(100);
    stream.writable = false;

    await expect(waitForStreamsToFlushAsync([stream])).resolves.toBeUndefined();

    expect(stream.writeCallbacks).toHaveLength(0);
  });

  it('waits until each stream with queued output has written it', async () => {
    const stdout: FakeStream = new FakeStream(100);
    const stderr: FakeStream = new FakeStream(20);
    const idle: FakeStream = new FakeStream(0);

    const flush: Promise<void> = waitForStreamsToFlushAsync([stdout, stderr, idle]);

    expect(stdout.writeCallbacks).toHaveLength(1);
    expect(stderr.writeCallbacks).toHaveLength(1);
    expect(idle.writeCallbacks).toHaveLength(0);
    stdout.writeCallbacks[0]();
    await expect(isSettledAsync(flush)).resolves.toBe(false);
    stderr.writeCallbacks[0]();
    await expect(flush).resolves.toBeUndefined();
    expect(stdout.listenerCount('error')).toBe(0);
    expect(stderr.listenerCount('error')).toBe(0);
  });

  it('handles the error event of a stream that fails while it waits', async () => {
    const stream: FakeStream = new FakeStream(100);

    const flush: Promise<void> = waitForStreamsToFlushAsync([stream]);
    // A Node.js stream that fails runs its pending write callbacks first, then emits 'error'.
    stream.writable = false;
    stream.writeCallbacks[0]();

    await expect(flush).resolves.toBeUndefined();
    expect(() => stream.emit('error', new Error('write EPIPE'))).not.toThrow();
    expect(stream.listenerCount('error')).toBe(0);
  });

  it('waits for the writes that a Node.js stream has not finished', async () => {
    const written: string[] = [];
    const finishWrites: (() => void)[] = [];
    const stream: Writable = new Writable({
      write(chunk: Buffer, encoding: BufferEncoding, callback: () => void): void {
        written.push(chunk.toString());
        finishWrites.push(() => callback());
      }
    });
    stream.write('first');
    stream.write('second');
    expect(stream.writableLength).toBe('firstsecond'.length);

    const flush: Promise<void> = waitForStreamsToFlushAsync([stream]);

    finishWrites.shift()!();
    await expect(isSettledAsync(flush)).resolves.toBe(false);
    finishWrites.shift()!();
    await expect(isSettledAsync(flush)).resolves.toBe(false);
    expect(written).toEqual(['first', 'second', '']);
    finishWrites.shift()!();
    await expect(flush).resolves.toBeUndefined();
    expect(stream.writableLength).toBe(0);
    expect(stream.listenerCount('error')).toBe(0);
  });

  it('handles the error that a Node.js stream emits after it fails a queued write', async () => {
    const finishWrites: ((error?: Error) => void)[] = [];
    const stream: Writable = new Writable({
      write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error) => void): void {
        finishWrites.push(callback);
      }
    });
    stream.write('queued');

    const flush: Promise<void> = waitForStreamsToFlushAsync([stream]);
    finishWrites.shift()!(new Error('write EPIPE'));

    await expect(flush).resolves.toBeUndefined();
    // The stream emits 'error' on a later tick. Without a listener, that is an uncaught exception.
    await new Promise<void>((resolve: () => void) => setImmediate(resolve));
    expect(stream.destroyed).toBe(true);
    expect(stream.listenerCount('error')).toBe(0);
  });
});
