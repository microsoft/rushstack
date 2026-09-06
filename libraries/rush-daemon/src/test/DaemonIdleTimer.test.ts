// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonIdleTimer } from '../DaemonIdleTimer';

const IDLE_TIMEOUT_SECONDS: number = 10;
const IDLE_TIMEOUT_MS: number = 10000;

describe(DaemonIdleTimer.name, () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does not shut down unless a timeout was configured', () => {
    const onIdle: jest.Mock = jest.fn();
    const timer: DaemonIdleTimer = new DaemonIdleTimer(undefined);
    timer.start(onIdle);
    jest.runAllTimers();
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('starts the idle deadline only after the host is ready', () => {
    const onIdle: jest.Mock = jest.fn();
    const timer: DaemonIdleTimer = new DaemonIdleTimer(IDLE_TIMEOUT_SECONDS);
    jest.advanceTimersByTime(IDLE_TIMEOUT_MS);
    timer.start(onIdle);
    jest.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('waits for every request and gives the last completion a full idle interval', () => {
    const onIdle: jest.Mock = jest.fn();
    const timer: DaemonIdleTimer = new DaemonIdleTimer(IDLE_TIMEOUT_SECONDS);
    timer.start(onIdle);
    jest.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    const releaseFirst: () => void = timer.acquire();
    const releaseSecond: () => void = timer.acquire();
    jest.advanceTimersByTime(IDLE_TIMEOUT_MS);
    releaseFirst();
    releaseFirst();
    jest.advanceTimersByTime(IDLE_TIMEOUT_MS);
    expect(onIdle).not.toHaveBeenCalled();
    releaseSecond();
    jest.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('does not rearm when a request finishes during shutdown', () => {
    const onIdle: jest.Mock = jest.fn();
    const timer: DaemonIdleTimer = new DaemonIdleTimer(IDLE_TIMEOUT_SECONDS);
    timer.start(onIdle);
    const release: () => void = timer.acquire();
    timer[Symbol.dispose]();
    release();
    jest.runAllTimers();
    expect(onIdle).not.toHaveBeenCalled();
  });

  it.each([0, -1, NaN, Infinity, 2147484])('rejects invalid timeout %s', (timeout: number) => {
    expect(() => new DaemonIdleTimer(timeout)).toThrow(RangeError);
  });
});
