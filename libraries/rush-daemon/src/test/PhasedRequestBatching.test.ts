// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';
import type {
  IDaemonEventEnvelope,
  IDaemonPhasedOperationSelection,
  IDaemonPhasedRequest,
  IDaemonPhasedRequestResult
} from '@rushstack/rush-daemon-protocol';
import { RUSHD_OPERATION_HEADER, RUSHD_OPERATION_STREAM_CLOSED } from '@rushstack/rush-daemon-protocol';
import { OperationStatus } from '@microsoft/rush-lib';
import type { IPhasedCommandEngineRequestSettings } from '@microsoft/rush-lib';

import { PhasedRequestRouter } from '../PhasedRequestRouter';
import {
  TEST_ENGINE_SHAPE,
  TestOperationRunner,
  TestPhasedRequestClient,
  createRoutingFixture
} from './PhasedRequestRouterTestUtilities';
import type { ITestClientWrite, ITestRoutingFixture } from './PhasedRequestRouterTestUtilities';

const OPERATION_A: string = 'project-a (_phase:test)';
const OPERATION_B: string = 'project-b (_phase:test)';
const OPERATION_C: string = 'project-c (_phase:test)';

interface IDeferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function createDeferred(): IDeferred {
  let resolvePromise: (() => void) | undefined;
  const promise: Promise<void> = new Promise((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: () => resolvePromise?.() };
}

function select(operationId: string): IDaemonPhasedOperationSelection {
  return { enabledState: true, operationId };
}

function createRequest(
  requestId: string,
  ...selectedOperationIds: ReadonlyArray<string>
): IDaemonPhasedRequest {
  return {
    commandName: 'build',
    commandOrigin: 'built-in',
    engineShape: TEST_ENGINE_SHAPE,
    environment: {},
    operationSelection: selectedOperationIds.map(select),
    requestId
  };
}

function createFixture(options?: {
  readonly actionAAsync?: (terminal: ITerminal) => Promise<void>;
  readonly actionBAsync?: (terminal: ITerminal) => Promise<void>;
  readonly actionCAsync?: (terminal: ITerminal) => Promise<void>;
  readonly statusA?: OperationStatus;
}): ITestRoutingFixture {
  return createRoutingFixture(
    new Map([
      [
        OPERATION_A,
        new TestOperationRunner(
          OPERATION_A,
          options?.statusA ?? OperationStatus.Success,
          options?.actionAAsync
        )
      ],
      [OPERATION_B, new TestOperationRunner(OPERATION_B, OperationStatus.Success, options?.actionBAsync)],
      [OPERATION_C, new TestOperationRunner(OPERATION_C, OperationStatus.Success, options?.actionCAsync)]
    ]),
    [[OPERATION_B, OPERATION_A]]
  );
}

function getResultOperationIds(result: IDaemonPhasedRequestResult): ReadonlyArray<string> {
  return result.operationResults.map(({ operationId }) => operationId);
}

interface IExecutionLeaseTracker {
  readonly events: string[];
}

function trackExecutionLease(fixture: ITestRoutingFixture): IExecutionLeaseTracker {
  const events: string[] = [];
  fixture.session.acquireExecutionLeaseAsync = async (): Promise<AsyncDisposable> => {
    events.push('acquired');
    return {
      [Symbol.asyncDispose]: async (): Promise<void> => {
        events.push('released');
      }
    };
  };
  return { events };
}

function trackResult(
  resultPromise: Promise<IDaemonPhasedRequestResult>,
  label: string,
  events: string[]
): Promise<IDaemonPhasedRequestResult> {
  return resultPromise.then((result: IDaemonPhasedRequestResult) => {
    events.push(`result:${label}`);
    return result;
  });
}

function isStreamClosedEvent(write: ITestClientWrite, operationId: string): boolean {
  const payload: unknown = write.event?.payload;
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { name?: unknown }).name === RUSHD_OPERATION_STREAM_CLOSED &&
    write.event !== undefined &&
    eventOperationId(write.event) === operationId
  );
}

function eventOperationId(event: IDaemonEventEnvelope): string | undefined {
  if (event.scope?.operationId) {
    return event.scope.operationId;
  }
  const payload: unknown = event.payload;
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const operationId: unknown = (payload as { operationId?: unknown }).operationId;
  if (typeof operationId === 'string') {
    return operationId;
  }
  const data: unknown = (payload as { data?: unknown }).data;
  return typeof data === 'object' && data !== null
    ? ((data as { operationId?: string }).operationId ?? undefined)
    : undefined;
}

describe('shared phased request batching', () => {
  it('schedules separate iterations for overlapping requests with different request settings', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const graph: ITestRoutingFixture['graph'] = fixture.graph;
    const scheduledSettings: IPhasedCommandEngineRequestSettings[] = [];
    const originalScheduleAsync: typeof graph.scheduleIterationAsync =
      graph.scheduleIterationAsync.bind(graph);
    const scheduleSpy: jest.SpyInstance = jest
      .spyOn(graph, 'scheduleIterationAsync')
      .mockImplementation((...args: Parameters<typeof graph.scheduleIterationAsync>) => {
        scheduledSettings.push({ parallelism: graph.parallelism, quietMode: graph.quietMode });
        return originalScheduleAsync(...args);
      });
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const defaultSettings: IPhasedCommandEngineRequestSettings = { parallelism: 4, quietMode: true };
    const verboseSerialSettings: IPhasedCommandEngineRequestSettings = { parallelism: 1, quietMode: false };

    const [first, second] = await Promise.all([
      router.executeAsync(
        createRequest('default', OPERATION_A),
        new TestPhasedRequestClient('one'),
        false,
        undefined,
        defaultSettings
      ),
      router.executeAsync(
        createRequest('verbose-serial', OPERATION_B),
        new TestPhasedRequestClient('two'),
        false,
        undefined,
        verboseSerialSettings
      )
    ]);

    expect(scheduleSpy).toHaveBeenCalledTimes(2);
    expect(scheduledSettings).toEqual([defaultSettings, verboseSerialSettings]);
    expect(first).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(second).toMatchObject({ exitCode: 0, outcome: 'success' });
  });

  it('merges overlapping selections into one real graph iteration and executes shared operations once', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const scheduleSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'scheduleIterationAsync');
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);

    const [dependency, consumer] = await Promise.all([
      router.executeAsync(createRequest('dependency', OPERATION_A), new TestPhasedRequestClient('one')),
      router.executeAsync(createRequest('consumer', OPERATION_B), new TestPhasedRequestClient('two'))
    ]);

    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
    expect(fixture.runners.get(OPERATION_B)?.runCount).toBe(1);
    expect(getResultOperationIds(dependency)).toEqual([OPERATION_A]);
    expect(getResultOperationIds(consumer)).toEqual([OPERATION_A, OPERATION_B]);
  });

  it('shares one iteration for disjoint selections while isolating streams, events, and results', async () => {
    const fixture: ITestRoutingFixture = createFixture({
      actionAAsync: async (terminal: ITerminal): Promise<void> => terminal.writeLine('only-a'),
      actionCAsync: async (terminal: ITerminal): Promise<void> => terminal.writeLine('only-c')
    });
    const scheduleSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'scheduleIterationAsync');
    const clientA: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const clientC: TestPhasedRequestClient = new TestPhasedRequestClient('two');
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);

    const [resultA, resultC] = await Promise.all([
      router.executeAsync(createRequest('a', OPERATION_A), clientA),
      router.executeAsync(createRequest('c', OPERATION_C), clientC)
    ]);

    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect(getResultOperationIds(resultA)).toEqual([OPERATION_A]);
    expect(getResultOperationIds(resultC)).toEqual([OPERATION_C]);
    expect(getWrittenOperationIds(clientA)).toEqual(new Set([OPERATION_A]));
    expect(getWrittenOperationIds(clientC)).toEqual(new Set([OPERATION_C]));
    expect(getHeaderData(clientA)).toEqual([
      { completedOperations: 1, operationId: OPERATION_A, totalOperations: 1 }
    ]);
    expect(getHeaderData(clientC)).toEqual([
      { completedOperations: 1, operationId: OPERATION_C, totalOperations: 1 }
    ]);
  });

  it('publishes a coalesced client result as soon as its own closure settles', async () => {
    const releaseB: IDeferred = createDeferred();
    const fixture: ITestRoutingFixture = createFixture({
      actionAAsync: async (terminal: ITerminal): Promise<void> => terminal.writeLine('from-a'),
      actionBAsync: async (): Promise<void> => releaseB.promise
    });
    const lease: IExecutionLeaseTracker = trackExecutionLease(fixture);
    const scheduleSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'scheduleIterationAsync');
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const clientA: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const clientB: TestPhasedRequestClient = new TestPhasedRequestClient('two');
    // A slow reader must still receive all of its operation output before its early result.
    clientA.onWriteAsync = async (): Promise<void> => {
      await new Promise<void>((resolve) => setImmediate(resolve));
    };

    const resultAPromise: Promise<IDaemonPhasedRequestResult> = trackResult(
      router.executeAsync(createRequest('a', OPERATION_A), clientA),
      'a',
      lease.events
    );
    const resultBPromise: Promise<IDaemonPhasedRequestResult> = trackResult(
      router.executeAsync(createRequest('b', OPERATION_B), clientB),
      'b',
      lease.events
    );

    const resultA: IDaemonPhasedRequestResult = await resultAPromise;
    expect(lease.events).toEqual(['acquired', 'result:a']);
    expect(fixture.graph.status).toBe(OperationStatus.Executing);
    expect(resultA).toMatchObject({ exitCode: 0, outcome: 'success', scheduled: true });
    expect(resultA.operationResults).toEqual([
      expect.objectContaining({ operationId: OPERATION_A, status: OperationStatus.Success })
    ]);
    expect(getWrittenOperationIds(clientA)).toEqual(new Set([OPERATION_A]));
    expect(clientA.writes.some((write: ITestClientWrite) => write.text?.includes('from-a'))).toBe(true);
    expect(clientA.writes.findIndex((write) => isStreamClosedEvent(write, OPERATION_A))).toBeGreaterThan(-1);
    expect(clientA.writes[clientA.writes.length - 1]?.result).toBe(resultA);
    expect(getHeaderData(clientA)).toEqual([
      { completedOperations: 1, operationId: OPERATION_A, totalOperations: 1 }
    ]);
    const clientAWriteCount: number = clientA.writes.length;

    releaseB.resolve();
    const resultB: IDaemonPhasedRequestResult = await resultBPromise;
    // The last participant keeps the ordinary contract: its result follows execution lease release.
    expect(lease.events).toEqual(['acquired', 'result:a', 'released', 'result:b']);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
    expect(fixture.runners.get(OPERATION_B)?.runCount).toBe(1);
    expect(resultB).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(getResultOperationIds(resultB)).toEqual([OPERATION_A, OPERATION_B]);
    expect(clientA.writes).toHaveLength(clientAWriteCount);
  });

  it('publishes an early failure result while the batch continues for other clients', async () => {
    const releaseC: IDeferred = createDeferred();
    const fixture: ITestRoutingFixture = createFixture({
      actionCAsync: async (): Promise<void> => releaseC.promise,
      statusA: OperationStatus.Failure
    });
    fixture.graph.parallelism = 2;
    const lease: IExecutionLeaseTracker = trackExecutionLease(fixture);
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);

    const failedPromise: Promise<IDaemonPhasedRequestResult> = trackResult(
      router.executeAsync(createRequest('failed', OPERATION_A), new TestPhasedRequestClient('one')),
      'failed',
      lease.events
    );
    const continuingPromise: Promise<IDaemonPhasedRequestResult> = trackResult(
      router.executeAsync(createRequest('continuing', OPERATION_C), new TestPhasedRequestClient('two')),
      'continuing',
      lease.events
    );

    const failed: IDaemonPhasedRequestResult = await failedPromise;
    expect(lease.events).toEqual(['acquired', 'result:failed']);
    expect(failed).toMatchObject({ aborted: false, exitCode: 1, outcome: 'failure' });
    expect(failed.operationResults).toEqual([
      expect.objectContaining({ operationId: OPERATION_A, status: OperationStatus.Failure })
    ]);

    releaseC.resolve();
    const continuing: IDaemonPhasedRequestResult = await continuingPromise;
    expect(lease.events).toEqual(['acquired', 'result:failed', 'released', 'result:continuing']);
    expect(continuing).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(getResultOperationIds(continuing)).toEqual([OPERATION_C]);
  });

  it('aborts the iteration when the only client still needing it cancels after an early result', async () => {
    const operationCStarted: IDeferred = createDeferred();
    const releaseC: IDeferred = createDeferred();
    const fixture: ITestRoutingFixture = createFixture({
      actionCAsync: async (): Promise<void> => {
        operationCStarted.resolve();
        await releaseC.promise;
      }
    });
    fixture.graph.parallelism = 2;
    const abortSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'abortCurrentIterationAsync');
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const cancelledClient: TestPhasedRequestClient = new TestPhasedRequestClient('two');

    const finishedPromise: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('finished', OPERATION_A),
      new TestPhasedRequestClient('one')
    );
    const cancelledPromise: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('cancelled', OPERATION_C),
      cancelledClient
    );
    const finished: IDaemonPhasedRequestResult = await finishedPromise;
    await operationCStarted.promise;
    expect(finished).toMatchObject({ exitCode: 0, outcome: 'success' });
    const abortCallCountBeforeCancellation: number = abortSpy.mock.calls.length;

    cancelledClient.abortController.abort();
    expect(abortSpy.mock.calls.length).toBeGreaterThan(abortCallCountBeforeCancellation);
    releaseC.resolve();
    const cancelled: IDaemonPhasedRequestResult = await cancelledPromise;

    expect(cancelled).toMatchObject({ aborted: true, outcome: 'aborted' });
  });

  it('derives shared and disjoint failure results from each client subset', async () => {
    const fixture: ITestRoutingFixture = createFixture({ statusA: OperationStatus.Failure });
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);

    const [failed, blocked, disjoint] = await Promise.all([
      router.executeAsync(createRequest('failed', OPERATION_A), new TestPhasedRequestClient('one')),
      router.executeAsync(createRequest('blocked', OPERATION_B), new TestPhasedRequestClient('two')),
      router.executeAsync(createRequest('disjoint', OPERATION_C), new TestPhasedRequestClient('three'))
    ]);

    expect(failed).toMatchObject({ exitCode: 1, outcome: 'failure' });
    expect(blocked).toMatchObject({ exitCode: 1, outcome: 'failure' });
    expect(blocked.operationResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operationId: OPERATION_A, status: OperationStatus.Failure }),
        expect.objectContaining({ operationId: OPERATION_B, status: OperationStatus.Blocked })
      ])
    );
    expect(disjoint).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(getResultOperationIds(disjoint)).toEqual([OPERATION_C]);
  });

  it('removes a client cancelled before scheduling without running its selection', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const reconcileStarted: IDeferred = createDeferred();
    const releaseReconcile: IDeferred = createDeferred();
    fixture.session.onReconcileAsync = async (): Promise<void> => {
      reconcileStarted.resolve();
      await releaseReconcile.promise;
    };
    const client: TestPhasedRequestClient = new TestPhasedRequestClient();
    const scheduleSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'scheduleIterationAsync');
    const resultPromise: Promise<IDaemonPhasedRequestResult> = new PhasedRequestRouter(
      fixture.session
    ).executeAsync(createRequest('cancelled', OPERATION_A), client);
    await reconcileStarted.promise;

    client.abortController.abort();
    releaseReconcile.resolve();
    const result: IDaemonPhasedRequestResult = await resultPromise;

    expect(result).toMatchObject({ aborted: true, outcome: 'aborted', scheduled: false });
    expect(scheduleSpy).not.toHaveBeenCalled();
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(0);
  });

  it('unsubscribes one mid-run cancellation without aborting work required by another client', async () => {
    const operationStarted: IDeferred = createDeferred();
    const operationCStarted: IDeferred = createDeferred();
    const releaseOperation: IDeferred = createDeferred();
    const fixture: ITestRoutingFixture = createFixture({
      actionAAsync: async (): Promise<void> => {
        operationStarted.resolve();
        await releaseOperation.promise;
      },
      // Keep the continuing client's work outstanding until after the cancellation.
      actionCAsync: async (): Promise<void> => {
        operationCStarted.resolve();
        await releaseOperation.promise;
      }
    });
    fixture.graph.parallelism = 2;
    const cancelledClient: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const continuingClient: TestPhasedRequestClient = new TestPhasedRequestClient('two');
    const abortSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'abortCurrentIterationAsync');
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const cancelled = router.executeAsync(createRequest('cancelled', OPERATION_A), cancelledClient);
    const continuing = router.executeAsync(createRequest('continuing', OPERATION_C), continuingClient);
    await Promise.all([operationStarted.promise, operationCStarted.promise]);
    const abortCallCountBeforeCancellation: number = abortSpy.mock.calls.length;

    cancelledClient.abortController.abort();
    releaseOperation.resolve();
    const [cancelledResult, continuingResult] = await Promise.all([cancelled, continuing]);

    expect(cancelledResult).toMatchObject({ aborted: true, outcome: 'aborted' });
    expect(continuingResult).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(abortSpy).toHaveBeenCalledTimes(abortCallCountBeforeCancellation);
    expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(1);
  });

  it('reports authoritative retained status when a client cancels during a shared operation', async () => {
    const operationStarted: IDeferred = createDeferred();
    const releaseOperation: IDeferred = createDeferred();
    const fixture: ITestRoutingFixture = createFixture({
      actionAAsync: async (): Promise<void> => {
        operationStarted.resolve();
        await releaseOperation.promise;
      }
    });
    const cancelledClient: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const continuingClient: TestPhasedRequestClient = new TestPhasedRequestClient('two');
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const cancelled = router.executeAsync(createRequest('cancelled', OPERATION_A), cancelledClient);
    const continuing = router.executeAsync(createRequest('continuing', OPERATION_A), continuingClient);
    await operationStarted.promise;

    cancelledClient.abortController.abort();
    releaseOperation.resolve();
    const [cancelledResult, continuingResult] = await Promise.all([cancelled, continuing]);

    expect(cancelledResult).toMatchObject({ aborted: true, outcome: 'aborted' });
    expect(cancelledResult.operationResults).toEqual([
      expect.objectContaining({ operationId: OPERATION_A, status: OperationStatus.Success })
    ]);
    expect(continuingResult).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
  });

  it('prefers a current abort after invalidating a retained warm success', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const first = await router.executeAsync(
      createRequest('first', OPERATION_A),
      new TestPhasedRequestClient('one')
    );
    expect(first.operationResults).toEqual([
      expect.objectContaining({ operationId: OPERATION_A, status: OperationStatus.Success })
    ]);
    fixture.graph.invalidateOperations(undefined, 'rerun');
    fixture.graph.hooks.beforeExecuteIterationAsync.tapPromise(
      'abort current iteration',
      async (): Promise<OperationStatus> => OperationStatus.Aborted
    );

    const second = await router.executeAsync(
      createRequest('second', OPERATION_A),
      new TestPhasedRequestClient('two')
    );

    expect(second).toMatchObject({ exitCode: 1, outcome: 'aborted', scheduled: true });
    expect(second.operationResults).toEqual([
      expect.objectContaining({ operationId: OPERATION_A, status: OperationStatus.Aborted })
    ]);
  });

  it('preserves failure precedence when a client cancels during a failing shared operation', async () => {
    const operationStarted: IDeferred = createDeferred();
    const releaseOperation: IDeferred = createDeferred();
    const fixture: ITestRoutingFixture = createFixture({
      actionAAsync: async (): Promise<void> => {
        operationStarted.resolve();
        await releaseOperation.promise;
      },
      statusA: OperationStatus.Failure
    });
    const cancelledClient: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const cancelled = router.executeAsync(createRequest('cancelled', OPERATION_A), cancelledClient);
    const continuing = router.executeAsync(
      createRequest('continuing', OPERATION_A),
      new TestPhasedRequestClient('two')
    );
    await operationStarted.promise;

    cancelledClient.abortController.abort();
    releaseOperation.resolve();
    const [cancelledResult, continuingResult] = await Promise.all([cancelled, continuing]);

    expect(cancelledResult).toMatchObject({ aborted: true, exitCode: 1, outcome: 'failure' });
    expect(cancelledResult.operationResults).toEqual([
      expect.objectContaining({ operationId: OPERATION_A, status: OperationStatus.Failure })
    ]);
    expect(continuingResult).toMatchObject({ aborted: false, exitCode: 1, outcome: 'failure' });
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
  });

  it('aborts the shared iteration when every client cancels', async () => {
    const operationStarted: IDeferred = createDeferred();
    const releaseOperation: IDeferred = createDeferred();
    const fixture: ITestRoutingFixture = createFixture({
      actionAAsync: async (): Promise<void> => {
        operationStarted.resolve();
        await releaseOperation.promise;
      }
    });
    const firstClient: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const secondClient: TestPhasedRequestClient = new TestPhasedRequestClient('two');
    const abortSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'abortCurrentIterationAsync');
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const first = router.executeAsync(createRequest('first', OPERATION_A), firstClient);
    const second = router.executeAsync(createRequest('second', OPERATION_B), secondClient);
    await operationStarted.promise;
    const abortCallCountBeforeCancellation: number = abortSpy.mock.calls.length;

    firstClient.abortController.abort();
    secondClient.abortController.abort();
    releaseOperation.resolve();
    const results: ReadonlyArray<IDaemonPhasedRequestResult> = await Promise.all([first, second]);

    expect(results).toEqual([
      expect.objectContaining({ aborted: true, outcome: 'aborted' }),
      expect.objectContaining({ aborted: true, outcome: 'aborted' })
    ]);
    expect(abortSpy.mock.calls.length).toBeGreaterThan(abortCallCountBeforeCancellation);
    expect(fixture.runners.get(OPERATION_B)?.runCount).toBe(0);
  });

  it('puts arrivals after execution begins into a later batch and reconciles once per batch', async () => {
    const operationStarted: IDeferred = createDeferred();
    const releaseOperation: IDeferred = createDeferred();
    const fixture: ITestRoutingFixture = createFixture({
      actionAAsync: async (): Promise<void> => {
        operationStarted.resolve();
        await releaseOperation.promise;
      }
    });
    fixture.session.onReconcileAsync = jest.fn(async (): Promise<void> => undefined);
    const scheduleSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'scheduleIterationAsync');
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const first = router.executeAsync(
      createRequest('first', OPERATION_A),
      new TestPhasedRequestClient('one')
    );
    await operationStarted.promise;
    const late = router.executeAsync(
      createRequest('late', OPERATION_C),
      new TestPhasedRequestClient('two')
    );
    expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(0);
    releaseOperation.resolve();

    await Promise.all([first, late]);
    expect(scheduleSpy).toHaveBeenCalledTimes(2);
    expect(fixture.session.onReconcileAsync).toHaveBeenCalledTimes(2);
    expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(1);
  });

  it('lets a late shared build wait past a default timeout while a compatible batch executes', async () => {
    const operationStarted: IDeferred = createDeferred();
    const releaseOperation: IDeferred = createDeferred();
    const fixture: ITestRoutingFixture = createFixture({
      actionAAsync: async (): Promise<void> => {
        operationStarted.resolve();
        await releaseOperation.promise;
      }
    });
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const first = router.executeAsync(
      createRequest('first', OPERATION_A),
      new TestPhasedRequestClient('one')
    );
    await operationStarted.promise;
    let lateSettled: boolean = false;
    const late = router
      .executeAsync(
        { ...createRequest('late', OPERATION_C), admission: { waitTimeoutIsDefault: true, waitTimeoutMs: 20 } },
        new TestPhasedRequestClient('two')
      )
      .finally(() => {
        lateSettled = true;
      });
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    expect(lateSettled).toBe(false);
    releaseOperation.resolve();

    const [firstResult, lateResult] = await Promise.all([first, late]);
    expect(firstResult.outcome).toBe('success');
    expect(lateResult.outcome).toBe('success');
    expect(lateResult.admissionErrorCode).toBeUndefined();
    expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(1);
  });

  it('enforces an explicit timeout while a late shared build waits for a compatible batch', async () => {
    const operationStarted: IDeferred = createDeferred();
    const releaseOperation: IDeferred = createDeferred();
    const fixture: ITestRoutingFixture = createFixture({
      actionAAsync: async (): Promise<void> => {
        operationStarted.resolve();
        await releaseOperation.promise;
      }
    });
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const first = router.executeAsync(
      createRequest('first', OPERATION_A),
      new TestPhasedRequestClient('one')
    );
    await operationStarted.promise;

    const lateResult: IDaemonPhasedRequestResult = await router.executeAsync(
      { ...createRequest('late', OPERATION_C), admission: { waitTimeoutMs: 20 } },
      new TestPhasedRequestClient('two')
    );
    expect(lateResult).toMatchObject({ admissionErrorCode: 'wait-timeout', outcome: 'failure' });
    releaseOperation.resolve();
    expect((await first).outcome).toBe('success');
    expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(0);
  });

  it('serializes concurrent shared-read requests instead of merging or deadlocking them', async () => {
    const operationStarted: IDeferred = createDeferred();
    const releaseOperation: IDeferred = createDeferred();
    const fixture: ITestRoutingFixture = createFixture({
      actionAAsync: async (): Promise<void> => {
        operationStarted.resolve();
        await releaseOperation.promise;
      }
    });
    const scheduleSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'scheduleIterationAsync');
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const firstRequest: IDaemonPhasedRequest = {
      ...createRequest('first', OPERATION_A),
      commandName: 'list'
    };
    const first = router.executeAsync(firstRequest, new TestPhasedRequestClient('one'));
    await operationStarted.promise;

    const second = router.executeAsync(
      { ...createRequest('second', OPERATION_C), commandName: 'list' },
      new TestPhasedRequestClient('two')
    );
    const third = router.executeAsync(
      { ...createRequest('third', OPERATION_C), commandName: 'list' },
      new TestPhasedRequestClient('three')
    );
    releaseOperation.resolve();

    await Promise.all([first, second, third]);
    expect(scheduleSpy).toHaveBeenCalledTimes(3);
  });

  it('applies graph admission to same-turn shared-read requests', async () => {
    const operationStarted: IDeferred = createDeferred();
    const releaseOperation: IDeferred = createDeferred();
    const fixture: ITestRoutingFixture = createFixture({
      actionAAsync: async (): Promise<void> => {
        operationStarted.resolve();
        await releaseOperation.promise;
      }
    });
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const first = router.executeAsync(
      { ...createRequest('first', OPERATION_A), commandName: 'list' },
      new TestPhasedRequestClient('one')
    );
    const noWait = router.executeAsync(
      {
        ...createRequest('no-wait', OPERATION_C),
        admission: { noWait: true },
        commandName: 'list'
      },
      new TestPhasedRequestClient('two')
    );

    const noWaitResult: IDaemonPhasedRequestResult = await noWait;
    expect(noWaitResult).toMatchObject({ admissionErrorCode: 'no-wait', outcome: 'failure' });
    await operationStarted.promise;
    releaseOperation.resolve();
    await first;
  });

  it('keeps true enabled state dominant across merged selections', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const enabledStates: Array<boolean | 'ignore-dependency-changes' | undefined> = [];
    fixture.graph.hooks.onIterationScheduled.tap('capture enabled state', () => {
      enabledStates.push(fixture.operations.get(OPERATION_A)?.enabled);
    });
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);

    await Promise.all([
      router.executeAsync(
        {
          ...createRequest('ignore-dependency', OPERATION_A),
          operationSelection: [
            { enabledState: 'ignore-dependency-changes', operationId: OPERATION_A }
          ]
        },
        new TestPhasedRequestClient('one')
      ),
      router.executeAsync(
        createRequest('requires-dependency', OPERATION_B),
        new TestPhasedRequestClient('two')
      )
    ]);

    expect(enabledStates).toEqual([true]);
  });

  it('preserves per-client backpressure and final-result ordering in a merged batch', async () => {
    const fixture: ITestRoutingFixture = createFixture({
      actionAAsync: async (terminal: ITerminal): Promise<void> => {
        terminal.writeLine('first');
        terminal.writeErrorLine('second');
      }
    });
    const clients: ReadonlyArray<TestPhasedRequestClient> = [
      new TestPhasedRequestClient('one'),
      new TestPhasedRequestClient('two')
    ];
    const concurrentWrites: number[] = [0, 0];
    const maximumConcurrentWrites: number[] = [0, 0];
    clients.forEach((client: TestPhasedRequestClient, index: number) => {
      client.onWriteAsync = async (): Promise<void> => {
        concurrentWrites[index]++;
        maximumConcurrentWrites[index] = Math.max(
          maximumConcurrentWrites[index],
          concurrentWrites[index]
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
        concurrentWrites[index]--;
      };
    });
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);

    await Promise.all([
      router.executeAsync(createRequest('one', OPERATION_A), clients[0]),
      router.executeAsync(createRequest('two', OPERATION_A), clients[1])
    ]);

    expect(maximumConcurrentWrites).toEqual([1, 1]);
    for (const client of clients) {
      expect(client.writes[client.writes.length - 1]?.result).toBeDefined();
    }
  });

  it('cleans up a failed batch so a later batch can execute', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    let schedulingCount: number = 0;
    fixture.graph.hooks.onIterationScheduled.tap('fail first batch', () => {
      if (schedulingCount++ === 0) {
        throw new Error('first batch failed');
      }
    });
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);

    const first = await router.executeAsync(
      createRequest('first', OPERATION_A),
      new TestPhasedRequestClient('one')
    );
    const second = await router.executeAsync(
      createRequest('second', OPERATION_C),
      new TestPhasedRequestClient('two')
    );

    expect(first).toMatchObject({ errorMessage: 'first batch failed', outcome: 'failure' });
    expect(second).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(1);
  });
});

function getWrittenOperationIds(client: TestPhasedRequestClient): ReadonlySet<string> {
  const operationIdSet: Set<string> = new Set();
  for (const write of client.writes) {
    if (write.operationId) {
      operationIdSet.add(write.operationId);
    }
    if (write.event) {
      const operationId: string | undefined = eventOperationId(write.event);
      if (operationId) {
        operationIdSet.add(operationId);
      }
    }
  }
  return operationIdSet;
}

function getHeaderData(
  client: TestPhasedRequestClient
): ReadonlyArray<{ completedOperations: number; operationId: string; totalOperations: number }> {
  return client.writes.flatMap(({ event }) => {
    const payload: unknown = event?.payload;
    if (
      typeof payload !== 'object' ||
      payload === null ||
      (payload as { name?: unknown }).name !== RUSHD_OPERATION_HEADER
    ) {
      return [];
    }
    const data: unknown = (payload as { data?: unknown }).data;
    return typeof data === 'object' && data !== null
      ? [
          data as {
            completedOperations: number;
            operationId: string;
            totalOperations: number;
          }
        ]
      : [];
  });
}
