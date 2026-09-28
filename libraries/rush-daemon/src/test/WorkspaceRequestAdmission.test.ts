// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonRequestAdmissionOptions } from '@rushstack/rush-daemon-protocol';

import {
  type IRequestLease,
  RequestExclusivityClass,
  RequestScheduler,
  RequestSchedulerErrorCode
} from '../RequestScheduler';
import { AdmissionProgress, RequestAdmissionController } from '../WorkspaceRequestAdmission';

const DEFAULT_BUDGET: IDaemonRequestAdmissionOptions = { waitTimeoutMs: 100, waitTimeoutIsDefault: true };
const EXPLICIT_BUDGET: IDaemonRequestAdmissionOptions = { waitTimeoutMs: 100 };

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

  it('does not spend a default budget while the transition it waits behind makes progress', async () => {
    const controller: RequestAdmissionController = createController(DEFAULT_BUDGET);
    transition.setActive(true);
    const waiting: IAcquisition = track(controller.acquireBehindTransitionAsync(scheduler, transition));
    await jest.advanceTimersByTimeAsync(10_000);
    expect(waiting.settled).toBe(false);

    scheduler.downgradeExclusiveLease(owner, RequestExclusivityClass.SharedBuild);
    transition.setActive(false);
    await jest.advanceTimersByTimeAsync(0);
    expect(waiting.settled).toBe(true);
    expect(waiting.error).toBeUndefined();
    expect(waiting.lease?.exclusivityClass).toBe(RequestExclusivityClass.SharedBuild);
    waiting.lease?.release();
    controller.dispose();
  });

  it('spends a default budget while the transition itself waits, and carries the rest across progress', async () => {
    const controller: RequestAdmissionController = createController(DEFAULT_BUDGET);
    const waiting: IAcquisition = track(controller.acquireBehindTransitionAsync(scheduler, transition));
    await jest.advanceTimersByTimeAsync(60);
    transition.setActive(true);
    await jest.advanceTimersByTimeAsync(10_000);
    transition.setActive(false);
    await jest.advanceTimersByTimeAsync(39);
    expect(waiting.settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    expect(waiting.error).toMatchObject({
      code: RequestSchedulerErrorCode.WaitTimeout,
      message: expect.stringContaining(
        "not admitted within 100ms while waiting for another request's load or reload of the workspace graph"
      )
    });
    expect(scheduler.queuedRequestCount).toBe(0);
    controller.dispose();
  });

  it('keeps an explicit deadline behind a transition that makes progress', async () => {
    const controller: RequestAdmissionController = createController(EXPLICIT_BUDGET);
    transition.setActive(true);
    const waiting: IAcquisition = track(controller.acquireBehindTransitionAsync(scheduler, transition));
    await jest.advanceTimersByTimeAsync(99);
    expect(waiting.settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    expect(waiting.error).toMatchObject({ code: RequestSchedulerErrorCode.WaitTimeout });
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

  it('keeps an unspent default budget across admitted work for a later admission wait', async () => {
    const controller: RequestAdmissionController = createController(DEFAULT_BUDGET);
    await jest.advanceTimersByTimeAsync(40);
    const work: Promise<void> = controller.runOutsideDefaultBudgetAsync(
      () => new Promise<void>((resolve) => setTimeout(resolve, 10_000))
    );
    await jest.advanceTimersByTimeAsync(10_000);
    await work;
    expect(controller.remainingAdmission).toEqual({ ...DEFAULT_BUDGET, waitTimeoutMs: 60 });

    const waiting: IAcquisition = track(controller.acquireAsync(scheduler, RequestExclusivityClass.SharedBuild));
    await jest.advanceTimersByTimeAsync(59);
    expect(waiting.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(waiting.error).toMatchObject({
      code: RequestSchedulerErrorCode.WaitTimeout,
      message: expect.stringContaining('not admitted within 100ms while waiting for workspace admission')
    });
    controller.dispose();
  });

  it('keeps an explicit deadline running across admitted work', async () => {
    const controller: RequestAdmissionController = createController(EXPLICIT_BUDGET);
    const work: Promise<void> = controller.runOutsideDefaultBudgetAsync(
      () => new Promise<void>((resolve) => setTimeout(resolve, 10_000))
    );
    await jest.advanceTimersByTimeAsync(10_000);
    await work;
    expect(controller.remainingAdmission).toEqual({ waitTimeoutMs: 0 });

    const waiting: IAcquisition = track(controller.acquireAsync(scheduler, RequestExclusivityClass.SharedBuild));
    await jest.advanceTimersByTimeAsync(0);
    expect(waiting.error).toMatchObject({ code: RequestSchedulerErrorCode.WaitTimeout });
    controller.dispose();
  });
});
