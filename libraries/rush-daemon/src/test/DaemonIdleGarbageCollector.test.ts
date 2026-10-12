// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  DaemonIdleGarbageCollector,
  type IDaemonIdleGarbageCollection,
  type IDaemonIdleGarbageCollectorOptions
} from '../DaemonIdleGarbageCollector';
import * as DaemonResidentMemory from '../DaemonResidentMemory';

const DELAY_MS: number = 10000;
const MIB: number = 1024 * 1024;

describe(DaemonIdleGarbageCollector.name, () => {
  let collect: jest.Mock;
  let onCollected: jest.Mock;
  let onError: jest.Mock;
  let engineBusy: boolean;

  beforeEach(() => {
    jest.useFakeTimers();
    collect = jest.fn();
    onCollected = jest.fn();
    onError = jest.fn();
    engineBusy = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function createCollector(
    options?: Partial<IDaemonIdleGarbageCollectorOptions>
  ): DaemonIdleGarbageCollector {
    return new DaemonIdleGarbageCollector({
      delayMs: DELAY_MS,
      collect,
      isEngineBusy: () => engineBusy,
      onCollected,
      onError,
      ...options
    });
  }

  it('does not collect before the first request settles', () => {
    createCollector();
    jest.advanceTimersByTime(10 * DELAY_MS);
    expect(collect).not.toHaveBeenCalled();
  });

  it('collects once, a full delay after the last pending request settles, and never while one is pending', () => {
    const collector: DaemonIdleGarbageCollector = createCollector();
    const releaseFirst: () => void = collector.acquire();
    const releaseSecond: () => void = collector.acquire();
    releaseFirst();
    releaseFirst();
    jest.advanceTimersByTime(10 * DELAY_MS);
    expect(collect).not.toHaveBeenCalled();
    releaseSecond();
    jest.advanceTimersByTime(DELAY_MS - 1);
    expect(collect).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(collect).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(100 * DELAY_MS);
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('collects again only after another request settles', () => {
    const collector: DaemonIdleGarbageCollector = createCollector();
    collector.acquire()();
    jest.advanceTimersByTime(DELAY_MS);
    expect(collect).toHaveBeenCalledTimes(1);
    const release: () => void = collector.acquire();
    jest.advanceTimersByTime(10 * DELAY_MS);
    expect(collect).toHaveBeenCalledTimes(1);
    release();
    jest.advanceTimersByTime(DELAY_MS);
    expect(collect).toHaveBeenCalledTimes(2);
  });

  it('gives a request that starts during the delay a full delay after it settles', () => {
    const collector: DaemonIdleGarbageCollector = createCollector();
    collector.acquire()();
    jest.advanceTimersByTime(DELAY_MS - 1);
    const release: () => void = collector.acquire();
    jest.advanceTimersByTime(10 * DELAY_MS);
    expect(collect).not.toHaveBeenCalled();
    release();
    jest.advanceTimersByTime(DELAY_MS - 1);
    expect(collect).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('waits a full delay again while the engine is busy without a request', () => {
    const collector: DaemonIdleGarbageCollector = createCollector();
    engineBusy = true;
    collector.acquire()();
    jest.advanceTimersByTime(3 * DELAY_MS);
    expect(collect).not.toHaveBeenCalled();
    engineBusy = false;
    jest.advanceTimersByTime(DELAY_MS);
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('reports the memory before and after the collection and the time it took', () => {
    // The resident memory comes from readResidentMemoryBytes, and not from process.memoryUsage()'s rss.
    let collected: boolean = false;
    collect.mockImplementation(() => {
      collected = true;
    });
    jest
      .spyOn(DaemonResidentMemory, 'readResidentMemoryBytes')
      .mockImplementation(() => (collected ? 200 * MIB : 300 * MIB));
    jest
      .spyOn(process, 'memoryUsage')
      .mockReturnValueOnce({ rss: 1800, heapTotal: 1500, heapUsed: 1300, external: 0, arrayBuffers: 0 })
      .mockReturnValueOnce({ rss: 600, heapTotal: 500, heapUsed: 440, external: 0, arrayBuffers: 0 });
    const collector: DaemonIdleGarbageCollector = createCollector();
    collector.acquire()();
    jest.advanceTimersByTime(DELAY_MS);
    expect(onCollected).toHaveBeenCalledTimes(1);
    const collection: IDaemonIdleGarbageCollection = onCollected.mock.calls[0][0];
    expect(collection).toMatchObject({
      heapUsedBytesBefore: 1300,
      heapUsedBytesAfter: 440,
      residentBytesBefore: 300 * MIB,
      residentBytesAfter: 200 * MIB
    });
    expect(collection.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports a failed collection once and stops', () => {
    const error: Error = new Error('no gc');
    collect.mockImplementation(() => {
      throw error;
    });
    const collector: DaemonIdleGarbageCollector = createCollector();
    collector.acquire()();
    jest.advanceTimersByTime(DELAY_MS);
    collector.acquire()();
    jest.advanceTimersByTime(10 * DELAY_MS);
    expect(collect).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
    expect(onCollected).not.toHaveBeenCalled();
  });

  it('reports a failure to read the memory use once and stops', () => {
    const error: Error = new Error('EMFILE: too many open files, uv_resident_set_memory');
    jest.spyOn(process, 'memoryUsage').mockImplementation(() => {
      throw error;
    });
    const collector: DaemonIdleGarbageCollector = createCollector();
    collector.acquire()();
    jest.advanceTimersByTime(DELAY_MS);
    collector.acquire()();
    jest.advanceTimersByTime(10 * DELAY_MS);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
    expect(collect).not.toHaveBeenCalled();
    expect(onCollected).not.toHaveBeenCalled();
  });

  it('does not collect after it is disposed', () => {
    const collector: DaemonIdleGarbageCollector = createCollector();
    collector.acquire()();
    const release: () => void = collector.acquire();
    collector[Symbol.dispose]();
    release();
    jest.runAllTimers();
    expect(collect).not.toHaveBeenCalled();
  });

  it.each([0, -1, NaN, Infinity, 2147483648])('rejects the delay %s', (delayMs: number) => {
    expect(() => createCollector({ delayMs })).toThrow(RangeError);
  });
});
