// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonFileChange } from '@rushstack/rush-daemon-transport';

import { DAEMON_SOCKET_CHECK_INTERVAL_MS, DaemonSocketWatch } from '../DaemonSocketWatch';

describe(DaemonSocketWatch.name, () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('checks the socket at each interval and reports only the first change', () => {
    const results: (DaemonFileChange | undefined)[] = [undefined, 'removed', 'replaced'];
    const checkSocket: jest.Mock = jest.fn(() => results.shift());
    const onChanged: jest.Mock = jest.fn();
    const watch: DaemonSocketWatch = new DaemonSocketWatch(checkSocket, onChanged);
    jest.advanceTimersByTime(DAEMON_SOCKET_CHECK_INTERVAL_MS - 1);
    expect(checkSocket).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(checkSocket).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();
    jest.advanceTimersByTime(DAEMON_SOCKET_CHECK_INTERVAL_MS);
    expect(onChanged).toHaveBeenCalledWith('removed');
    jest.advanceTimersByTime(DAEMON_SOCKET_CHECK_INTERVAL_MS * 3);
    expect(checkSocket).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    watch[Symbol.dispose]();
  });

  it('stops checking once disposed', () => {
    const checkSocket: jest.Mock = jest.fn(() => undefined);
    const watch: DaemonSocketWatch = new DaemonSocketWatch(checkSocket, jest.fn());
    watch[Symbol.dispose]();
    jest.advanceTimersByTime(DAEMON_SOCKET_CHECK_INTERVAL_MS * 2);
    expect(checkSocket).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not keep the process running', () => {
    jest.useRealTimers();
    const setIntervalSpy: jest.SpyInstance = jest.spyOn(global, 'setInterval');
    const watch: DaemonSocketWatch = new DaemonSocketWatch(() => undefined, jest.fn());
    try {
      const timer: NodeJS.Timeout = setIntervalSpy.mock.results[0].value;
      expect(timer.hasRef()).toBe(false);
    } finally {
      watch[Symbol.dispose]();
    }
  });

  // A literal, not the exported constant: RushDaemonHost documents the 5 s and gives the watch no interval.
  it('checks the socket every 5 seconds when it is given no interval', () => {
    const checkSocket: jest.Mock = jest.fn(() => undefined);
    const watch: DaemonSocketWatch = new DaemonSocketWatch(checkSocket, jest.fn());
    try {
      jest.advanceTimersByTime(4_999);
      expect(checkSocket).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(checkSocket).toHaveBeenCalledTimes(1);
    } finally {
      watch[Symbol.dispose]();
    }
  });
});
