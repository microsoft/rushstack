// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';
import type { IDaemonPhasedRequest, IDaemonPhasedRequestResult } from '@rushstack/rush-daemon-protocol';
import { type IOperationRunnerContext, OperationStatus } from '@microsoft/rush-lib';

import { PhasedRequestRouter } from '../PhasedRequestRouter';
import {
  TEST_ENGINE_SHAPE,
  TestOperationRunner,
  TestPhasedRequestClient,
  createRoutingFixture
} from './PhasedRequestRouterTestUtilities';
import type { ITestRoutingFixture } from './PhasedRequestRouterTestUtilities';

const OPERATION_A: string = 'project-a (_phase:test)';
const OPERATION_B: string = 'project-b (_phase:test)';
const OPERATION_C: string = 'project-c (_phase:test)';
const OPERATION_D: string = 'project-d (_phase:test)';
const PROMPT_CANCELLATION_MS: number = 1000;
const TIMED_OUT: 'timed out' = 'timed out';

async function raceWithTimeoutAsync<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T | typeof TIMED_OUT> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function createRequest(requestId: string, operationId: string): IDaemonPhasedRequest {
  return {
    commandName: 'build',
    commandOrigin: 'built-in',
    engineShape: TEST_ENGINE_SHAPE,
    environment: {},
    operationSelection: [{ enabledState: true, operationId }],
    requestId
  };
}

interface IHangingOperation {
  readonly started: Promise<void>;
  readonly terminated: Promise<void>;
  readonly signals: AbortSignal[];
  readonly release: () => void;
}

/**
 * An operation that only finishes when released, or when its hard-abort signal fires (like a killed process), unless
 * it ignores that signal.
 */
function createHangingOperation(ignoresTermination: boolean = false): {
  hanging: IHangingOperation;
  actionAsync: (terminal: ITerminal, context: IOperationRunnerContext) => Promise<OperationStatus | void>;
} {
  let onStarted: () => void = () => undefined;
  let onTerminated: () => void = () => undefined;
  let release: () => void = () => undefined;
  const released: Promise<void> = new Promise<void>((resolve) => (release = resolve));
  const signals: AbortSignal[] = [];
  const hanging: IHangingOperation = {
    started: new Promise<void>((resolve) => (onStarted = resolve)),
    terminated: new Promise<void>((resolve) => (onTerminated = resolve)),
    signals,
    release: () => release()
  };
  const actionAsync = async (
    terminal: ITerminal,
    context: IOperationRunnerContext
  ): Promise<OperationStatus | void> => {
    const { abortSignal } = context;
    if (!abortSignal) throw new Error('Expected a hard-abort signal for daemon operations.');
    signals.push(abortSignal);
    onStarted();
    const aborted: Promise<void> = new Promise<void>((resolve) =>
      abortSignal.addEventListener('abort', () => resolve(), { once: true })
    );
    await (ignoresTermination ? released : Promise.race([aborted, released]));
    if (abortSignal.aborted && !ignoresTermination) {
      onTerminated();
      return OperationStatus.Aborted;
    }
  };
  return { hanging, actionAsync };
}

function createFixture(
  actionAsync: (terminal: ITerminal, context: IOperationRunnerContext) => Promise<OperationStatus | void>
): ITestRoutingFixture {
  return createRoutingFixture(
    new Map([
      [OPERATION_A, new TestOperationRunner(OPERATION_A, OperationStatus.Success, actionAsync)],
      [OPERATION_B, new TestOperationRunner(OPERATION_B)]
    ]),
    [],
    { supportsTerminateRunning: true }
  );
}

interface IUpstreamFixFixture {
  readonly fixture: ITestRoutingFixture;
  readonly hanging: IHangingOperation;
  /** Changes A, which then runs until it is released, or terminated unless it ignores that. C stays up to date. */
  readonly changeA: () => void;
}

/**
 * B and D depend on A, and D also depends on C. B fails until A is changed, like a downstream error that is fixed
 * in the upstream project. After `changeA()`, the warm graph skips C as unchanged.
 */
function createUpstreamFixFixture(ignoresTermination: boolean = false): IUpstreamFixFixture {
  const { hanging, actionAsync: hangingActionAsync } = createHangingOperation(ignoresTermination);
  let changed: boolean = false;
  const fixture: ITestRoutingFixture = createRoutingFixture(
    new Map([
      [
        OPERATION_A,
        new TestOperationRunner(OPERATION_A, OperationStatus.Success, async (terminal, context) =>
          changed ? await hangingActionAsync(terminal, context) : undefined
        )
      ],
      [
        OPERATION_B,
        new TestOperationRunner(OPERATION_B, OperationStatus.Success, async () =>
          changed ? undefined : OperationStatus.Failure
        )
      ],
      [OPERATION_C, new TestOperationRunner(OPERATION_C)],
      [OPERATION_D, new TestOperationRunner(OPERATION_D)]
    ]),
    [
      [OPERATION_B, OPERATION_A],
      [OPERATION_D, OPERATION_A],
      [OPERATION_D, OPERATION_C]
    ],
    { supportsTerminateRunning: true }
  );
  // A and C start together, so C is skipped while A runs.
  fixture.graph.parallelism = 2;
  fixture.graph.hooks.configureIteration.tap('unchanged C', (records) => {
    for (const record of records.values()) {
      if (changed && record.operation.name === OPERATION_C) {
        record.enabled = false;
      }
    }
  });
  const changeA = (): void => {
    changed = true;
    fixture.session.operationGraph.invalidateOperations([fixture.operations.get(OPERATION_A)!], 'changed');
  };
  return { fixture, hanging, changeA };
}

function getStatuses(result: IDaemonPhasedRequestResult): Record<string, string> {
  return Object.fromEntries(
    result.operationResults.map(({ operationId, status }) => [operationId, status] as const)
  );
}

describe('phased request client cancellation', () => {
  it('terminates running operations when the last client cancels and releases the graph promptly', async () => {
    const { hanging, actionAsync } = createHangingOperation();
    const fixture: ITestRoutingFixture = createFixture(actionAsync);
    const abortSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'abortCurrentIterationAsync');
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const client: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const cancelled: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('cancelled', OPERATION_A),
      client
    );
    await hanging.started;

    const cancelledAt: number = Date.now();
    client.abortController.abort();
    const result: IDaemonPhasedRequestResult = await cancelled;

    expect(Date.now() - cancelledAt).toBeLessThan(PROMPT_CANCELLATION_MS);
    await hanging.terminated;
    expect(abortSpy).toHaveBeenCalledWith({ terminateRunning: true });
    expect(result).toMatchObject({ aborted: true, outcome: 'aborted' });
    expect(result.operationResults).toEqual([
      expect.objectContaining({ operationId: OPERATION_A, status: OperationStatus.Aborted })
    ]);
    // The aborted operation is not retained, and the next client is admitted immediately.
    expect(fixture.graph.resultByOperation.size).toBe(0);
    const next: IDaemonPhasedRequestResult = await router.executeAsync(
      createRequest('next', OPERATION_B),
      new TestPhasedRequestClient('two')
    );
    expect(next).toMatchObject({ exitCode: 0, outcome: 'success' });
  });

  it('only detaches a cancelling client while another live client still needs the running work', async () => {
    const { hanging, actionAsync } = createHangingOperation();
    const fixture: ITestRoutingFixture = createFixture(actionAsync);
    const abortSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'abortCurrentIterationAsync');
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const cancelledClient: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const cancelled: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('cancelled', OPERATION_A),
      cancelledClient
    );
    const continuing: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('continuing', OPERATION_A),
      new TestPhasedRequestClient('two')
    );
    await hanging.started;
    const abortCallsBeforeCancellation: number = abortSpy.mock.calls.length;

    cancelledClient.abortController.abort();
    const cancelledResult: IDaemonPhasedRequestResult = await cancelled;

    expect(cancelledResult).toMatchObject({ aborted: true, outcome: 'aborted' });
    expect(abortSpy).toHaveBeenCalledTimes(abortCallsBeforeCancellation);
    expect(hanging.signals.map((signal: AbortSignal) => signal.aborted)).toEqual([false]);

    hanging.release();
    expect(await continuing).toMatchObject({ aborted: false, exitCode: 0, outcome: 'success' });
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
  });

  it('answers a cancelling client at once when an accepted pending client will join the batch', async () => {
    const { hanging, actionAsync } = createHangingOperation();
    const fixture: ITestRoutingFixture = createFixture(actionAsync);
    const abortSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'abortCurrentIterationAsync');
    let onLeaseRequested: () => void = () => undefined;
    const leaseRequested: Promise<void> = new Promise<void>((resolve) => (onLeaseRequested = resolve));
    let grantLease: () => void = () => undefined;
    const leaseGranted: Promise<void> = new Promise<void>((resolve) => (grantLease = resolve));
    fixture.session.acquireExecutionLeaseAsync = async (): Promise<AsyncDisposable> => {
      onLeaseRequested();
      await leaseGranted;
      return { [Symbol.asyncDispose]: async (): Promise<void> => undefined };
    };
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const cancelledClient: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const cancelled: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('cancelled', OPERATION_A),
      cancelledClient
    );
    await leaseRequested;
    // Accepted while the batch waits for its execution lease, so it joins before the batch reconciles.
    const continuing: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('continuing', OPERATION_A),
      new TestPhasedRequestClient('two')
    );
    // Let the continuing request finish preparation and enter the pending queue.
    for (let tick: number = 0; tick < 20; tick++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    cancelledClient.abortController.abort();
    expect(await cancelled).toMatchObject({ aborted: true, outcome: 'aborted' });

    grantLease();
    await hanging.started;
    expect(hanging.signals.map((signal: AbortSignal) => signal.aborted)).toEqual([false]);
    expect(abortSpy).not.toHaveBeenCalledWith({ terminateRunning: true });
    hanging.release();
    expect(await continuing).toMatchObject({ aborted: false, exitCode: 0, outcome: 'success' });
  });

  it('keeps a request received during the reconcile out of the batch when its only participant cancels', async () => {
    const { hanging, actionAsync } = createHangingOperation();
    const fixture: ITestRoutingFixture = createFixture(actionAsync);
    const scheduleSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'scheduleIterationAsync');
    let onReconciling: () => void = () => undefined;
    const reconciling: Promise<void> = new Promise<void>((resolve) => (onReconciling = resolve));
    let releaseReconcile: () => void = () => undefined;
    const reconcileReleased: Promise<void> = new Promise<void>((resolve) => (releaseReconcile = resolve));
    let reconciles: number = 0;
    fixture.session.onReconcileAsync = async () => {
      reconciles++;
      onReconciling();
      await reconcileReleased;
    };
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const cancelledClient: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const cancelled: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('cancelled', OPERATION_A),
      cancelledClient
    );
    await reconciling;
    // Received after the reconcile started, so it waits for the next batch, which reconciles again.
    const continuing: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('continuing', OPERATION_A),
      new TestPhasedRequestClient('two')
    );
    for (let tick: number = 0; tick < 20; tick++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    cancelledClient.abortController.abort();
    // The cancelled client is the batch's last participant, so its result still follows the batch's reconcile.
    expect(await raceWithTimeoutAsync(cancelled, 100)).toBe(TIMED_OUT);
    releaseReconcile();
    expect(await cancelled).toMatchObject({ aborted: true, outcome: 'aborted' });

    await hanging.started;
    expect(reconciles).toBe(2);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect(hanging.signals.map((signal: AbortSignal) => signal.aborted)).toEqual([false]);
    hanging.release();
    expect(await continuing).toMatchObject({ aborted: false, exitCode: 0, outcome: 'success' });
  });

  it('never starts work that only a cancelled client needed once the remaining client has its operations', async () => {
    const { hanging: shared, actionAsync: sharedActionAsync } = createHangingOperation();
    const { hanging: orphan, actionAsync: orphanActionAsync } = createHangingOperation();
    // The cancelled client needs A, then B, then C. The remaining client needs only A.
    const fixture: ITestRoutingFixture = createRoutingFixture(
      new Map([
        [OPERATION_A, new TestOperationRunner(OPERATION_A, OperationStatus.Success, sharedActionAsync)],
        [OPERATION_B, new TestOperationRunner(OPERATION_B, OperationStatus.Success, orphanActionAsync)],
        [OPERATION_C, new TestOperationRunner(OPERATION_C)]
      ]),
      [
        [OPERATION_B, OPERATION_A],
        [OPERATION_C, OPERATION_B]
      ],
      { supportsTerminateRunning: true }
    );
    const abortSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'abortCurrentIterationAsync');
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const cancelledClient: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const cancelled: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('cancelled', OPERATION_C),
      cancelledClient
    );
    const continuing: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('continuing', OPERATION_A),
      new TestPhasedRequestClient('two')
    );
    await shared.started;

    cancelledClient.abortController.abort();
    expect(await cancelled).toMatchObject({ aborted: true, outcome: 'aborted' });
    // The remaining client still needs the running shared operation.
    expect(abortSpy).not.toHaveBeenCalledWith({ terminateRunning: true });

    const releasedAt: number = Date.now();
    shared.release();
    const result: IDaemonPhasedRequestResult | typeof TIMED_OUT = await raceWithTimeoutAsync(
      continuing,
      PROMPT_CANCELLATION_MS
    );
    // Lets an iteration that started the abandoned work finish, so a failure below is reported cleanly.
    orphan.release();

    expect(result).toMatchObject({ aborted: false, exitCode: 0, outcome: 'success' });
    expect(Date.now() - releasedAt).toBeLessThan(PROMPT_CANCELLATION_MS);
    expect((result as IDaemonPhasedRequestResult).operationResults).toEqual([
      expect.objectContaining({ operationId: OPERATION_A, status: OperationStatus.Success })
    ]);
    // The abandoned operations had not started, so they finished as skipped and nothing had to be aborted.
    expect(abortSpy).not.toHaveBeenCalledWith({ terminateRunning: true });
    expect(fixture.runners.get(OPERATION_B)?.runCount).toBe(0);
    expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(0);
    // The remaining client's result stays warm; the abandoned operations are not retained.
    expect(new Set([...fixture.graph.resultByOperation.keys()].map(({ name }) => name))).toEqual(
      new Set([OPERATION_A])
    );
  });

  it('never starts work that only a cancelled client needed while the remaining client still needs its own', async () => {
    const { hanging: shared, actionAsync: sharedActionAsync } = createHangingOperation();
    const { hanging: orphan, actionAsync: orphanActionAsync } = createHangingOperation();
    // The cancelled client needs A, C and D. The remaining client needs A and B. Once A finishes, the queue hands C to
    // the only slot before B: C comes later in the graph's order and, through D, has the longer critical path.
    const fixture: ITestRoutingFixture = createRoutingFixture(
      new Map([
        [OPERATION_A, new TestOperationRunner(OPERATION_A, OperationStatus.Success, sharedActionAsync)],
        [OPERATION_B, new TestOperationRunner(OPERATION_B)],
        [OPERATION_C, new TestOperationRunner(OPERATION_C, OperationStatus.Success, orphanActionAsync)],
        [OPERATION_D, new TestOperationRunner(OPERATION_D)]
      ]),
      [
        [OPERATION_B, OPERATION_A],
        [OPERATION_C, OPERATION_A],
        [OPERATION_D, OPERATION_C]
      ],
      { supportsTerminateRunning: true }
    );
    const abortSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'abortCurrentIterationAsync');
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const cancelledClient: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const cancelled: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('cancelled', OPERATION_D),
      cancelledClient
    );
    const continuing: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('continuing', OPERATION_B),
      new TestPhasedRequestClient('two')
    );
    await shared.started;

    cancelledClient.abortController.abort();
    expect(await cancelled).toMatchObject({ aborted: true, outcome: 'aborted' });

    const releasedAt: number = Date.now();
    shared.release();
    const result: IDaemonPhasedRequestResult | typeof TIMED_OUT = await raceWithTimeoutAsync(
      continuing,
      PROMPT_CANCELLATION_MS
    );
    // Lets an iteration that started the abandoned work finish, so a failure below is reported cleanly.
    orphan.release();

    expect(result).toMatchObject({ aborted: false, exitCode: 0, outcome: 'success' });
    expect(Date.now() - releasedAt).toBeLessThan(PROMPT_CANCELLATION_MS);
    expect((result as IDaemonPhasedRequestResult).operationResults).toEqual([
      expect.objectContaining({ operationId: OPERATION_A, status: OperationStatus.Success }),
      expect.objectContaining({ operationId: OPERATION_B, status: OperationStatus.Success })
    ]);
    expect(
      [OPERATION_A, OPERATION_B, OPERATION_C, OPERATION_D].map((id: string) => fixture.runners.get(id)?.runCount)
    ).toEqual([1, 1, 0, 0]);
    expect(abortSpy).not.toHaveBeenCalledWith({ terminateRunning: true });
    // The skipped operations are not retained, so the next request that selects them runs them.
    expect(new Set([...fixture.graph.resultByOperation.keys()].map(({ name }) => name))).toEqual(
      new Set([OPERATION_A, OPERATION_B])
    );
    const next: IDaemonPhasedRequestResult = await router.executeAsync(
      createRequest('next', OPERATION_D),
      new TestPhasedRequestClient('three')
    );
    expect(next).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect([OPERATION_C, OPERATION_D].map((id: string) => fixture.runners.get(id)?.runCount)).toEqual([1, 1]);
  });

  it('terminates running work that only a cancelled client needed once the remaining client has its operations', async () => {
    const { hanging: remaining, actionAsync: remainingActionAsync } = createHangingOperation();
    const { hanging: orphan, actionAsync: orphanActionAsync } = createHangingOperation();
    const fixture: ITestRoutingFixture = createRoutingFixture(
      new Map([
        [OPERATION_A, new TestOperationRunner(OPERATION_A, OperationStatus.Success, remainingActionAsync)],
        [OPERATION_B, new TestOperationRunner(OPERATION_B, OperationStatus.Success, orphanActionAsync)]
      ]),
      [],
      { supportsTerminateRunning: true }
    );
    fixture.graph.parallelism = 2;
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const cancelledClient: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const cancelled: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('cancelled', OPERATION_B),
      cancelledClient
    );
    const continuing: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('continuing', OPERATION_A),
      new TestPhasedRequestClient('two')
    );
    await Promise.all([remaining.started, orphan.started]);

    cancelledClient.abortController.abort();
    expect(await cancelled).toMatchObject({ aborted: true, outcome: 'aborted' });
    // While the remaining client's operation runs, the iteration is left alone.
    expect(orphan.signals.map((signal: AbortSignal) => signal.aborted)).toEqual([false]);

    const releasedAt: number = Date.now();
    remaining.release();
    const result: IDaemonPhasedRequestResult | typeof TIMED_OUT = await raceWithTimeoutAsync(
      continuing,
      PROMPT_CANCELLATION_MS
    );
    orphan.release();

    expect(result).toMatchObject({ aborted: false, exitCode: 0, outcome: 'success' });
    expect(Date.now() - releasedAt).toBeLessThan(PROMPT_CANCELLATION_MS);
    expect((result as IDaemonPhasedRequestResult).operationResults).toEqual([
      expect.objectContaining({ operationId: OPERATION_A, status: OperationStatus.Success })
    ]);
    expect(orphan.signals.map((signal: AbortSignal) => signal.aborted)).toEqual([true]);
    await orphan.terminated;
  });

  function createUpstreamFixRequest(requestId: string): IDaemonPhasedRequest {
    return {
      ...createRequest(requestId, OPERATION_B),
      operationSelection: [
        { enabledState: true, operationId: OPERATION_B },
        { enabledState: true, operationId: OPERATION_D }
      ]
    };
  }

  it('reports operations that a cancel kept from starting as aborted, not with the results of an earlier request', async () => {
    const { fixture, hanging, changeA } = createUpstreamFixFixture();
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const first: IDaemonPhasedRequestResult = await router.executeAsync(
      createUpstreamFixRequest('first'),
      new TestPhasedRequestClient('one')
    );
    expect(getStatuses(first)).toEqual({
      [OPERATION_A]: OperationStatus.Success,
      [OPERATION_B]: OperationStatus.Failure,
      [OPERATION_C]: OperationStatus.Success,
      [OPERATION_D]: OperationStatus.Success
    });

    // The fix goes into A, and the build is cancelled while A runs, before B and D can start.
    changeA();
    const client: TestPhasedRequestClient = new TestPhasedRequestClient('two');
    const cancelled: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createUpstreamFixRequest('cancelled'),
      client
    );
    await hanging.started;
    client.abortController.abort();
    const result: IDaemonPhasedRequestResult = await cancelled;

    await hanging.terminated;
    expect(result).toMatchObject({ aborted: true, outcome: 'aborted' });
    expect(getStatuses(result)).toEqual({
      [OPERATION_A]: OperationStatus.Aborted,
      [OPERATION_B]: OperationStatus.Aborted,
      [OPERATION_C]: OperationStatus.Skipped,
      [OPERATION_D]: OperationStatus.Aborted
    });
    expect(result.operationResults.every(({ errorMessage }) => errorMessage === undefined)).toBe(true);
    expect(fixture.runners.get(OPERATION_B)?.runCount).toBe(1);
    expect(fixture.runners.get(OPERATION_D)?.runCount).toBe(1);
  });

  it('reports an operation that finished in the iteration of a cancelled request with that result', async () => {
    // A ignores termination, so it finishes after the cancel, and its result is this request's.
    const { fixture, hanging, changeA } = createUpstreamFixFixture(true);
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    await router.executeAsync(createUpstreamFixRequest('first'), new TestPhasedRequestClient('one'));

    changeA();
    const client: TestPhasedRequestClient = new TestPhasedRequestClient('two');
    const cancelled: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createUpstreamFixRequest('cancelled'),
      client
    );
    await hanging.started;
    client.abortController.abort();
    hanging.release();
    const result: IDaemonPhasedRequestResult = await cancelled;

    expect(result).toMatchObject({ aborted: true, outcome: 'aborted' });
    expect(getStatuses(result)).toEqual({
      [OPERATION_A]: OperationStatus.Success,
      [OPERATION_B]: OperationStatus.Aborted,
      [OPERATION_C]: OperationStatus.Skipped,
      [OPERATION_D]: OperationStatus.Aborted
    });
    expect(fixture.runners.get(OPERATION_B)?.runCount).toBe(1);
  });

  it('reports operations that a detached cancelling client never saw start as aborted, not with earlier results', async () => {
    const { fixture, hanging, changeA } = createUpstreamFixFixture();
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    await router.executeAsync(createUpstreamFixRequest('first'), new TestPhasedRequestClient('one'));

    changeA();
    const cancelledClient: TestPhasedRequestClient = new TestPhasedRequestClient('two');
    const cancelled: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createUpstreamFixRequest('cancelled'),
      cancelledClient
    );
    const continuing: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('continuing', OPERATION_A),
      new TestPhasedRequestClient('three')
    );
    await hanging.started;
    cancelledClient.abortController.abort();
    const result: IDaemonPhasedRequestResult = await cancelled;
    hanging.release();

    expect(result).toMatchObject({ aborted: true, outcome: 'aborted' });
    expect(getStatuses(result)).toEqual({
      [OPERATION_A]: OperationStatus.Aborted,
      [OPERATION_B]: OperationStatus.Aborted,
      [OPERATION_C]: OperationStatus.Skipped,
      [OPERATION_D]: OperationStatus.Aborted
    });
    expect(getStatuses(await continuing)).toEqual({ [OPERATION_A]: OperationStatus.Success });
    expect(fixture.runners.get(OPERATION_B)?.runCount).toBe(1);
  });

  it('reports every operation as aborted when the cancel comes while the iteration is being scheduled', async () => {
    const { fixture, changeA } = createUpstreamFixFixture();
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    await router.executeAsync(createUpstreamFixRequest('first'), new TestPhasedRequestClient('one'));

    changeA();
    const client: TestPhasedRequestClient = new TestPhasedRequestClient('two');
    fixture.graph.hooks.configureIteration.tap('cancel while scheduling', () => {
      client.abortController.abort();
    });
    const result: IDaemonPhasedRequestResult = await router.executeAsync(
      createUpstreamFixRequest('cancelled'),
      client
    );

    expect(result).toMatchObject({ aborted: true, outcome: 'aborted' });
    expect(getStatuses(result)).toEqual({
      [OPERATION_A]: OperationStatus.Aborted,
      [OPERATION_B]: OperationStatus.Aborted,
      [OPERATION_C]: OperationStatus.Aborted,
      [OPERATION_D]: OperationStatus.Aborted
    });
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
  });
});
