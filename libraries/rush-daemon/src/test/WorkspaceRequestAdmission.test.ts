// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  type IDaemonRequestAdmissionOptions,
  MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS
} from '@rushstack/rush-daemon-protocol';

import {
  type IRequestLease,
  RequestExclusivityClass,
  RequestScheduler,
  RequestSchedulerErrorCode
} from '../RequestScheduler';
import { AdmissionProgress, RequestAdmissionController } from '../WorkspaceRequestAdmission';

const DEFAULT_BUDGET: IDaemonRequestAdmissionOptions = { waitTimeoutMs: 100, waitTimeoutIsDefault: true };
const EXPLICIT_BUDGET: IDaemonRequestAdmissionOptions = { waitTimeoutMs: 100 };
const BUDGETS: ReadonlyArray<{ kind: string; budget: IDaemonRequestAdmissionOptions }> = [
  { kind: 'a default', budget: DEFAULT_BUDGET },
  { kind: 'an explicit', budget: EXPLICIT_BUDGET }
];

interface IAcquisition {
  settled: boolean;
  lease?: IRequestLease;
  error?: unknown;
}

function track(promise: Promise<IRequestLease>): IAcquisition {
  const acquisition: IAcquisition = { settled: false };
  promise.then(
    (lease: IRequestLease) => {
      acquisition.settled = true;
      acquisition.lease = lease;
    },
    (error: unknown) => {
      acquisition.settled = true;
      acquisition.error = error;
    }
  );
  return acquisition;
}

function createController(
  admission: IDaemonRequestAdmissionOptions,
  abortSignal: AbortSignal = new AbortController().signal
): RequestAdmissionController {
  return new RequestAdmissionController({ admission, client: { abortSignal }, requestId: 'request' });
}

describe(RequestAdmissionController.name, () => {
  let scheduler: RequestScheduler;
  let owner: IRequestLease;
  let transition: AdmissionProgress;

  beforeEach(async () => {
    jest.useFakeTimers();
    scheduler = new RequestScheduler();
    owner = await scheduler.acquireAsync({ exclusivityClass: RequestExclusivityClass.Exclusive });
    transition = new AdmissionProgress();
  });

  afterEach(() => {
    owner.release();
    jest.useRealTimers();
  });

  it.each(BUDGETS)(
    'does not spend $kind timeout while the transition it waits behind makes progress',
    async ({ budget }) => {
      const controller: RequestAdmissionController = createController(budget);
      transition.setActive(true);
      const waiting: IAcquisition = track(controller.acquireBehindTransitionAsync(scheduler, transition));
      await jest.advanceTimersByTimeAsync(999);
      expect(waiting.settled).toBe(false);

      scheduler.downgradeExclusiveLease(owner, RequestExclusivityClass.SharedBuild);
      transition.setActive(false);
      await jest.advanceTimersByTimeAsync(0);
      expect(waiting.settled).toBe(true);
      expect(waiting.error).toBeUndefined();
      expect(waiting.lease?.exclusivityClass).toBe(RequestExclusivityClass.SharedBuild);
      waiting.lease?.release();
      controller.dispose();
    }
  );

  it.each(BUDGETS)(
    'spends $kind timeout while the transition itself waits, and carries the rest across progress',
    async ({ budget }) => {
      const controller: RequestAdmissionController = createController(budget);
      const waiting: IAcquisition = track(controller.acquireBehindTransitionAsync(scheduler, transition));
      await jest.advanceTimersByTimeAsync(60);
      transition.setActive(true);
      await jest.advanceTimersByTimeAsync(900);
      transition.setActive(false);
      await jest.advanceTimersByTimeAsync(39);
      expect(waiting.settled).toBe(false);

      await jest.advanceTimersByTimeAsync(1);
      expect(waiting.error).toMatchObject({
        code: RequestSchedulerErrorCode.WaitTimeout,
        message:
          "The request was not admitted within its 100ms wait timeout while waiting for another request's load " +
          'or reload of the workspace graph; 0.9s spent while that request loaded the graph did not count. ' +
          'Use --wait-timeout <seconds> to wait longer.'
      });
      expect(scheduler.queuedRequestCount).toBe(0);
      controller.dispose();
    }
  );

  it('fails once the transition it waits behind has made progress for ten times its timeout', async () => {
    const controller: RequestAdmissionController = createController(EXPLICIT_BUDGET);
    transition.setActive(true);
    const waiting: IAcquisition = track(controller.acquireBehindTransitionAsync(scheduler, transition));
    await jest.advanceTimersByTimeAsync(600);
    // Time spent while the transition waits is budget, not paused time, so it does not advance the paused limit.
    transition.setActive(false);
    await jest.advanceTimersByTimeAsync(50);
    transition.setActive(true);
    await jest.advanceTimersByTimeAsync(399);
    expect(waiting.settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    expect(waiting.error).toMatchObject({
      code: RequestSchedulerErrorCode.WaitTimeout,
      message:
        "The request was not admitted within 10 times its 100ms wait timeout because another request's load " +
        'or reload of the workspace graph was still running after 1s. Use --wait-timeout <seconds> to wait longer.'
    });
    expect(scheduler.queuedRequestCount).toBe(0);
    controller.dispose();
  });

  it('limits the paused wait for the largest timeout to the timer range', async () => {
    const client: AbortController = new AbortController();
    const controller: RequestAdmissionController = createController(
      { waitTimeoutMs: MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS },
      client.signal
    );
    transition.setActive(true);
    const waiting: IAcquisition = track(controller.acquireBehindTransitionAsync(scheduler, transition));
    // A delay beyond the timer range would fire after 1ms.
    await jest.advanceTimersByTimeAsync(10_000);
    expect(waiting.settled).toBe(false);

    client.abort();
    await jest.advanceTimersByTimeAsync(0);
    expect(waiting.error).toMatchObject({ code: RequestSchedulerErrorCode.Aborted });
    controller.dispose();
  });

  it('fails at once behind a transition when the request does not wait', async () => {
    const controller: RequestAdmissionController = createController({ noWait: true });
    transition.setActive(true);
    const waiting: IAcquisition = track(controller.acquireBehindTransitionAsync(scheduler, transition));
    await jest.advanceTimersByTimeAsync(0);
    expect(waiting.error).toMatchObject({ code: RequestSchedulerErrorCode.NoWait });
    expect(scheduler.queuedRequestCount).toBe(0);
    controller.dispose();
  });

  it('reports cancellation behind a transition as an abort', async () => {
    const client: AbortController = new AbortController();
    const controller: RequestAdmissionController = createController(DEFAULT_BUDGET, client.signal);
    transition.setActive(true);
    const waiting: IAcquisition = track(controller.acquireBehindTransitionAsync(scheduler, transition));
    client.abort();
    await jest.advanceTimersByTimeAsync(0);
    expect(waiting.error).toMatchObject({ code: RequestSchedulerErrorCode.Aborted });
    expect(scheduler.queuedRequestCount).toBe(0);
    controller.dispose();
  });

  it.each(BUDGETS)(
    'keeps the unspent part of $kind timeout across admitted work for a later admission wait',
    async ({ budget }) => {
      const controller: RequestAdmissionController = createController(budget);
      await jest.advanceTimersByTimeAsync(40);
      const work: Promise<void> = controller.runOutsideWaitBudgetAsync(
        () => new Promise<void>((resolve) => setTimeout(resolve, 10_000))
      );
      await jest.advanceTimersByTimeAsync(10_000);
      await work;
      expect(controller.remainingAdmission).toEqual({ ...budget, waitTimeoutMs: 60 });

      const waiting: IAcquisition = track(
        controller.acquireAsync(scheduler, RequestExclusivityClass.SharedBuild)
      );
      await jest.advanceTimersByTimeAsync(59);
      expect(waiting.settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(waiting.error).toMatchObject({
        code: RequestSchedulerErrorCode.WaitTimeout,
        message:
          'The request was not admitted within its 100ms wait timeout while waiting for workspace admission. ' +
          'Use --wait-timeout <seconds> to wait longer.'
      });
      controller.dispose();
    }
  );
});
