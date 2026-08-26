// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';
import type {
  IDaemonEventEnvelope,
  IDaemonPhasedOperationSelection,
  IDaemonPhasedRequest,
  IDaemonPhasedRequestResult
} from '@rushstack/rush-daemon-protocol';
import { OperationStatus } from '@microsoft/rush-lib';

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
      [OPERATION_B, new TestOperationRunner(OPERATION_B)],
      [OPERATION_C, new TestOperationRunner(OPERATION_C, OperationStatus.Success, options?.actionCAsync)]
    ]),
    [[OPERATION_B, OPERATION_A]]
  );
}

function getResultOperationIds(result: IDaemonPhasedRequestResult): ReadonlyArray<string> {
  return result.operationResults.map(({ operationId }) => operationId);
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
    const releaseOperation: IDeferred = createDeferred();
    const fixture: ITestRoutingFixture = createFixture({
      actionAAsync: async (): Promise<void> => {
        operationStarted.resolve();
        await releaseOperation.promise;
      }
    });
    const cancelledClient: TestPhasedRequestClient = new TestPhasedRequestClient('one');
    const continuingClient: TestPhasedRequestClient = new TestPhasedRequestClient('two');
    const abortSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'abortCurrentIterationAsync');
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const cancelled = router.executeAsync(createRequest('cancelled', OPERATION_A), cancelledClient);
    const continuing = router.executeAsync(createRequest('continuing', OPERATION_C), continuingClient);
    await operationStarted.promise;
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
