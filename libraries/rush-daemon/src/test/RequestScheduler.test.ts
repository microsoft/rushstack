// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  type IRequestLease,
  RequestExclusivityClass,
  RequestScheduler,
  RequestSchedulerErrorCode
} from '../RequestScheduler';

describe('exclusive generation handoff', () => {
  it('atomically downgrades without admitting a queued writer before the initiating reader finishes', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const owner: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    let writerAdmitted: boolean = false;
    const writer: Promise<IRequestLease> = scheduler
      .acquireAsync({
        exclusivityClass: RequestExclusivityClass.Exclusive
      })
      .then((lease) => {
        writerAdmitted = true;
        return lease;
      });
    scheduler.downgradeExclusiveLease(owner, RequestExclusivityClass.SharedBuild);
    expect(owner.exclusivityClass).toBe(RequestExclusivityClass.SharedBuild);
    await Promise.resolve();
    expect(writerAdmitted).toBe(false);
    owner.release();
    const next: IRequestLease = await writer;
    expect(writerAdmitted).toBe(true);
    next.release();
    expect(scheduler.activeRequestCount).toBe(0);
    expect(() => scheduler.downgradeExclusiveLease(owner, RequestExclusivityClass.SharedBuild)).toThrow();
  });
});

describe(RequestScheduler.name, () => {
  it('admits requests from the same shared class concurrently', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();

    const first: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    const second: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });

    expect(scheduler.activeRequestCount).toBe(2);
    expect(scheduler.queuedRequestCount).toBe(0);

    first.release();
    second.release();
  });

  it('serializes different shared classes', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const build: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    let readWasAdmitted: boolean = false;
    const readPromise: Promise<IRequestLease> = scheduler
      .acquireAsync({ exclusivityClass: RequestExclusivityClass.SharedRead })
      .then((lease) => {
        readWasAdmitted = true;
        return lease;
      });

    await Promise.resolve();
    expect(readWasAdmitted).toBe(false);

    build.release();
    const read: IRequestLease = await readPromise;
    read.release();
  });

  it('uses an exclusive request as a FIFO gate', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const executionOrder: string[] = [];
    const activeBuild: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    const exclusivePromise: Promise<IRequestLease> = scheduler
      .acquireAsync({ exclusivityClass: RequestExclusivityClass.Exclusive })
      .then((lease) => {
        executionOrder.push('exclusive');
        return lease;
      });
    const laterBuildPromise: Promise<IRequestLease> = scheduler
      .acquireAsync({ exclusivityClass: RequestExclusivityClass.SharedBuild })
      .then((lease) => {
        executionOrder.push('later build');
        return lease;
      });

    activeBuild.release();
    const exclusive: IRequestLease = await exclusivePromise;
    expect(executionOrder).toEqual(['exclusive']);

    exclusive.release();
    const laterBuild: IRequestLease = await laterBuildPromise;
    expect(executionOrder).toEqual(['exclusive', 'later build']);
    laterBuild.release();
  });

  it('fails immediately when noWait is specified', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const active: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });

    await expect(
      scheduler.acquireAsync({
        exclusivityClass: RequestExclusivityClass.SharedRead,
        noWait: true
      })
    ).rejects.toMatchObject({
      code: RequestSchedulerErrorCode.NoWait
    });

    active.release();
  });

  it('times out a queued request', async () => {
    jest.useFakeTimers();
    const scheduler: RequestScheduler = new RequestScheduler();
    const active: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    const waiting: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedRead,
      waitTimeoutMs: 100
    });

    jest.advanceTimersByTime(100);
    await expect(waiting).rejects.toMatchObject({
      code: RequestSchedulerErrorCode.WaitTimeout
    });
    expect(scheduler.queuedRequestCount).toBe(0);

    active.release();
    jest.useRealTimers();
  });

  it('cancels a queued request without affecting later requests', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const active: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    const abortController: AbortController = new AbortController();
    const cancelled: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedRead,
      abortSignal: abortController.signal
    });
    const laterPromise: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedRead
    });

    abortController.abort();
    await expect(cancelled).rejects.toMatchObject({
      code: RequestSchedulerErrorCode.Aborted
    });

    active.release();
    const later: IRequestLease = await laterPromise;
    later.release();
  });

  it('reports queue positions when the queue changes', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const active: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    const firstPositions: number[] = [];
    const secondPositions: number[] = [];
    const firstPromise: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedRead,
      onQueuePositionChanged: (position) => firstPositions.push(position)
    });
    const secondPromise: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedRead,
      onQueuePositionChanged: (position) => secondPositions.push(position)
    });

    expect(firstPositions).toEqual([1, 1]);
    expect(secondPositions).toEqual([2]);

    active.release();
    const first: IRequestLease = await firstPromise;
    const second: IRequestLease = await secondPromise;
    first.release();
    second.release();
  });

  it('reports every queued request its position again on request, without admitting any', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const active: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    const firstPositions: number[] = [];
    const secondPositions: number[] = [];
    const firstPromise: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedRead,
      onQueuePositionChanged: (position) => firstPositions.push(position)
    });
    const secondPromise: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedRead,
      onQueuePositionChanged: (position) => secondPositions.push(position)
    });

    scheduler.notifyQueuePositions();
    expect(firstPositions).toEqual([1, 1, 1]);
    expect(secondPositions).toEqual([2, 2]);
    expect(scheduler.queuedRequestCount).toBe(2);

    active.release();
    (await firstPromise).release();
    (await secondPromise).release();
  });

  it('continues scheduling when a queue position callback throws', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const active: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    const callbackError: Error = new Error('position callback failed');
    const emitWarningSpy: jest.SpiedFunction<typeof process.emitWarning> = jest
      .spyOn(process, 'emitWarning')
      .mockImplementation(() => undefined);
    const waitingPromise: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedRead,
      onQueuePositionChanged: () => {
        throw callbackError;
      }
    });

    expect(scheduler.queuedRequestCount).toBe(1);
    expect(emitWarningSpy).toHaveBeenCalledWith(callbackError, {
      code: 'RUSH_DAEMON_QUEUE_POSITION_CALLBACK_ERROR'
    });

    active.release();
    const waiting: IRequestLease = await waitingPromise;
    expect(scheduler.activeRequestCount).toBe(1);
    waiting.release();
    expect(scheduler.activeRequestCount).toBe(0);
    emitWarningSpy.mockRestore();
  });

  it('rejects invalid timeout values asynchronously', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();

    await expect(
      scheduler.acquireAsync({
        exclusivityClass: RequestExclusivityClass.SharedRead,
        waitTimeoutMs: 0x80000000
      })
    ).rejects.toThrow(/between 0 and 2147483647/);
  });

  it('releases a lease only once', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const active: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    let admissionCount: number = 0;
    const waitingPromise: Promise<IRequestLease> = scheduler
      .acquireAsync({ exclusivityClass: RequestExclusivityClass.SharedRead })
      .then((lease) => {
        admissionCount++;
        return lease;
      });

    active.release();
    active.release();
    const waiting: IRequestLease = await waitingPromise;

    expect(admissionCount).toBe(1);
    expect(scheduler.activeRequestCount).toBe(1);
    waiting.release();
    waiting.release();
    expect(scheduler.activeRequestCount).toBe(0);
  });
});

describe('admission ahead of the queue', () => {
  it('admits a compatible request ahead of a queued writer that waits for a request admitted in order', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const build: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    const writerPositions: number[] = [];
    let writerAdmitted: boolean = false;
    const writerPromise: Promise<IRequestLease> = scheduler
      .acquireAsync({
        exclusivityClass: RequestExclusivityClass.Exclusive,
        onQueuePositionChanged: (position) => writerPositions.push(position)
      })
      .then((lease) => {
        writerAdmitted = true;
        return lease;
      });

    const script: IRequestLease = await scheduler.acquireAsync({
      admitAheadOfQueue: true,
      exclusivityClass: RequestExclusivityClass.SharedBuild,
      noWait: true
    });
    expect(scheduler.activeRequestCount).toBe(2);
    expect(scheduler.queuedRequestCount).toBe(1);
    expect(writerPositions).toEqual([1]);

    // The writer now waits for the script too, but no longer than for the build.
    build.release();
    await Promise.resolve();
    expect(writerAdmitted).toBe(false);
    script.release();
    const writer: IRequestLease = await writerPromise;
    expect(writerAdmitted).toBe(true);
    writer.release();
    expect(scheduler.activeRequestCount).toBe(0);
  });

  it('forgets a request that it admitted ahead of the queue once that request is released', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    for (let round: number = 0; round < 2; round++) {
      const build: IRequestLease = await scheduler.acquireAsync({
        exclusivityClass: RequestExclusivityClass.SharedBuild
      });
      const writerPromise: Promise<IRequestLease> = scheduler.acquireAsync({
        exclusivityClass: RequestExclusivityClass.Exclusive
      });
      const script: IRequestLease = await scheduler.acquireAsync({
        admitAheadOfQueue: true,
        exclusivityClass: RequestExclusivityClass.SharedBuild,
        noWait: true
      });
      script.release();
      build.release();
      (await writerPromise).release();
    }
    expect(scheduler.activeRequestCount).toBe(0);
  });

  it('queues a request in order once every active request was admitted ahead of the queue', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const build: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    const admissionOrder: string[] = [];
    const writerPromise: Promise<IRequestLease> = scheduler
      .acquireAsync({ exclusivityClass: RequestExclusivityClass.Exclusive })
      .then((lease) => {
        admissionOrder.push('writer');
        return lease;
      });
    const first: IRequestLease = await scheduler.acquireAsync({
      admitAheadOfQueue: true,
      exclusivityClass: RequestExclusivityClass.SharedBuild,
      noWait: true
    });
    build.release();

    // Otherwise a stream of such requests could keep the writer waiting indefinitely.
    await expect(
      scheduler.acquireAsync({
        admitAheadOfQueue: true,
        exclusivityClass: RequestExclusivityClass.SharedBuild,
        noWait: true
      })
    ).rejects.toMatchObject({ code: RequestSchedulerErrorCode.NoWait });
    const secondPositions: number[] = [];
    const secondPromise: Promise<IRequestLease> = scheduler
      .acquireAsync({
        admitAheadOfQueue: true,
        exclusivityClass: RequestExclusivityClass.SharedBuild,
        onQueuePositionChanged: (position) => secondPositions.push(position)
      })
      .then((lease) => {
        admissionOrder.push('second');
        return lease;
      });
    expect(secondPositions).toEqual([2]);

    first.release();
    const writer: IRequestLease = await writerPromise;
    await Promise.resolve();
    expect(admissionOrder).toEqual(['writer']);
    writer.release();
    const second: IRequestLease = await secondPromise;
    expect(admissionOrder).toEqual(['writer', 'second']);
    second.release();
    expect(scheduler.activeRequestCount).toBe(0);
  });

  it.each([
    ['an exclusive request', RequestExclusivityClass.Exclusive],
    ['a request of another shared class', RequestExclusivityClass.SharedRead]
  ])('does not admit a request ahead of the queue while %s is active', async (activeName, activeClass) => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const active: IRequestLease = await scheduler.acquireAsync({ exclusivityClass: activeClass });
    const writerPromise: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });

    await expect(
      scheduler.acquireAsync({
        admitAheadOfQueue: true,
        exclusivityClass: RequestExclusivityClass.SharedBuild,
        noWait: true
      })
    ).rejects.toMatchObject({ code: RequestSchedulerErrorCode.NoWait });

    active.release();
    (await writerPromise).release();
    expect(scheduler.activeRequestCount).toBe(0);
  });

  it('counts a request that it admitted from the queue as admitted in order', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const exclusive: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    const buildPromise: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    exclusive.release();
    const build: IRequestLease = await buildPromise;
    const writerPromise: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });

    const script: IRequestLease = await scheduler.acquireAsync({
      admitAheadOfQueue: true,
      exclusivityClass: RequestExclusivityClass.SharedBuild,
      noWait: true
    });

    script.release();
    build.release();
    (await writerPromise).release();
    expect(scheduler.activeRequestCount).toBe(0);
  });

  it('admits a request that asks to pass the queue in order when nothing is queued', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const script: IRequestLease = await scheduler.acquireAsync({
      admitAheadOfQueue: true,
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    // It was admitted in order, so a later request may pass a writer that waits for it.
    const writerPromise: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    const later: IRequestLease = await scheduler.acquireAsync({
      admitAheadOfQueue: true,
      exclusivityClass: RequestExclusivityClass.SharedBuild,
      noWait: true
    });

    script.release();
    later.release();
    (await writerPromise).release();
    expect(scheduler.activeRequestCount).toBe(0);
  });
});

describe('preemptible leases', () => {
  it('preempts a marked lease once a request that it blocks waits, and only once', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const leftover: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    const running: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    const onPreempted: jest.Mock = jest.fn();
    scheduler.markLeasePreemptible(leftover, onPreempted);

    // A request of the same shared class is admitted alongside it.
    const build: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    expect(onPreempted).not.toHaveBeenCalled();

    const exclusive: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    expect(onPreempted).toHaveBeenCalledTimes(1);
    const read: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedRead
    });
    leftover.release();
    build.release();
    expect(scheduler.queuedRequestCount).toBe(2);
    running.release();
    (await exclusive).release();
    (await read).release();
    expect(onPreempted).toHaveBeenCalledTimes(1);
    expect(scheduler.activeRequestCount).toBe(0);
  });

  it('preempts at once when a blocked request already waits', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const leftover: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    const read: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedRead
    });
    const onPreempted: jest.Mock = jest.fn(() => leftover.release());

    scheduler.markLeasePreemptible(leftover, onPreempted);

    expect(onPreempted).toHaveBeenCalledTimes(1);
    (await read).release();
    expect(scheduler.activeRequestCount).toBe(0);
  });

  it('forgets the mark when the lease is released and rejects marking an inactive lease', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const lease: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    const onPreempted: jest.Mock = jest.fn();
    scheduler.markLeasePreemptible(lease, onPreempted);
    lease.release();

    const other: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    const exclusive: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive
    });
    other.release();
    (await exclusive).release();

    expect(onPreempted).not.toHaveBeenCalled();
    expect(() => scheduler.markLeasePreemptible(lease, onPreempted)).toThrow(
      'Only an active lease from this scheduler can be marked preemptible.'
    );
    expect(() => new RequestScheduler().markLeasePreemptible(other, onPreempted)).toThrow();
  });

  it('reports a failing preemption callback as a warning and keeps scheduling', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const warningSpy: jest.SpyInstance = jest.spyOn(process, 'emitWarning').mockImplementation(() => {});
    try {
      const lease: IRequestLease = await scheduler.acquireAsync({
        exclusivityClass: RequestExclusivityClass.SharedBuild
      });
      scheduler.markLeasePreemptible(lease, () => {
        throw new Error('preemption failed');
      });
      const exclusive: Promise<IRequestLease> = scheduler.acquireAsync({
        exclusivityClass: RequestExclusivityClass.Exclusive
      });

      expect(warningSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'preemption failed' }), {
        code: 'RUSH_DAEMON_LEASE_PREEMPTION_CALLBACK_ERROR'
      });
      lease.release();
      (await exclusive).release();
      expect(scheduler.activeRequestCount).toBe(0);
    } finally {
      warningSpy.mockRestore();
    }
  });

  it('preempts marked leases on request and resolves once they are released', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const leftover: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    const running: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    const onPreempted: jest.Mock = jest.fn();
    scheduler.markLeasePreemptible(leftover, onPreempted);
    const released: string[] = [];

    void scheduler.preemptLeasesAsync().then(() => released.push('first'));
    expect(onPreempted).toHaveBeenCalledTimes(1);
    // A later caller also waits for the lease that is stopping, without preempting it again.
    void scheduler.preemptLeasesAsync().then(() => released.push('second'));
    expect(onPreempted).toHaveBeenCalledTimes(1);
    expect(scheduler.queuedRequestCount).toBe(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(released).toEqual([]);

    leftover.release();
    await new Promise((resolve) => setImmediate(resolve));
    expect(released).toEqual(['first', 'second']);
    // The lease that is not preemptible stays active, and with no preemptible lease the call resolves at once.
    expect(scheduler.activeRequestCount).toBe(1);
    await expect(scheduler.preemptLeasesAsync()).resolves.toBeUndefined();
    running.release();
  });

  it('waits for a lease whose preemption callback releases it at once', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const leftover: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    scheduler.markLeasePreemptible(leftover, () => leftover.release());

    await scheduler.preemptLeasesAsync();
    expect(scheduler.activeRequestCount).toBe(0);
  });

  it('tells whether every active lease is preemptible or preempted, before it preempts them (task 345)', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    expect(scheduler.activeLeasesArePreemptible).toBe(false);
    const leftover: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    expect(scheduler.activeLeasesArePreemptible).toBe(false);
    const onPreempted: jest.Mock = jest.fn();
    scheduler.markLeasePreemptible(leftover, onPreempted);
    expect(scheduler.activeLeasesArePreemptible).toBe(true);
    const running: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    expect(scheduler.activeLeasesArePreemptible).toBe(false);
    running.release();
    expect(scheduler.activeLeasesArePreemptible).toBe(true);

    // A request that cannot be admitted alongside the lease is told its position before the lease is preempted.
    const reports: [number, boolean, number][] = [];
    const exclusive: Promise<IRequestLease> = scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.Exclusive,
      onQueuePositionChanged: (position: number) =>
        reports.push([position, scheduler.activeLeasesArePreemptible, onPreempted.mock.calls.length])
    });
    expect(reports).toEqual([[1, true, 0]]);
    expect(onPreempted).toHaveBeenCalledTimes(1);
    // While the preempted lease stops, the request waits only for it.
    expect(scheduler.activeLeasesArePreemptible).toBe(true);
    leftover.release();
    const admitted: IRequestLease = await exclusive;
    expect(scheduler.activeLeasesArePreemptible).toBe(false);
    admitted.release();
    expect(scheduler.activeLeasesArePreemptible).toBe(false);
  });
});
