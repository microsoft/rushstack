// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  type DaemonRestartReason,
  type IDaemonContinuingOperations,
  type IDaemonRequestAdmissionOptions,
  type IDaemonRequestQueuePositionMessage,
  MAX_DAEMON_REQUEST_WAIT_TIMEOUT_MS
} from '@rushstack/rush-daemon-protocol';

import {
  type IRequestLease,
  RequestExclusivityClass,
  RequestScheduler,
  RequestSchedulerErrorCode
} from '../RequestScheduler';
import {
  AdmissionProgress,
  freezeDaemonRequestAdmissionOptions,
  RequestAdmissionController,
  ServedScriptScheduler
} from '../WorkspaceRequestAdmission';

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

/** Makes `controller` wait `waitMs` behind another request, on a scheduler of its own, and then be admitted. */
async function waitBehindAnotherRequestAsync(
  controller: RequestAdmissionController,
  waitMs: number
): Promise<void> {
  const scheduler: RequestScheduler = new RequestScheduler();
  const other: IRequestLease = await scheduler.acquireAsync({
    exclusivityClass: RequestExclusivityClass.Exclusive
  });
  const waiting: IAcquisition = track(
    controller.acquireAsync(scheduler, RequestExclusivityClass.SharedBuild)
  );
  await jest.advanceTimersByTimeAsync(waitMs);
  expect(waiting.settled).toBe(false);
  other.release();
  await jest.advanceTimersByTimeAsync(0);
  expect(waiting.lease).toBeDefined();
  waiting.lease?.release();
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

  it.each(BUDGETS)(
    'carries what is left of $kind timeout after it waits behind a transition to its later waits',
    async ({ budget }) => {
      const controller: RequestAdmissionController = createController(budget);
      const behind: IAcquisition = track(controller.acquireBehindTransitionAsync(scheduler, transition));
      // The transition itself waits for 30ms, which the request spends, and then loads the graph.
      await jest.advanceTimersByTimeAsync(30);
      transition.setActive(true);
      await jest.advanceTimersByTimeAsync(500);
      scheduler.downgradeExclusiveLease(owner, RequestExclusivityClass.SharedBuild);
      transition.setActive(false);
      await jest.advanceTimersByTimeAsync(0);
      expect(behind.error).toBeUndefined();
      behind.lease?.release();
      expect(controller.remainingAdmission).toEqual({ ...budget, waitTimeoutMs: 70 });
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

  it('reports a zero timeout behind a transition as a plain timeout, not as the paused limit', async () => {
    const controller: RequestAdmissionController = createController({ waitTimeoutMs: 0 });
    transition.setActive(true);
    const waiting: IAcquisition = track(controller.acquireBehindTransitionAsync(scheduler, transition));
    await jest.advanceTimersByTimeAsync(0);
    expect(waiting.error).toMatchObject({
      code: RequestSchedulerErrorCode.WaitTimeout,
      message:
        "The request was not admitted within its 0ms wait timeout while waiting for another request's load or " +
        'reload of the workspace graph. Use --wait-timeout <seconds> to wait longer.'
    });
    expect(scheduler.queuedRequestCount).toBe(0);
    controller.dispose();
  });

  it('reports paused time that did not count when a later boundary times out', async () => {
    const controller: RequestAdmissionController = createController(EXPLICIT_BUDGET);
    transition.setActive(true);
    const behind: IAcquisition = track(controller.acquireBehindTransitionAsync(scheduler, transition));
    await jest.advanceTimersByTimeAsync(500);
    scheduler.downgradeExclusiveLease(owner, RequestExclusivityClass.SharedBuild);
    transition.setActive(false);
    await jest.advanceTimersByTimeAsync(0);
    expect(behind.error).toBeUndefined();
    behind.lease?.release();
    // A routing boundary receives a frozen copy of the remaining budget.
    const remaining: IDaemonRequestAdmissionOptions | undefined = controller.remainingAdmission;
    const boundary: RequestAdmissionController = new RequestAdmissionController({
      admission: remaining && freezeDaemonRequestAdmissionOptions(remaining),
      client: { abortSignal: new AbortController().signal },
      requestId: 'request'
    });

    const here: IAcquisition = track(controller.acquireAsync(scheduler, RequestExclusivityClass.Exclusive));
    const there: IAcquisition = track(boundary.acquireAsync(scheduler, RequestExclusivityClass.Exclusive));
    await jest.advanceTimersByTimeAsync(99);
    expect(here.settled || there.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    const error: { code: RequestSchedulerErrorCode; message: string } = {
      code: RequestSchedulerErrorCode.WaitTimeout,
      message:
        'The request was not admitted within its 100ms wait timeout while waiting for workspace admission; 0.5s ' +
        'spent earlier while another request loaded the workspace graph did not count. ' +
        'Use --wait-timeout <seconds> to wait longer.'
    };
    expect(here.error).toMatchObject(error);
    expect(there.error).toMatchObject(error);
    boundary.dispose();
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
    'spends $kind timeout only while it waits, not on the work before and between its waits',
    async ({ budget }) => {
      const controller: RequestAdmissionController = createController(budget);
      // Such as capturing the request's inputs before its first wait.
      await jest.advanceTimersByTimeAsync(10_000);
      expect(controller.remainingAdmission).toEqual({ ...budget, waitTimeoutMs: 100 });
      await waitBehindAnotherRequestAsync(controller, 40);
      // Such as loading the graph, routing and execution.
      await jest.advanceTimersByTimeAsync(10_000);
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

  it('does not spend a default timeout at the graph-execution gate, which it does not limit', async () => {
    const controller: RequestAdmissionController = createController(DEFAULT_BUDGET);
    const running: IAcquisition = track(
      controller.acquireGraphExecutionAsync(scheduler, RequestExclusivityClass.SharedBuild)
    );
    await jest.advanceTimersByTimeAsync(10_000);
    expect(running.settled).toBe(false);
    owner.release();
    await jest.advanceTimersByTimeAsync(0);
    running.lease?.release();
    expect(controller.remainingAdmission).toEqual({ ...DEFAULT_BUDGET, waitTimeoutMs: 100 });
    controller.dispose();
  });

  it('spends an explicit timeout while it waits for progress of the running build', async () => {
    const controller: RequestAdmissionController = createController(EXPLICIT_BUDGET);
    let makeProgress: (value: string) => void = () => undefined;
    const waiting: Promise<string | undefined> = controller.waitForGraphProgressAsync(
      new Promise<string>((resolve: (value: string) => void) => {
        makeProgress = resolve;
      })
    );
    await jest.advanceTimersByTimeAsync(40);
    makeProgress('dispatched');
    expect(await waiting).toBe('dispatched');
    expect(controller.remainingAdmission).toEqual({ ...EXPLICIT_BUDGET, waitTimeoutMs: 60 });
    controller.dispose();
  });

  it('stops waiting for progress of the running build once an explicit timeout is spent', async () => {
    const controller: RequestAdmissionController = createController(EXPLICIT_BUDGET);
    let ended: boolean = false;
    const waiting: Promise<string | undefined> = controller.waitForGraphProgressAsync(
      new Promise<string>(() => undefined)
    );
    void waiting.then(() => {
      ended = true;
    });
    await jest.advanceTimersByTimeAsync(99);
    expect(ended).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await waiting).toBeUndefined();
    expect(controller.remainingAdmission).toEqual({ ...EXPLICIT_BUDGET, waitTimeoutMs: 0 });

    // The graph-execution gate then has no time left to wait for the build either.
    const running: IAcquisition = track(
      controller.acquireGraphExecutionAsync(scheduler, RequestExclusivityClass.SharedBuild)
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(running.error).toMatchObject({
      code: RequestSchedulerErrorCode.WaitTimeout,
      message:
        'The request was not admitted within its 100ms wait timeout while waiting for the running build of the ' +
        'workspace operation graph. Use --wait-timeout <seconds> to wait longer.'
    });
    controller.dispose();
  });

  it('does not spend a default timeout while it waits for progress of the running build', async () => {
    const controller: RequestAdmissionController = createController(DEFAULT_BUDGET);
    let makeProgress: (value: string) => void = () => undefined;
    const waiting: Promise<string | undefined> = controller.waitForGraphProgressAsync(
      new Promise<string>((resolve: (value: string) => void) => {
        makeProgress = resolve;
      })
    );
    await jest.advanceTimersByTimeAsync(10_000);
    makeProgress('dispatched');
    expect(await waiting).toBe('dispatched');
    expect(controller.remainingAdmission).toEqual({ ...DEFAULT_BUDGET, waitTimeoutMs: 100 });
    controller.dispose();
  });

  it('stops waiting for progress of the running build when the request is cancelled', async () => {
    const client: AbortController = new AbortController();
    const controller: RequestAdmissionController = createController(DEFAULT_BUDGET, client.signal);
    const waiting: Promise<string | undefined> = controller.waitForGraphProgressAsync(
      new Promise<string>(() => undefined)
    );
    const waitingError: Promise<void> = expect(waiting).rejects.toMatchObject({
      code: RequestSchedulerErrorCode.Aborted
    });

    client.abort();
    await jest.advanceTimersByTimeAsync(0);

    await waitingError;
    controller.dispose();
  });

  it('does not wait for progress of the running build when the request does not wait', async () => {
    const controller: RequestAdmissionController = createController({ noWait: true });
    expect(await controller.waitForGraphProgressAsync(new Promise<string>(() => undefined))).toBeUndefined();
    controller.dispose();
  });

  it('names the configured timeout, not the remainder, when a later routing boundary times out', async () => {
    const controller: RequestAdmissionController = createController(EXPLICIT_BUDGET);
    await waitBehindAnotherRequestAsync(controller, 23);
    const remaining: IDaemonRequestAdmissionOptions | undefined = controller.remainingAdmission;
    expect(remaining).toEqual({ ...EXPLICIT_BUDGET, waitTimeoutMs: 77 });
    const boundary: RequestAdmissionController = new RequestAdmissionController({
      admission: remaining,
      client: { abortSignal: new AbortController().signal },
      requestId: 'request'
    });
    await waitBehindAnotherRequestAsync(boundary, 7);
    // A boundary that hands its own remainder on again still names the client's timeout.
    const nested: RequestAdmissionController = new RequestAdmissionController({
      admission: boundary.remainingAdmission,
      client: { abortSignal: new AbortController().signal },
      requestId: 'request'
    });

    const waiting: IAcquisition = track(
      nested.acquireGraphExecutionAsync(scheduler, RequestExclusivityClass.SharedBuild)
    );
    await jest.advanceTimersByTimeAsync(69);
    expect(waiting.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(waiting.error).toMatchObject({
      code: RequestSchedulerErrorCode.WaitTimeout,
      message:
        'The request was not admitted within its 100ms wait timeout while waiting for the running build of the ' +
        'workspace operation graph. Use --wait-timeout <seconds> to wait longer.'
    });
    nested.dispose();
    boundary.dispose();
    controller.dispose();
  });

  it('reports no more running scripts to a request once its wait for them has ended', async () => {
    const scripts: ServedScriptScheduler = new ServedScriptScheduler();
    const [first, second, third]: IRequestLease[] = [
      await scripts.acquireAsync({ exclusivityClass: RequestExclusivityClass.SharedBuild }),
      await scripts.acquireAsync({ exclusivityClass: RequestExclusivityClass.SharedBuild }),
      await scripts.acquireAsync({ exclusivityClass: RequestExclusivityClass.SharedBuild })
    ];
    const restartReason: DaemonRestartReason = {
      kind: 'workspaceInputsChanged',
      installationFiles: ['common/config/rush/pnpm-lock.yaml']
    };
    const positions: IDaemonRequestQueuePositionMessage['payload'][] = [];
    const controller: RequestAdmissionController = new RequestAdmissionController({
      admission: EXPLICIT_BUDGET,
      client: {
        abortSignal: new AbortController().signal,
        supportsRequestAdmission: true,
        writeQueuePositionAsync: async (message: IDaemonRequestQueuePositionMessage) => {
          positions.push(message.payload);
        }
      },
      requestId: 'request'
    });
    const waitingFor = (scriptCount: number): IDaemonRequestQueuePositionMessage['payload'] => ({
      position: scriptCount,
      requestId: 'request',
      restartReason,
      scriptCount
    });

    const waiting: Promise<void> = controller.waitForServedScriptsAsync(scripts, restartReason);
    const ended: Promise<unknown> = waiting.catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(0);
    third.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(positions).toEqual([waitingFor(3), waitingFor(2)]);

    await jest.advanceTimersByTimeAsync(100);
    expect(await ended).toMatchObject({ code: RequestSchedulerErrorCode.WaitTimeout });
    // A script that exits after the wait timed out, while another still runs, is not reported to the request.
    second.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(positions).toEqual([waitingFor(3), waitingFor(2)]);
    first.release();
    controller.dispose();
  });
});

describe('a request that stops the operations that finished requests left running', () => {
  const CONTINUING: IDaemonContinuingOperations = { count: 2, names: ['a (build)', 'b (build)'] };
  const STOPPING: IDaemonContinuingOperations = { ...CONTINUING, stopping: true };

  interface IReportingController {
    readonly controller: RequestAdmissionController;
    readonly positions: IDaemonRequestQueuePositionMessage['payload'][];
  }

  function createReportingController(requestId: string): IReportingController {
    const positions: IDaemonRequestQueuePositionMessage['payload'][] = [];
    const controller: RequestAdmissionController = new RequestAdmissionController({
      admission: {},
      client: {
        abortSignal: new AbortController().signal,
        supportsRequestAdmission: true,
        writeQueuePositionAsync: async (message: IDaemonRequestQueuePositionMessage) => {
          positions.push(message.payload);
        }
      },
      requestId
    });
    return { controller, positions };
  }

  function acquireExclusiveAsync(
    { controller }: IReportingController,
    scheduler: RequestScheduler,
    describeContinuingOperations: () => IDaemonContinuingOperations | undefined
  ): Promise<IRequestLease> {
    return controller.acquireAsync(
      scheduler,
      RequestExclusivityClass.Exclusive,
      undefined,
      describeContinuingOperations
    );
  }

  it('names them as stopping while it waits first in the queue only for leases that are preemptible', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const leftover: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    // Like the work of a failed build that returned early, which is no longer described once it is stopped.
    let continuing: IDaemonContinuingOperations | undefined = CONTINUING;
    scheduler.markLeasePreemptible(leftover, () => (continuing = undefined));
    const describeContinuing = (): IDaemonContinuingOperations | undefined => continuing;

    const rebuild: IReportingController = createReportingController('rebuild');
    const rebuildLease: Promise<IRequestLease> = acquireExclusiveAsync(
      rebuild,
      scheduler,
      describeContinuing
    );
    expect(continuing).toBeUndefined();
    // A later request queues while they stop, so the first one's position is reported again.
    const later: IReportingController = createReportingController('later');
    const laterLease: Promise<IRequestLease> = acquireExclusiveAsync(later, scheduler, describeContinuing);
    leftover.release();
    (await rebuildLease).release();
    (await laterLease).release();

    expect(rebuild.positions).toEqual([
      { position: 1, requestId: 'rebuild', continuingOperations: STOPPING },
      { position: 1, requestId: 'rebuild', continuingOperations: STOPPING }
    ]);
    // The later request waited for the first one, not only while the operations stopped.
    expect(later.positions).toEqual([
      { position: 2, requestId: 'later' },
      { position: 1, requestId: 'later' }
    ]);
    rebuild.controller.dispose();
    later.controller.dispose();
  });

  it('reports a plain position behind a lease that is not preemptible, or if no operation is named', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const leftover: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    const running: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    scheduler.markLeasePreemptible(leftover, () => leftover.release());
    const behindRunning: IReportingController = createReportingController('behind-running');
    const behindRunningLease: Promise<IRequestLease> = acquireExclusiveAsync(
      behindRunning,
      scheduler,
      () => CONTINUING
    );
    running.release();
    (await behindRunningLease).release();
    expect(behindRunning.positions).toEqual([{ position: 1, requestId: 'behind-running' }]);

    const unnamed: IReportingController = createReportingController('unnamed');
    const other: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    scheduler.markLeasePreemptible(other, () => other.release());
    (await acquireExclusiveAsync(unnamed, scheduler, () => undefined)).release();
    expect(unnamed.positions).toEqual([{ position: 1, requestId: 'unnamed' }]);
    behindRunning.controller.dispose();
    unnamed.controller.dispose();
  });

  it('names them as stopping to a request that already waited first when they were left running', async () => {
    const scheduler: RequestScheduler = new RequestScheduler();
    const build: IRequestLease = await scheduler.acquireAsync({
      exclusivityClass: RequestExclusivityClass.SharedBuild
    });
    // Nothing continues yet: the build's client still waits for its result.
    let continuing: IDaemonContinuingOperations | undefined;
    const rebuild: IReportingController = createReportingController('rebuild');
    const rebuildLease: Promise<IRequestLease> = acquireExclusiveAsync(rebuild, scheduler, () => continuing);

    // The build fails early: its result is out, and the operations that it leaves running stop for the rebuild.
    continuing = CONTINUING;
    scheduler.markLeasePreemptible(build, () => (continuing = undefined));
    expect(continuing).toBeUndefined();
    build.release();
    (await rebuildLease).release();

    expect(rebuild.positions).toEqual([
      { position: 1, requestId: 'rebuild' },
      { position: 1, requestId: 'rebuild', continuingOperations: STOPPING }
    ]);
    rebuild.controller.dispose();
  });
});
