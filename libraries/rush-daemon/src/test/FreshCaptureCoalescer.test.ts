// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FreshCaptureCoalescer } from '../FreshCaptureCoalescer';

interface IStartedCapture {
  readonly index: number;
  readonly resolve: (value: string) => void;
  readonly reject: (error: Error) => void;
}

/** Captures that start in order and settle only when the test says so. */
class ControlledCaptures {
  public readonly started: IStartedCapture[] = [];

  public readonly captureAsync = (): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      this.started.push({ index: this.started.length, resolve, reject });
    });
  };
}

/** A clock that moves only when the test says so. */
class ManualClock {
  public nowMs: number = 0;
  public readonly now = (): number => this.nowMs;
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe(FreshCaptureCoalescer.name, () => {
  it('starts a capture for a caller when none is running and retains nothing once it settles', async () => {
    const coalescer: FreshCaptureCoalescer<object, string> = new FreshCaptureCoalescer();
    const scope: object = {};
    const captures: ControlledCaptures = new ControlledCaptures();

    const first: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync);
    expect(captures.started).toHaveLength(1);
    captures.started[0].resolve('first');
    await expect(first).resolves.toBe('first');

    const second: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync);
    expect(captures.started).toHaveLength(2);
    captures.started[1].resolve('second');
    await expect(second).resolves.toBe('second');
  });

  it('gives every caller that arrives during a capture one shared capture that starts after it settles', async () => {
    const coalescer: FreshCaptureCoalescer<object, string> = new FreshCaptureCoalescer();
    const scope: object = {};
    const captures: ControlledCaptures = new ControlledCaptures();

    const first: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync);
    const joiners: Promise<string>[] = [1, 2, 3].map(() =>
      coalescer.captureAsync(scope, 'key', captures.captureAsync)
    );
    await flushAsync();
    expect(captures.started).toHaveLength(1);

    captures.started[0].resolve('before the joiners asked');
    await expect(first).resolves.toBe('before the joiners asked');
    await flushAsync();
    expect(captures.started).toHaveLength(2);

    captures.started[1].resolve('after the joiners asked');
    await expect(Promise.all(joiners)).resolves.toEqual([
      'after the joiners asked',
      'after the joiners asked',
      'after the joiners asked'
    ]);
    expect(captures.started).toHaveLength(2);
  });

  it('never gives a caller a capture that started before the caller asked', async () => {
    const coalescer: FreshCaptureCoalescer<object, string> = new FreshCaptureCoalescer();
    const scope: object = {};
    const captures: ControlledCaptures = new ControlledCaptures();
    const results: Promise<[number, string]>[] = [];
    const ask = (): void => {
      const startedBeforeAsking: number = captures.started.length;
      results.push(
        coalescer
          .captureAsync(scope, 'key', captures.captureAsync)
          .then((value: string): [number, string] => [startedBeforeAsking, value])
      );
    };

    ask(); // starts capture 0
    ask(); // waits for capture 1
    captures.started[0].resolve('0');
    await flushAsync();
    ask(); // capture 1 is running, so this waits for capture 2
    ask();
    captures.started[1].resolve('1');
    await flushAsync();
    captures.started[2].resolve('2');
    await flushAsync();
    ask(); // nothing is running, so this starts capture 3
    captures.started[3].resolve('3');

    const settled: [number, string][] = await Promise.all(results);
    expect(settled).toEqual([
      [0, '0'],
      [1, '1'],
      [2, '2'],
      [2, '2'],
      [3, '3']
    ]);
    for (const [startedBeforeAsking, value] of settled) {
      expect(Number(value)).toBeGreaterThanOrEqual(startedBeforeAsking);
    }
  });

  it('rejects the callers of a failed capture and still runs the next capture for callers that arrived during it', async () => {
    const coalescer: FreshCaptureCoalescer<object, string> = new FreshCaptureCoalescer();
    const scope: object = {};
    const captures: ControlledCaptures = new ControlledCaptures();

    const failed: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync);
    const joiner: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync);
    captures.started[0].reject(new Error('a configuration file is being rewritten'));
    await expect(failed).rejects.toThrow('a configuration file is being rewritten');
    await flushAsync();
    expect(captures.started).toHaveLength(2);
    captures.started[1].resolve('rewritten');
    await expect(joiner).resolves.toBe('rewritten');
  });

  it('returns a rejected promise when the capture function throws synchronously', async () => {
    const coalescer: FreshCaptureCoalescer<object, string> = new FreshCaptureCoalescer();
    const scope: object = {};
    const result: Promise<string> = coalescer.captureAsync(scope, 'key', () => {
      throw new Error('cannot start');
    });
    await expect(result).rejects.toThrow('cannot start');
    await expect(coalescer.captureAsync(scope, 'key', async () => 'started')).resolves.toBe('started');
  });

  it('shares a running capture with callers whose notBeforeMs is at or before the time it started', async () => {
    const clock: ManualClock = new ManualClock();
    const coalescer: FreshCaptureCoalescer<object, string> = new FreshCaptureCoalescer({ now: clock.now });
    const scope: object = {};
    const captures: ControlledCaptures = new ControlledCaptures();

    clock.nowMs = 10;
    const first: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync, 10);
    clock.nowMs = 20;
    const receivedWhenItStarted: Promise<string> = coalescer.captureAsync(
      scope,
      'key',
      captures.captureAsync,
      10
    );
    const receivedBeforeItStarted: Promise<string> = coalescer.captureAsync(
      scope,
      'key',
      captures.captureAsync,
      5
    );
    await flushAsync();
    expect(captures.started).toHaveLength(1);

    captures.started[0].resolve('started at 10');
    await expect(Promise.all([first, receivedWhenItStarted, receivedBeforeItStarted])).resolves.toEqual([
      'started at 10',
      'started at 10',
      'started at 10'
    ]);
    await flushAsync();
    expect(captures.started).toHaveLength(1);
  });

  it('makes callers whose notBeforeMs is after the running capture started wait for the next capture', async () => {
    const clock: ManualClock = new ManualClock();
    const coalescer: FreshCaptureCoalescer<object, string> = new FreshCaptureCoalescer({ now: clock.now });
    const scope: object = {};
    const captures: ControlledCaptures = new ControlledCaptures();

    clock.nowMs = 10;
    const first: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync);
    clock.nowMs = 11;
    const receivedLater: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync, 11);
    const strict: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync);
    await flushAsync();
    expect(captures.started).toHaveLength(1);

    captures.started[0].resolve('started at 10');
    await expect(first).resolves.toBe('started at 10');
    await flushAsync();
    expect(captures.started).toHaveLength(2);
    captures.started[1].resolve('started at 11');
    await expect(Promise.all([receivedLater, strict])).resolves.toEqual(['started at 11', 'started at 11']);
  });

  it('records when a next capture starts, not when it was queued', async () => {
    const clock: ManualClock = new ManualClock();
    const coalescer: FreshCaptureCoalescer<object, string> = new FreshCaptureCoalescer({ now: clock.now });
    const scope: object = {};
    const captures: ControlledCaptures = new ControlledCaptures();

    clock.nowMs = 10;
    const first: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync);
    clock.nowMs = 12;
    const queued: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync);
    // The running capture started too early for this caller, so it shares the next capture that is already queued.
    const queuedWithReceipt: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync, 12);
    clock.nowMs = 30;
    captures.started[0].resolve('started at 10');
    await expect(first).resolves.toBe('started at 10');
    await flushAsync();
    expect(captures.started).toHaveLength(2);

    const receivedBeforeNextStarted: Promise<string> = coalescer.captureAsync(
      scope,
      'key',
      captures.captureAsync,
      25
    );
    const receivedAfterNextStarted: Promise<string> = coalescer.captureAsync(
      scope,
      'key',
      captures.captureAsync,
      31
    );
    captures.started[1].resolve('started at 30');
    await expect(Promise.all([queued, queuedWithReceipt, receivedBeforeNextStarted])).resolves.toEqual([
      'started at 30',
      'started at 30',
      'started at 30'
    ]);
    await flushAsync();
    expect(captures.started).toHaveLength(3);
    captures.started[2].resolve('started after 31');
    await expect(receivedAfterNextStarted).resolves.toBe('started after 31');
  });

  it('rejects a caller that shared a running capture that failed, as if it had asked before it started', async () => {
    const clock: ManualClock = new ManualClock();
    const coalescer: FreshCaptureCoalescer<object, string> = new FreshCaptureCoalescer({ now: clock.now });
    const scope: object = {};
    const captures: ControlledCaptures = new ControlledCaptures();

    clock.nowMs = 10;
    const failed: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync);
    const shared: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync, 10);
    captures.started[0].reject(new Error('a configuration file is being rewritten'));
    await expect(failed).rejects.toThrow('a configuration file is being rewritten');
    await expect(shared).rejects.toThrow('a configuration file is being rewritten');
    await flushAsync();
    expect(captures.started).toHaveLength(1);
  });

  it('compares notBeforeMs with performance.now() by default', async () => {
    const coalescer: FreshCaptureCoalescer<object, string> = new FreshCaptureCoalescer();
    const scope: object = {};
    const captures: ControlledCaptures = new ControlledCaptures();

    const receivedTimeMs: number = performance.now();
    const first: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync);
    const shared: Promise<string> = coalescer.captureAsync(scope, 'key', captures.captureAsync, receivedTimeMs);
    const receivedLater: Promise<string> = coalescer.captureAsync(
      scope,
      'key',
      captures.captureAsync,
      performance.now() + 60_000
    );
    await flushAsync();
    expect(captures.started).toHaveLength(1);
    captures.started[0].resolve('first');
    await expect(Promise.all([first, shared])).resolves.toEqual(['first', 'first']);
    await flushAsync();
    expect(captures.started).toHaveLength(2);
    captures.started[1].resolve('second');
    await expect(receivedLater).resolves.toBe('second');
  });

  it('never shares a capture between different scopes or keys', async () => {
    const coalescer: FreshCaptureCoalescer<object, string> = new FreshCaptureCoalescer();
    const firstScope: object = {};
    const secondScope: object = {};
    const captures: ControlledCaptures = new ControlledCaptures();

    const results: Promise<string>[] = [
      coalescer.captureAsync(firstScope, 'a', captures.captureAsync),
      coalescer.captureAsync(firstScope, 'b', captures.captureAsync),
      coalescer.captureAsync(secondScope, 'a', captures.captureAsync)
    ];
    expect(captures.started).toHaveLength(3);
    for (const capture of captures.started) capture.resolve(String(capture.index));
    await expect(Promise.all(results)).resolves.toEqual(['0', '1', '2']);
  });
});
