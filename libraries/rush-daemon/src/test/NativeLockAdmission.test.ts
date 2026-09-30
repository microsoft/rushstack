// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IDaemonNativeLockHolder,
  IDaemonRequestAdmissionOptions,
  IDaemonRequestQueuePositionMessage
} from '@rushstack/rush-daemon-protocol';

import {
  type IRequestLease,
  RequestExclusivityClass,
  RequestScheduler,
  RequestSchedulerErrorCode
} from '../RequestScheduler';
import { AdmissionProgress, RequestAdmissionController } from '../WorkspaceRequestAdmission';

const HOLDER: IDaemonNativeLockHolder = { pid: 4242, command: 'rush install' };
const POLL_MS: number = 250;

interface ITestLock {
  released: boolean;
  release(): void;
}

interface IAcquisition {
  settled: boolean;
  lock?: ITestLock;
  error?: unknown;
}

/** Stands in for native Rush's repository lock, and for the process that holds it. */
class NativeLockProbe {
  public attempts: number = 0;
  public readonly lock: ITestLock = {
    released: false,
    release(): void {
      this.released = true;
    }
  };
  #free: boolean = false;
  #holder: IDaemonNativeLockHolder = HOLDER;

  public readonly tryAcquire = (): ITestLock | undefined => {
    this.attempts++;
    return this.#free ? this.lock : undefined;
  };

  public readonly findHolder = (): IDaemonNativeLockHolder => this.#holder;

  /** Another Rush process holds the lock, and `holder` is what can be found out about it. */
  public hold(holder: IDaemonNativeLockHolder = HOLDER): void {
    this.#free = false;
    this.#holder = holder;
  }

  /** The Rush process that held the lock exits. */
  public free(): void {
    this.#free = true;
  }
}

interface ITestController {
  readonly controller: RequestAdmissionController;
  readonly messages: IDaemonRequestQueuePositionMessage[];
}

function createController(
  admission: IDaemonRequestAdmissionOptions | undefined,
  abortSignal: AbortSignal = new AbortController().signal,
  writeQueuePositionAsync?: (message: IDaemonRequestQueuePositionMessage) => Promise<void>
): ITestController {
  const messages: IDaemonRequestQueuePositionMessage[] = [];
  const controller: RequestAdmissionController = new RequestAdmissionController({
    admission,
    client: {
      abortSignal,
      supportsRequestAdmission: true,
      writeQueuePositionAsync:
        writeQueuePositionAsync ??
        (async (message: IDaemonRequestQueuePositionMessage) => {
          messages.push(message);
        })
    },
    requestId: 'request'
  });
  return { controller, messages };
}

function track(promise: Promise<ITestLock>): IAcquisition {
  const acquisition: IAcquisition = { settled: false };
  promise.then(
    (lock: ITestLock) => {
      acquisition.settled = true;
      acquisition.lock = lock;
    },
    (error: unknown) => {
      acquisition.settled = true;
      acquisition.error = error;
    }
  );
  return acquisition;
}

function waitMessage(nativeLockHolder: IDaemonNativeLockHolder): IDaemonRequestQueuePositionMessage {
  return { kind: 'queuePosition', payload: { position: 1, requestId: 'request', nativeLockHolder } };
}

function positionMessage(
  position: number,
  nativeLockHolder?: IDaemonNativeLockHolder
): IDaemonRequestQueuePositionMessage {
  return {
    kind: 'queuePosition',
    payload: { position, requestId: 'request', ...(nativeLockHolder && { nativeLockHolder }) }
  };
}

interface IAdmission {
  settled: boolean;
  lease?: IRequestLease;
  error?: unknown;
}

function trackAdmission(promise: Promise<IRequestLease | undefined>): IAdmission {
  const admission: IAdmission = { settled: false };
  promise.then(
    (lease: IRequestLease | undefined) => {
      admission.settled = true;
      admission.lease = lease;
    },
    (error: unknown) => {
      admission.settled = true;
      admission.error = error;
    }
  );
  return admission;
}

describe(`${RequestAdmissionController.name} and native Rush's repository lock`, () => {
  let probe: NativeLockProbe;

  beforeEach(() => {
    jest.useFakeTimers();
    probe = new NativeLockProbe();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('takes the lock at once when no other Rush process holds it', async () => {
    const { controller, messages } = createController({ waitTimeoutMs: 1000 });
    probe.free();
    await expect(controller.acquireNativeLockAsync(probe.tryAcquire, probe.findHolder)).resolves.toBe(
      probe.lock
    );
    expect(probe.attempts).toBe(1);
    expect(messages).toEqual([]);
    expect(controller.remainingAdmission?.waitTimeoutMs).toBe(1000);
  });

  it('waits for another Rush process to release the lock, and tells the client which process holds it', async () => {
    const { controller, messages } = createController({ waitTimeoutMs: 5000 });
    const acquisition: IAcquisition = track(
      controller.acquireNativeLockAsync(probe.tryAcquire, probe.findHolder)
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(messages).toEqual([waitMessage(HOLDER)]);
    await jest.advanceTimersByTimeAsync(4 * POLL_MS);
    expect(acquisition.settled).toBe(false);
    expect(probe.attempts).toBe(5);

    probe.free();
    await jest.advanceTimersByTimeAsync(POLL_MS);
    expect(acquisition).toEqual({ settled: true, lock: probe.lock });
    expect(probe.attempts).toBe(6);
    expect(messages).toEqual([waitMessage(HOLDER)]);
    // The wait counts against the request's wait timeout, like waiting for another request does.
    expect(controller.remainingAdmission?.waitTimeoutMs).toBe(5000 - 5 * POLL_MS);
  });

  it('fails when its wait timeout runs out, naming the process that holds the lock', async () => {
    const { controller } = createController({ waitTimeoutMs: 1000 });
    const acquisition: IAcquisition = track(
      controller.acquireNativeLockAsync(probe.tryAcquire, probe.findHolder)
    );
    await jest.advanceTimersByTimeAsync(999);
    expect(acquisition.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(acquisition.error).toMatchObject({
      code: RequestSchedulerErrorCode.WaitTimeout,
      message:
        'The request was not admitted within its 1000ms wait timeout while waiting for another Rush process ' +
        "(PID 4242: rush install) to release this repository's lock. Use --wait-timeout <seconds> to wait longer."
    });
    // It tried once more at the end of its wait.
    expect(probe.attempts).toBe(5);
    expect(probe.lock.released).toBe(false);
    expect(controller.remainingAdmission?.waitTimeoutMs).toBe(0);
  });

  it('fails at once for a zero wait timeout, naming the process that holds the lock', async () => {
    const { controller, messages } = createController({ waitTimeoutMs: 0 });
    await expect(controller.acquireNativeLockAsync(probe.tryAcquire, probe.findHolder)).rejects.toMatchObject(
      {
        code: RequestSchedulerErrorCode.WaitTimeout,
        message:
          'The request cannot be admitted immediately because another Rush process (PID 4242: rush install) ' +
          "holds this repository's lock. Use --wait-timeout <seconds> to wait for it."
      }
    );
    expect(probe.attempts).toBe(1);
    // A request that does not wait does not say that it waits.
    expect(messages).toEqual([]);
  });

  it('fails at once with --no-wait, naming the process that holds the lock', async () => {
    const { controller, messages } = createController({ noWait: true });
    await expect(controller.acquireNativeLockAsync(probe.tryAcquire, probe.findHolder)).rejects.toMatchObject(
      {
        code: RequestSchedulerErrorCode.NoWait,
        message:
          'The request cannot be admitted immediately because another Rush process (PID 4242: rush install) ' +
          "holds this repository's lock, and --no-wait was specified."
      }
    );
    expect(probe.attempts).toBe(1);
    expect(messages).toEqual([]);
  });

  it('names the timeout that the client asked for when an earlier wait spent part of it', async () => {
    const { controller: earlier } = createController({ waitTimeoutMs: 1000 });
    const first: IAcquisition = track(earlier.acquireNativeLockAsync(probe.tryAcquire, probe.findHolder));
    await jest.advanceTimersByTimeAsync(POLL_MS);
    probe.free();
    await jest.advanceTimersByTimeAsync(POLL_MS);
    expect(first.lock).toBe(probe.lock);
    probe.hold();
    const { controller: later } = createController(earlier.remainingAdmission);
    const second: IAcquisition = track(later.acquireNativeLockAsync(probe.tryAcquire, probe.findHolder));
    await jest.advanceTimersByTimeAsync(499);
    expect(second.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(second.error).toMatchObject({
      code: RequestSchedulerErrorCode.WaitTimeout,
      message: expect.stringContaining(
        'not admitted within its 1000ms wait timeout while waiting for another'
      )
    });
  });

  it('stops waiting as soon as the request is aborted, and does not try the lock again', async () => {
    const abortController: AbortController = new AbortController();
    const { controller } = createController({ waitTimeoutMs: 5000 }, abortController.signal);
    const acquisition: IAcquisition = track(
      controller.acquireNativeLockAsync(probe.tryAcquire, probe.findHolder)
    );
    await jest.advanceTimersByTimeAsync(POLL_MS + 50);
    const attempts: number = probe.attempts;
    abortController.abort();
    await jest.advanceTimersByTimeAsync(0);
    expect(acquisition.error).toMatchObject({ code: RequestSchedulerErrorCode.Aborted });
    probe.free();
    await jest.advanceTimersByTimeAsync(10 * POLL_MS);
    expect(probe.attempts).toBe(attempts);
    expect(probe.lock.released).toBe(false);
  });

  it('waits without a limit when the request has no wait timeout', async () => {
    const { controller } = createController(undefined);
    const acquisition: IAcquisition = track(
      controller.acquireNativeLockAsync(probe.tryAcquire, probe.findHolder)
    );
    await jest.advanceTimersByTimeAsync(60_000);
    expect(acquisition.settled).toBe(false);
    probe.free();
    await jest.advanceTimersByTimeAsync(POLL_MS);
    expect(acquisition.lock).toBe(probe.lock);
  });

  it('tells the client again only when another process holds the lock, and never forgets a known holder', async () => {
    const { controller, messages } = createController({ waitTimeoutMs: 5000 });
    track(controller.acquireNativeLockAsync(probe.tryAcquire, probe.findHolder));
    await jest.advanceTimersByTimeAsync(POLL_MS);
    // The holder released the lock, and no live process holds it at the moment.
    probe.hold({});
    await jest.advanceTimersByTimeAsync(POLL_MS);
    probe.hold({ pid: 5151 });
    await jest.advanceTimersByTimeAsync(2 * POLL_MS);
    expect(messages).toEqual([waitMessage(HOLDER), waitMessage({ pid: 5151 })]);
  });

  it('keeps the command of a holder that exits, since it holds the lock until it is reaped', async () => {
    const { controller, messages } = createController({ waitTimeoutMs: 1000 });
    const acquisition: IAcquisition = track(
      controller.acquireNativeLockAsync(probe.tryAcquire, probe.findHolder)
    );
    await jest.advanceTimersByTimeAsync(POLL_MS);
    // Its command can no longer be read.
    probe.hold({ pid: HOLDER.pid });
    await jest.advanceTimersByTimeAsync(1000 - POLL_MS);
    expect({ messages, error: acquisition.error }).toMatchObject({
      messages: [waitMessage(HOLDER)],
      error: {
        code: RequestSchedulerErrorCode.WaitTimeout,
        message: expect.stringContaining(
          "another Rush process (PID 4242: rush install) to release this repository's"
        )
      }
    });
  });

  it('tells the client the command of the process that holds the lock once the command can be read', async () => {
    // At first its command cannot be read.
    probe.hold({ pid: HOLDER.pid });
    const { controller, messages } = createController({ waitTimeoutMs: 1000 });
    const acquisition: IAcquisition = track(
      controller.acquireNativeLockAsync(probe.tryAcquire, probe.findHolder)
    );
    await jest.advanceTimersByTimeAsync(POLL_MS);
    probe.hold();
    await jest.advanceTimersByTimeAsync(1000 - POLL_MS);
    expect({ messages, error: acquisition.error }).toMatchObject({
      messages: [waitMessage({ pid: HOLDER.pid }), waitMessage(HOLDER)],
      error: {
        code: RequestSchedulerErrorCode.WaitTimeout,
        message: expect.stringContaining(
          "another Rush process (PID 4242: rush install) to release this repository's"
        )
      }
    });
  });

  it('names another Rush process when it cannot tell which process holds the lock', async () => {
    probe.hold({});
    const { controller, messages } = createController({ waitTimeoutMs: POLL_MS });
    const acquisition: IAcquisition = track(
      controller.acquireNativeLockAsync(probe.tryAcquire, probe.findHolder)
    );
    await jest.advanceTimersByTimeAsync(POLL_MS);
    expect(messages).toEqual([waitMessage({})]);
    expect(acquisition.error).toMatchObject({
      message:
        'The request was not admitted within its 250ms wait timeout while waiting for another Rush process ' +
        "to release this repository's lock. Use --wait-timeout <seconds> to wait longer."
    });
  });

  it('releases the lock that it took when the client could not be told about the wait', async () => {
    let rejectWrite: (error: Error) => void = () => undefined;
    const { controller } = createController(
      { waitTimeoutMs: 5000 },
      undefined,
      () =>
        new Promise<void>((resolve, reject) => {
          rejectWrite = reject;
        })
    );
    const acquisition: IAcquisition = track(
      controller.acquireNativeLockAsync(probe.tryAcquire, probe.findHolder)
    );
    probe.free();
    await jest.advanceTimersByTimeAsync(POLL_MS);
    expect(probe.attempts).toBe(2);
    expect(acquisition.settled).toBe(false);
    const writeError: Error = new Error('The client disconnected.');
    rejectWrite(writeError);
    await jest.advanceTimersByTimeAsync(0);
    expect(acquisition.error).toBe(writeError);
    expect(probe.lock.released).toBe(true);
  });
});

describe(`${RequestAdmissionController.name} behind a graph transition that waits for the lock`, () => {
  let probe: NativeLockProbe;
  let scheduler: RequestScheduler;
  let ownerLease: IRequestLease;
  let transition: AdmissionProgress;

  beforeEach(async () => {
    jest.useFakeTimers();
    probe = new NativeLockProbe();
    scheduler = new RequestScheduler();
    ownerLease = await scheduler.acquireAsync({ exclusivityClass: RequestExclusivityClass.Exclusive });
    transition = new AdmissionProgress();
  });

  afterEach(() => {
    ownerLease.release();
    jest.useRealTimers();
  });

  /** The owner of the transition, which holds the gate, waits for the lock. */
  function waitForLock(owner: ITestController): IAcquisition {
    return track(owner.controller.acquireNativeLockAsync(probe.tryAcquire, probe.findHolder, transition));
  }

  it('tells the requests that wait behind it which process it waits for, until it takes the lock', async () => {
    const owner: ITestController = createController(undefined);
    const first: ITestController = createController({ waitTimeoutMs: 60_000 });
    const second: ITestController = createController(undefined);
    const firstAdmission: IAdmission = trackAdmission(
      first.controller.acquireBehindTransitionAsync(scheduler, transition)
    );
    const secondAdmission: IAdmission = trackAdmission(
      second.controller.acquireBehindTransitionAsync(scheduler, transition)
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(first.messages).toEqual([positionMessage(1), positionMessage(1)]);
    expect(second.messages).toEqual([positionMessage(2)]);

    const lock: IAcquisition = waitForLock(owner);
    await jest.advanceTimersByTimeAsync(0);
    expect(owner.messages).toEqual([waitMessage(HOLDER)]);
    expect(transition.nativeLockHolder).toEqual(HOLDER);
    expect(first.messages.slice(2)).toEqual([positionMessage(1, HOLDER)]);
    expect(second.messages.slice(1)).toEqual([positionMessage(2, HOLDER)]);

    // Another process takes the lock before the reload does.
    await jest.advanceTimersByTimeAsync(2 * POLL_MS);
    probe.hold({ pid: 5151 });
    await jest.advanceTimersByTimeAsync(POLL_MS);
    expect(first.messages.slice(3)).toEqual([positionMessage(1, { pid: 5151 })]);
    expect(second.messages.slice(2)).toEqual([positionMessage(2, { pid: 5151 })]);

    probe.free();
    await jest.advanceTimersByTimeAsync(POLL_MS);
    expect(lock).toEqual({ settled: true, lock: probe.lock });
    expect(transition.nativeLockHolder).toBeUndefined();
    // They still wait behind the transition, but no longer for another process.
    expect(first.messages.slice(4)).toEqual([positionMessage(1)]);
    expect(second.messages.slice(3)).toEqual([positionMessage(2)]);
    expect(owner.messages).toEqual([waitMessage(HOLDER), waitMessage({ pid: 5151 })]);
    expect(firstAdmission.settled).toBe(false);
    expect(secondAdmission.settled).toBe(false);

    const messageCounts: number[] = [first.messages.length, second.messages.length];
    ownerLease.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(firstAdmission.lease?.exclusivityClass).toBe(RequestExclusivityClass.SharedBuild);
    expect(secondAdmission.lease?.exclusivityClass).toBe(RequestExclusivityClass.SharedBuild);
    expect([first.messages.length, second.messages.length]).toEqual(messageCounts);

    // A later wait for the lock, by the owner of the next transition, is nothing to the requests admitted already.
    probe.hold({ pid: 6161 });
    const nextLock: IAcquisition = waitForLock(owner);
    await jest.advanceTimersByTimeAsync(0);
    expect(transition.nativeLockHolder).toEqual({ pid: 6161 });
    expect([first.messages.length, second.messages.length]).toEqual(messageCounts);
    probe.free();
    await jest.advanceTimersByTimeAsync(POLL_MS);
    expect(nextLock.lock).toBe(probe.lock);
    firstAdmission.lease?.release();
    secondAdmission.lease?.release();
    for (const { controller } of [owner, first, second]) controller.dispose();
  });

  it('names the process to a request that starts waiting behind it while it waits for the lock', async () => {
    const owner: ITestController = createController(undefined);
    const lock: IAcquisition = waitForLock(owner);
    await jest.advanceTimersByTimeAsync(POLL_MS);
    const late: ITestController = createController({ waitTimeoutMs: 60_000 });
    const lateAdmission: IAdmission = trackAdmission(
      late.controller.acquireBehindTransitionAsync(scheduler, transition)
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(late.messages).toEqual([positionMessage(1, HOLDER)]);

    probe.free();
    await jest.advanceTimersByTimeAsync(POLL_MS);
    expect(lock.lock).toBe(probe.lock);
    expect(late.messages).toEqual([positionMessage(1, HOLDER), positionMessage(1)]);
    ownerLease.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(lateAdmission.lease).toBeDefined();
    lateAdmission.lease?.release();
    owner.controller.dispose();
    late.controller.dispose();
  });

  it('names the process in the timeout of a request that waits behind it', async () => {
    const owner: ITestController = createController(undefined);
    const follower: ITestController = createController({ waitTimeoutMs: 2000 });
    const admission: IAdmission = trackAdmission(
      follower.controller.acquireBehindTransitionAsync(scheduler, transition)
    );
    // The owner loads the graph first, which does not count against the follower's timeout.
    transition.setActive(true);
    await jest.advanceTimersByTimeAsync(900);
    transition.setActive(false);
    waitForLock(owner);
    await jest.advanceTimersByTimeAsync(1999);
    expect(admission.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(admission.error).toMatchObject({
      code: RequestSchedulerErrorCode.WaitTimeout,
      message:
        "The request was not admitted within its 2000ms wait timeout while waiting for another request's load " +
        'or reload of the workspace graph, which waits for another Rush process (PID 4242: rush install) to ' +
        "release this repository's lock; 0.9s spent while that request loaded the graph did not count. " +
        'Use --wait-timeout <seconds> to wait longer.'
    });
    expect(follower.messages).toEqual([positionMessage(1), positionMessage(1, HOLDER)]);
    owner.controller.dispose();
    follower.controller.dispose();
  });

  it('does not name the process in a later timeout once it has taken the lock', async () => {
    const owner: ITestController = createController(undefined);
    const follower: ITestController = createController({ waitTimeoutMs: 2000 });
    const admission: IAdmission = trackAdmission(
      follower.controller.acquireBehindTransitionAsync(scheduler, transition)
    );
    const lock: IAcquisition = waitForLock(owner);
    await jest.advanceTimersByTimeAsync(4 * POLL_MS);
    probe.free();
    await jest.advanceTimersByTimeAsync(POLL_MS);
    expect(lock.lock).toBe(probe.lock);
    await jest.advanceTimersByTimeAsync(2000 - 5 * POLL_MS - 1);
    expect(admission.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(admission.error).toMatchObject({
      code: RequestSchedulerErrorCode.WaitTimeout,
      message:
        "The request was not admitted within its 2000ms wait timeout while waiting for another request's load " +
        'or reload of the workspace graph. Use --wait-timeout <seconds> to wait longer.'
    });
    expect(follower.messages).toEqual([positionMessage(1), positionMessage(1, HOLDER), positionMessage(1)]);
    owner.controller.dispose();
    follower.controller.dispose();
  });

  it('does not name the process to a script that stopped waiting to pass it', async () => {
    const owner: ITestController = createController(undefined);
    const script: ITestController = createController({ waitTimeoutMs: 60_000 });
    const stopWaiting: AbortController = new AbortController();
    const admission: IAdmission = trackAdmission(
      script.controller.acquireBehindTransitionAsync(scheduler, transition, false, stopWaiting.signal)
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(script.messages).toEqual([positionMessage(1)]);

    // As the lifecycle does: the passage opens, and then the owner waits for the lock in the same turn.
    stopWaiting.abort();
    waitForLock(owner);
    await jest.advanceTimersByTimeAsync(0);
    expect(admission).toEqual({ settled: true, lease: undefined });
    expect(owner.messages).toEqual([waitMessage(HOLDER)]);
    expect(script.messages).toEqual([positionMessage(1)]);
    owner.controller.dispose();
    script.controller.dispose();
  });
});
