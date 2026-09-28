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
const PROMPT_CANCELLATION_MS: number = 1000;
const TIMED_OUT: 'timed out' = 'timed out';

async function raceWithTimeoutAsync<T>(promise: Promise<T>, timeoutMs: number): Promise<T | typeof TIMED_OUT> {
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

/** An operation that only finishes when released, or when its hard-abort signal fires (like a killed process). */
function createHangingOperation(): {
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
    await Promise.race([aborted, released]);
    if (abortSignal.aborted) {
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
    let onReconciling: () => void = () => undefined;
    const reconciling: Promise<void> = new Promise<void>((resolve) => (onReconciling = resolve));
    let releaseReconcile: () => void = () => undefined;
    const reconcileReleased: Promise<void> = new Promise<void>((resolve) => (releaseReconcile = resolve));
    fixture.session.onReconcileAsync = async () => {
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
    // Accepted while the batch is still being prepared, so it joins once preparation finishes.
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

    releaseReconcile();
    await hanging.started;
    expect(hanging.signals.map((signal: AbortSignal) => signal.aborted)).toEqual([false]);
    expect(abortSpy).not.toHaveBeenCalledWith({ terminateRunning: true });
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
    expect(abortSpy).toHaveBeenCalledWith({ terminateRunning: true });
    expect(fixture.runners.get(OPERATION_B)?.runCount).toBe(0);
    expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(0);
    // The remaining client's result stays warm; the abandoned operations are not retained.
    expect(new Set([...fixture.graph.resultByOperation.keys()].map(({ name }) => name))).toEqual(
      new Set([OPERATION_A])
    );
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
});
