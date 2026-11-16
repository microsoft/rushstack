// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ConnectingClientTracker } from '../ConnectingClientTracker';
import type { IConnectingClient } from '../ConnectingClientTracker';

interface IObservedWait {
  readonly done: boolean;
}

function observe(waitPromise: Promise<void>): IObservedWait {
  const observed: { done: boolean } = { done: false };
  void waitPromise.then(() => {
    observed.done = true;
  });
  return observed;
}

// With fake timers, an immediate that is queued while timers run fires 1 ms later. So a wait that the tracker
// resumes from a timer, which then lets the event loop poll, ends a few milliseconds after that timer.
describe(ConnectingClientTracker.name, () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does not wait when no connection is connecting', async () => {
    const tracker: ConnectingClientTracker = new ConnectingClientTracker();
    const wait: IObservedWait = observe(tracker.waitAsync());
    await jest.advanceTimersByTimeAsync(5);
    expect(wait.done).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('waits for a connection that the event loop accepts after the wait began', async () => {
    const tracker: ConnectingClientTracker = new ConnectingClientTracker({
      idleLimitMs: 100,
      waitLimitMs: 100
    });
    const wait: IObservedWait = observe(tracker.waitAsync());
    // The daemon accepts a connection when the event loop polls for I/O. The wait's first immediate can run before
    // that poll, and this one runs after it.
    setImmediate(() => tracker.add());
    await jest.advanceTimersByTimeAsync(99);
    expect(wait.done).toBe(false);
    await jest.advanceTimersByTimeAsync(11);
    expect(wait.done).toBe(true);
  });

  it('stops waiting as soon as the connection settles', async () => {
    const tracker: ConnectingClientTracker = new ConnectingClientTracker({
      idleLimitMs: 100,
      waitLimitMs: 100
    });
    const client: IConnectingClient = tracker.add();
    const wait: IObservedWait = observe(tracker.waitAsync());
    await jest.advanceTimersByTimeAsync(40);
    expect(wait.done).toBe(false);
    client.settle();
    await jest.advanceTimersByTimeAsync(0);
    expect(wait.done).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('counts a connection as idle once its latest frame is as old as the idle limit', async () => {
    const tracker: ConnectingClientTracker = new ConnectingClientTracker({
      idleLimitMs: 100,
      waitLimitMs: 1000
    });
    tracker.add();
    await jest.advanceTimersByTimeAsync(99);
    const wait: IObservedWait = observe(tracker.waitAsync());
    await jest.advanceTimersByTimeAsync(1);
    expect(wait.done).toBe(true);
  });

  it('measures the idle limit from the latest frame rather than from the start of the wait', async () => {
    const tracker: ConnectingClientTracker = new ConnectingClientTracker({
      idleLimitMs: 100,
      waitLimitMs: 1000
    });
    tracker.add();
    await jest.advanceTimersByTimeAsync(30);
    const wait: IObservedWait = observe(tracker.waitAsync());
    await jest.advanceTimersByTimeAsync(60);
    expect(wait.done).toBe(false);
    await jest.advanceTimersByTimeAsync(20);
    expect(wait.done).toBe(true);

    // The connection never sent a request, so it stays tracked, but a later wait does not wait for it.
    await jest.advanceTimersByTimeAsync(500);
    const laterWait: IObservedWait = observe(tracker.waitAsync());
    await jest.advanceTimersByTimeAsync(5);
    expect(laterWait.done).toBe(true);
  });

  it('keeps waiting while the connection receives frames, up to the wait limit', async () => {
    const tracker: ConnectingClientTracker = new ConnectingClientTracker({
      idleLimitMs: 100,
      waitLimitMs: 250
    });
    const client: IConnectingClient = tracker.add();
    const wait: IObservedWait = observe(tracker.waitAsync());
    await jest.advanceTimersByTimeAsync(90);
    client.touch();
    await jest.advanceTimersByTimeAsync(90);
    expect(wait.done).toBe(false);
    client.touch();
    await jest.advanceTimersByTimeAsync(69);
    expect(wait.done).toBe(false);
    await jest.advanceTimersByTimeAsync(11);
    expect(wait.done).toBe(true);
  });

  it('reads the frames that already arrived before it decides that another connection is idle', async () => {
    const tracker: ConnectingClientTracker = new ConnectingClientTracker({
      idleLimitMs: 100,
      waitLimitMs: 1000
    });
    const other: IConnectingClient = tracker.add();
    await jest.advanceTimersByTimeAsync(50);
    const requesting: IConnectingClient = tracker.add();
    const wait: IObservedWait = observe(tracker.waitAsync());
    await jest.advanceTimersByTimeAsync(70);

    // The event loop reads the other connection's frame in the same poll as the request, after it.
    setImmediate(() => other.touch());
    requesting.settle();
    await jest.advanceTimersByTimeAsync(0);
    expect(wait.done).toBe(false);
    await jest.advanceTimersByTimeAsync(99);
    expect(wait.done).toBe(false);
    await jest.advanceTimersByTimeAsync(11);
    expect(wait.done).toBe(true);
  });

  it('ignores frames and repeated settles after the connection settled', async () => {
    const tracker: ConnectingClientTracker = new ConnectingClientTracker({
      idleLimitMs: 100,
      waitLimitMs: 100
    });
    const client: IConnectingClient = tracker.add();
    client.settle();
    client.settle();
    client.touch();
    const wait: IObservedWait = observe(tracker.waitAsync());
    await jest.advanceTimersByTimeAsync(5);
    expect(wait.done).toBe(true);
  });

  it('wakes every wait when a connection settles, and each keeps waiting for the others', async () => {
    const tracker: ConnectingClientTracker = new ConnectingClientTracker({
      idleLimitMs: 100,
      waitLimitMs: 100
    });
    const first: IConnectingClient = tracker.add();
    const second: IConnectingClient = tracker.add();
    const waits: IObservedWait[] = [observe(tracker.waitAsync()), observe(tracker.waitAsync())];
    await jest.advanceTimersByTimeAsync(10);
    first.settle();
    await jest.advanceTimersByTimeAsync(5);
    expect(waits.map((wait: IObservedWait) => wait.done)).toEqual([false, false]);
    second.settle();
    await jest.advanceTimersByTimeAsync(5);
    expect(waits.map((wait: IObservedWait) => wait.done)).toEqual([true, true]);
    expect(jest.getTimerCount()).toBe(0);
  });
});
