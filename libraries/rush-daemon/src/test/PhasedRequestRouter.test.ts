// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';
import type {
  IDaemonEventEnvelope,
  IDaemonPhasedOperationSelection,
  IDaemonPhasedRequest
} from '@rushstack/rush-daemon-protocol';
import { RUSHD_OPERATION_STREAM_CLOSED } from '@rushstack/rush-daemon-protocol';
import { OperationStatus } from '@microsoft/rush-lib';

import { PhasedRequestRouter } from '../PhasedRequestRouter';
import {
  TEST_ENGINE_SHAPE,
  TestOperationRunner,
  TestPhasedRequestClient,
  createRoutingFixture
} from './PhasedRequestRouterTestUtilities';
import type {
  ITestClientWrite,
  ITestRoutingFixture
} from './PhasedRequestRouterTestUtilities';

const OPERATION_A: string = 'project-a (_phase:test)';
const OPERATION_B: string = 'project-b (_phase:test)';
const OPERATION_C: string = 'project-c (_phase:test)';

function createRequest(
  operationSelection: ReadonlyArray<IDaemonPhasedOperationSelection>
): IDaemonPhasedRequest {
  return {
    commandName: 'build',
    engineShape: TEST_ENGINE_SHAPE,
    operationSelection,
    requestId: 'request-1'
  };
}

function select(operationId: string): IDaemonPhasedOperationSelection {
  return { enabledState: true, operationId };
}

function selectRuntimeValue(
  operationId: string,
  enabledState: unknown
): IDaemonPhasedOperationSelection {
  return { enabledState, operationId } as unknown as IDaemonPhasedOperationSelection;
}

function createThreeOperationFixture(options?: {
  actionAAsync?: (terminal: ITerminal) => Promise<void>;
  statusA?: OperationStatus;
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
      [OPERATION_C, new TestOperationRunner(OPERATION_C)]
    ]),
    [[OPERATION_B, OPERATION_A]]
  );
}

function getEventOperationId(event: IDaemonEventEnvelope): string | undefined {
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
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  const nestedOperationId: unknown = (data as { operationId?: unknown }).operationId;
  return typeof nestedOperationId === 'string' ? nestedOperationId : undefined;
}

describe(PhasedRequestRouter.name, () => {
  it('rejects invalid selections and an engine-shape mismatch before scheduling', async () => {
    const fixture: ITestRoutingFixture = createThreeOperationFixture();
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const client: TestPhasedRequestClient = new TestPhasedRequestClient();
    const scheduleSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'scheduleIterationAsync');

    await expect(router.executeAsync(createRequest([]), client)).rejects.toThrow(
      'must select at least one operation'
    );
    await expect(
      router.executeAsync(createRequest([select('unknown operation')]), client)
    ).rejects.toThrow('Unknown phased request operation id');
    await expect(
      router.executeAsync(createRequest([select(OPERATION_A), select(OPERATION_A)]), client)
    ).rejects.toThrow('Duplicate phased request operation id');
    for (const enabledState of [false, 'invalid-state']) {
      await expect(
        router.executeAsync(
          createRequest([selectRuntimeValue(OPERATION_A, enabledState)]),
          client
        )
      ).rejects.toThrow(`Invalid phased request enabled state: "${String(enabledState)}"`);
    }
    await expect(
      router.executeAsync(
        { ...createRequest([select(OPERATION_A)]), engineShape: { phaseNames: ['other'], pluginNames: [] } },
        client
      )
    ).rejects.toThrow('phase shape does not match');
    expect(scheduleSpy).not.toHaveBeenCalled();
  });

  it('accepts both enabled states declared by the protocol', async () => {
    const trueFixture: ITestRoutingFixture = createThreeOperationFixture();
    await new PhasedRequestRouter(trueFixture.session).executeAsync(
      createRequest([select(OPERATION_A)]),
      new TestPhasedRequestClient()
    );

    const ignoredDependencyFixture: ITestRoutingFixture = createThreeOperationFixture();
    await new PhasedRequestRouter(ignoredDependencyFixture.session).executeAsync(
      createRequest([
        {
          enabledState: 'ignore-dependency-changes',
          operationId: OPERATION_A
        }
      ]),
      new TestPhasedRequestClient()
    );

    expect(trueFixture.operations.get(OPERATION_A)?.enabled).toBe(true);
    expect(ignoredDependencyFixture.operations.get(OPERATION_A)?.enabled).toBe(
      'ignore-dependency-changes'
    );

    const mixedFixture: ITestRoutingFixture = createThreeOperationFixture();
    await new PhasedRequestRouter(mixedFixture.session).executeAsync(
      createRequest([
        {
          enabledState: 'ignore-dependency-changes',
          operationId: OPERATION_A
        },
        select(OPERATION_B)
      ]),
      new TestPhasedRequestClient()
    );

    expect(mixedFixture.operations.get(OPERATION_A)?.enabled).toBe(
      'ignore-dependency-changes'
    );
    expect(mixedFixture.operations.get(OPERATION_B)?.enabled).toBe(true);
  });

  it('reconciles invalidations, applies the safe dependency closure, and runs one iteration', async () => {
    const order: string[] = [];
    const fixture: ITestRoutingFixture = createThreeOperationFixture({
      actionAAsync: async (): Promise<void> => {
        order.push('run');
      }
    });
    fixture.session.onReconcileAsync = async (): Promise<void> => {
      order.push('reconcile');
    };
    fixture.graph.hooks.onIterationScheduled.tap('test', () => {
      order.push('schedule');
    });
    const scheduleSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'scheduleIterationAsync');
    const executeSpy: jest.SpyInstance = jest.spyOn(
      fixture.graph,
      'executeScheduledIterationAsync'
    );

    const result = await new PhasedRequestRouter(fixture.session).executeAsync(
      createRequest([select(OPERATION_B)]),
      new TestPhasedRequestClient()
    );

    expect(order).toEqual(['reconcile', 'schedule', 'run']);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
    expect(fixture.runners.get(OPERATION_B)?.runCount).toBe(1);
    expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(0);
    expect(result.operationResults.map(({ operationId }) => operationId)).toEqual([
      OPERATION_A,
      OPERATION_B
    ]);
    expect(result.scheduled).toBe(true);
  });

  it('forwards only enabled operations with ordered client backpressure', async () => {
    const fixture: ITestRoutingFixture = createThreeOperationFixture({
      actionAAsync: async (terminal: ITerminal): Promise<void> => {
        terminal.writeLine('stdout-a');
        terminal.writeErrorLine('stderr-a');
      }
    });
    const client: TestPhasedRequestClient = new TestPhasedRequestClient();
    let concurrentWrites: number = 0;
    let maximumConcurrentWrites: number = 0;
    client.onWriteAsync = async (): Promise<void> => {
      concurrentWrites++;
      maximumConcurrentWrites = Math.max(maximumConcurrentWrites, concurrentWrites);
      await new Promise<void>((resolve) => setImmediate(resolve));
      concurrentWrites--;
    };

    await new PhasedRequestRouter(fixture.session).executeAsync(
      createRequest([select(OPERATION_A)]),
      client
    );

    expect(maximumConcurrentWrites).toBe(1);
    const logWrites: ITestClientWrite[] = client.writes.filter(
      (write: ITestClientWrite) => write.text !== undefined
    );
    expect(logWrites.map(({ operationId }) => operationId)).toEqual([
      OPERATION_A,
      OPERATION_A
    ]);
    expect(logWrites.map(({ stream }) => stream)).toEqual(['stdout', 'stderr']);
    expect(logWrites.map(({ text }) => text)).toEqual(['stdout-a\n', 'stderr-a\n']);
    const eventOperationIds: string[] = client.writes
      .map((write: ITestClientWrite) => write.event)
      .filter((event: IDaemonEventEnvelope | undefined): event is IDaemonEventEnvelope => !!event)
      .map(getEventOperationId)
      .filter((operationId: string | undefined): operationId is string => !!operationId);
    expect(new Set(eventOperationIds)).toEqual(new Set([OPERATION_A]));
    const streamClosedEvent: IDaemonEventEnvelope | undefined = client.writes
      .map((write: ITestClientWrite) => write.event)
      .find(
        (event: IDaemonEventEnvelope | undefined) =>
          (event?.payload as { name?: unknown } | undefined)?.name ===
          RUSHD_OPERATION_STREAM_CLOSED
      );
    expect(streamClosedEvent?.required).toBe(true);
  });

  it('allocates event sequences when queued writes are invoked', async () => {
    let releaseFirstEvent: (() => void) | undefined;
    let markFirstEventStarted: (() => void) | undefined;
    const firstEventStarted: Promise<void> = new Promise<void>((resolve) => {
      markFirstEventStarted = resolve;
    });
    const fixture: ITestRoutingFixture = createThreeOperationFixture();
    const client: TestPhasedRequestClient = new TestPhasedRequestClient();
    let hasBlockedEvent: boolean = false;
    client.onWriteAsync = async (write: ITestClientWrite): Promise<void> => {
      if (write.event && !hasBlockedEvent) {
        hasBlockedEvent = true;
        markFirstEventStarted?.();
        await new Promise<void>((resolve) => {
          releaseFirstEvent = resolve;
        });
      }
    };

    const requestPromise = new PhasedRequestRouter(fixture.session).executeAsync(
      createRequest([select(OPERATION_A)]),
      client
    );
    await firstEventStarted;
    const interleavedSequence: number = client.getNextEventSequence();
    releaseFirstEvent?.();
    await requestPromise;

    const routedSequences: number[] = client.writes
      .map(({ event }) => event?.sequence)
      .filter((sequence: number | undefined): sequence is number => sequence !== undefined);
    expect(routedSequences[0]).toBe(1);
    expect(interleavedSequence).toBe(2);
    expect(routedSequences.slice(1).every((sequence) => sequence > interleavedSequence)).toBe(true);
  });

  it('returns client-scoped failures without converting them to routing errors', async () => {
    const fixture: ITestRoutingFixture = createThreeOperationFixture({
      statusA: OperationStatus.Failure
    });

    const result = await new PhasedRequestRouter(fixture.session).executeAsync(
      createRequest([select(OPERATION_A)]),
      new TestPhasedRequestClient()
    );

    expect(result.operationResults).toEqual([
      { errorMessage: undefined, operationId: OPERATION_A, status: OperationStatus.Failure }
    ]);
  });

  it('aborts a cancelled iteration, restores subscriptions, and keeps runners reusable', async () => {
    let releaseOperationA: (() => void) | undefined;
    let markOperationAStarted: (() => void) | undefined;
    const operationAStarted: Promise<void> = new Promise<void>((resolve) => {
      markOperationAStarted = resolve;
    });
    const fixture: ITestRoutingFixture = createThreeOperationFixture({
      actionAAsync: async (): Promise<void> => {
        markOperationAStarted?.();
        await new Promise<void>((resolve) => {
          releaseOperationA = resolve;
        });
      }
    });
    let workspaceStatusEventCount: number = 0;
    const previousSink = {
      onOperationStatusChanged: (): void => {
        workspaceStatusEventCount++;
      }
    };
    fixture.graph.eventSink = previousSink;
    const client: TestPhasedRequestClient = new TestPhasedRequestClient();
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const requestPromise = router.executeAsync(
      createRequest([select(OPERATION_B)]),
      client
    );
    await operationAStarted;
    client.abortController.abort();
    releaseOperationA?.();

    const result = await requestPromise;

    expect(result.aborted).toBe(true);
    expect(
      result.operationResults.find(({ operationId }) => operationId === OPERATION_B)?.status
    ).toBe(OperationStatus.Aborted);
    expect(fixture.graph.pauseNextIteration).toBe(false);
    expect(fixture.runners.get(OPERATION_A)?.closeCount).toBe(0);
    expect(fixture.runners.get(OPERATION_B)?.closeCount).toBe(0);
    const completedClientWriteCount: number = client.writes.length;
    fixture.graph.invalidateOperations(undefined, 'after request');
    expect(client.writes).toHaveLength(completedClientWriteCount);
    expect(workspaceStatusEventCount).toBeGreaterThan(0);

    const followUp = await router.executeAsync(
      createRequest([select(OPERATION_C)]),
      new TestPhasedRequestClient()
    );
    expect(followUp.operationResults[0]?.status).toBe(OperationStatus.Success);
  });

  it('does not combine an observed result with an error retained from a prior iteration', async () => {
    let invocation: number = 0;
    let releaseOperationA: (() => void) | undefined;
    let markOperationAStarted: (() => void) | undefined;
    const operationAStarted: Promise<void> = new Promise<void>((resolve) => {
      markOperationAStarted = resolve;
    });
    const fixture: ITestRoutingFixture = createThreeOperationFixture({
      actionAAsync: async (): Promise<void> => {
        if (invocation++ === 0) {
          throw new Error('first iteration failure');
        }
        markOperationAStarted?.();
        await new Promise<void>((resolve) => {
          releaseOperationA = resolve;
        });
      }
    });
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const first = await router.executeAsync(
      createRequest([select(OPERATION_B)]),
      new TestPhasedRequestClient()
    );
    expect(
      first.operationResults.find(({ operationId }) => operationId === OPERATION_A)?.errorMessage
    ).toBe('first iteration failure');

    const secondClient: TestPhasedRequestClient = new TestPhasedRequestClient();
    const secondPromise = router.executeAsync(
      { ...createRequest([select(OPERATION_B)]), requestId: 'request-2' },
      secondClient
    );
    await operationAStarted;
    secondClient.abortController.abort();
    releaseOperationA?.();
    const second = await secondPromise;

    expect(
      second.operationResults.find(({ operationId }) => operationId === OPERATION_A)?.errorMessage
    ).toBeUndefined();
  });

  it('aborts and unsubscribes when a disconnected client rejects a write', async () => {
    let releaseOperationA: (() => void) | undefined;
    const fixture: ITestRoutingFixture = createThreeOperationFixture({
      actionAAsync: async (terminal: ITerminal): Promise<void> => {
        terminal.writeLine('disconnect');
        await new Promise<void>((resolve) => {
          releaseOperationA = resolve;
        });
      }
    });
    const client: TestPhasedRequestClient = new TestPhasedRequestClient();
    client.onWriteAsync = async (write: ITestClientWrite): Promise<void> => {
      if (write.text !== undefined) {
        releaseOperationA?.();
        throw new Error('client disconnected');
      }
    };

    await expect(
      new PhasedRequestRouter(fixture.session).executeAsync(
        createRequest([select(OPERATION_B)]),
        client
      )
    ).rejects.toThrow('client disconnected');
    expect(fixture.graph.pauseNextIteration).toBe(false);
    expect(fixture.runners.get(OPERATION_A)?.closeCount).toBe(0);
  });

  it('re-aborts after an early write failure crosses the schedule boundary', async () => {
    const fixture: ITestRoutingFixture = createThreeOperationFixture();
    const client: TestPhasedRequestClient = new TestPhasedRequestClient();
    client.onWriteAsync = async (): Promise<void> => {
      throw new Error('client disconnected before execution');
    };

    await expect(
      new PhasedRequestRouter(fixture.session).executeAsync(
        createRequest([select(OPERATION_B)]),
        client
      )
    ).rejects.toThrow('client disconnected before execution');
    expect(fixture.runners.get(OPERATION_B)?.runCount).toBe(0);
    expect(fixture.graph.hasScheduledIteration).toBe(false);
  });

  it('serializes independent router instances that share one warm graph', async () => {
    let releaseOperationA: (() => void) | undefined;
    let markOperationAStarted: (() => void) | undefined;
    const operationAStarted: Promise<void> = new Promise<void>((resolve) => {
      markOperationAStarted = resolve;
    });
    const fixture: ITestRoutingFixture = createThreeOperationFixture({
      actionAAsync: async (): Promise<void> => {
        markOperationAStarted?.();
        await new Promise<void>((resolve) => {
          releaseOperationA = resolve;
        });
      }
    });
    const firstPromise = new PhasedRequestRouter(fixture.session).executeAsync(
      createRequest([select(OPERATION_A)]),
      new TestPhasedRequestClient()
    );
    await operationAStarted;
    const secondPromise = new PhasedRequestRouter(fixture.session).executeAsync(
      { ...createRequest([select(OPERATION_C)]), requestId: 'request-2' },
      new TestPhasedRequestClient()
    );
    await Promise.resolve();
    expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(0);
    releaseOperationA?.();

    await Promise.all([firstPromise, secondPromise]);
    expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(1);
  });

  it('drains and aborts a scheduled iteration when a scheduling hook fails', async () => {
    const fixture: ITestRoutingFixture = createThreeOperationFixture();
    fixture.graph.hooks.onIterationScheduled.tap('throwing test hook', () => {
      throw new Error('scheduling hook failed');
    });

    await expect(
      new PhasedRequestRouter(fixture.session).executeAsync(
        createRequest([select(OPERATION_A)]),
        new TestPhasedRequestClient()
      )
    ).rejects.toThrow('scheduling hook failed');
    expect(fixture.graph.hasScheduledIteration).toBe(false);
    expect(fixture.graph.status).not.toBe(OperationStatus.Executing);
    const completedRunCount: number = fixture.runners.get(OPERATION_A)?.runCount ?? 0;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(completedRunCount);
  });

  it('returns retained results when real graph hooks collapse a repeated warm request to no work', async () => {
    const fixture: ITestRoutingFixture = createThreeOperationFixture();
    let iteration: number = 0;
    fixture.graph.hooks.configureIteration.tap('warm no-op', (records, previousResults) => {
      if (iteration++ === 0) {
        return;
      }
      for (const record of records.values()) {
        if (previousResults.has(record.operation)) {
          record.enabled = false;
        }
      }
    });
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const sequenceState: { next: number } = { next: 1 };
    const firstClient: TestPhasedRequestClient = new TestPhasedRequestClient(sequenceState);
    const secondClient: TestPhasedRequestClient = new TestPhasedRequestClient(sequenceState);

    const first = await router.executeAsync(
      createRequest([select(OPERATION_A)]),
      firstClient
    );
    const second = await router.executeAsync(
      { ...createRequest([select(OPERATION_A)]), requestId: 'request-2' },
      secondClient
    );

    expect(first.scheduled).toBe(true);
    expect(second.scheduled).toBe(false);
    expect(second.operationResults).toEqual(first.operationResults);
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
    const firstSequences: number[] = firstClient.writes
      .map(({ event }) => event?.sequence)
      .filter((sequence: number | undefined): sequence is number => sequence !== undefined);
    const secondSequences: number[] = secondClient.writes
      .map(({ event }) => event?.sequence)
      .filter((sequence: number | undefined): sequence is number => sequence !== undefined);
    expect(firstSequences.length).toBeGreaterThan(0);
    expect(secondSequences[0]).toBeGreaterThan(firstSequences[firstSequences.length - 1]);
  });
});
