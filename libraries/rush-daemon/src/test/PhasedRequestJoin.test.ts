// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type {
  IDaemonPhasedRequest,
  IDaemonPhasedRequestResult,
  IDaemonRequestAdmissionOptions
} from '@rushstack/rush-daemon-protocol';
import { OperationStatus, RushConfiguration } from '@microsoft/rush-lib';
import type {
  IInputsSnapshot,
  IOperationGraphIterationOptions,
  IPhasedCommandEngineRequestSettings,
  Operation
} from '@microsoft/rush-lib';

import { PhasedRequestRouter } from '../PhasedRequestRouter';
import type { IPhasedRequestTelemetryReport, IPhasedRequestTelemetrySink } from '../PhasedRequestTelemetry';
import { RequestExclusivityClass } from '../RequestScheduler';
import type { IRequestLease, RequestScheduler } from '../RequestScheduler';
import type {
  IPeekWorkspaceInvalidationsOptions,
  IWorkspaceInvalidationPeek
} from '../WorkspaceEngineComponentFactory';
import { RequestAdmissionController } from '../WorkspaceRequestAdmission';
import {
  TEST_ENGINE_SHAPE,
  TestOperationRunner,
  TestPhasedRequestClient,
  createRoutingFixture
} from './PhasedRequestRouterTestUtilities';
import type { ITestRoutingFixture } from './PhasedRequestRouterTestUtilities';
import { TEST_REPO_ROOT } from './TestWorkspaceSession';

const JOIN_VARIABLE: string = 'RUSH_DAEMON_JOIN_RUNNING_BATCH';
const COBUILD_VARIABLE: string = 'RUSH_COBUILD_CONTEXT_ID';
/** A variable that a request's environment passes to the operations that are attributed to it. */
const SESSION_VARIABLE: string = 'COPILOT_AGENT_SESSION_ID';
const OPERATION_A: string = 'project-a (_phase:test)';
const OPERATION_B: string = 'project-b (_phase:test)';
const OPERATION_C: string = 'project-c (_phase:test)';
const OPERATION_IDS: ReadonlyArray<string> = [OPERATION_A, OPERATION_B, OPERATION_C];

function restoreVariable(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

/**
 * Loads the test repository's configuration as a daemon started with `value` as the value of the join variable
 * loads it, so that the checks of the Rush environment and of the daemon configuration apply to the variable.
 */
function loadConfiguration(value: string): RushConfiguration {
  const previousValue: string | undefined = process.env[JOIN_VARIABLE];
  process.env[JOIN_VARIABLE] = value;
  try {
    return RushConfiguration.loadFromConfigurationFile(path.join(TEST_REPO_ROOT, 'rush.json'));
  } finally {
    restoreVariable(JOIN_VARIABLE, previousValue);
  }
}

const JOIN_CONFIGURATION: RushConfiguration = loadConfiguration('1');
const NO_JOIN_CONFIGURATION: RushConfiguration = loadConfiguration('0');

interface IDeferred<T = void> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function createDeferred<T = void>(): IDeferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise: Promise<T> = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: (value: T) => resolvePromise?.(value) };
}

/** Controls one operation's runner: the runner reports its start and, if blocked, waits until it is released. */
interface IOperationGate {
  readonly blocked: boolean;
  readonly released: IDeferred;
  readonly started: IDeferred;
}

interface ITestPeek extends IWorkspaceInvalidationPeek {
  readonly commit: jest.Mock;
  readonly discard: jest.Mock;
}

/** The messages that the router logged about requests that tried to join an executing iteration. */
const joinLog: string[] = [];
let stderrSpy: jest.SpyInstance | undefined;
let previousJoinValue: string | undefined;
let previousCobuildValue: string | undefined;

interface IJoinFixture {
  readonly fixture: ITestRoutingFixture;
  readonly gates: ReadonlyMap<string, IOperationGate>;
  readonly inputsSnapshot: IInputsSnapshot;
  readonly peekCalls: IPeekWorkspaceInvalidationsOptions[];
  readonly peeks: ITestPeek[];
  readonly router: PhasedRequestRouter;
  readonly scheduleSpy: jest.SpyInstance;
  /** The value of `SESSION_VARIABLE` in the environment in which each operation last ran. */
  readonly sessions: ReadonlyMap<string, string | undefined>;
  /** Replaces the default peek, which reports no invalidations. */
  peekAsync: (() => Promise<IWorkspaceInvalidationPeek | undefined>) | undefined;
}

interface IJoinFixtureOptions {
  /** Pairs of a consumer and its dependency. */
  readonly dependencies?: ReadonlyArray<readonly [string, string]>;
  readonly failedOperationIds?: ReadonlyArray<string>;
  /** Whether the daemon configuration of the session enables `joinRunningBatch`; true by default. */
  readonly joinRunningBatch?: boolean;
}

function createJoinFixture(
  blockedOperationIds: ReadonlyArray<string> = [],
  { dependencies = [], failedOperationIds = [], joinRunningBatch = true }: IJoinFixtureOptions = {}
): IJoinFixture {
  const gates: Map<string, IOperationGate> = new Map();
  const runners: Map<string, TestOperationRunner> = new Map();
  const sessions: Map<string, string | undefined> = new Map();
  for (const operationId of OPERATION_IDS) {
    const gate: IOperationGate = {
      blocked: blockedOperationIds.includes(operationId),
      released: createDeferred(),
      started: createDeferred()
    };
    gates.set(operationId, gate);
    runners.set(
      operationId,
      new TestOperationRunner(
        operationId,
        failedOperationIds.includes(operationId) ? OperationStatus.Failure : OperationStatus.Success,
        async (terminal, context): Promise<void> => {
          sessions.set(operationId, context.environment?.[SESSION_VARIABLE]);
          gate.started.resolve();
          if (gate.blocked) {
            await gate.released.promise;
          }
        }
      )
    );
  }
  const fixture: ITestRoutingFixture = createRoutingFixture(runners, dependencies, { parallelism: 3 });
  const inputsSnapshot: IInputsSnapshot = {
    getOperationOwnStateHash: () => 'hash',
    getTrackedFileHashesForOperation: () => new Map(),
    hasUncommittedChanges: false,
    hashes: new Map(),
    rootDirectory: TEST_REPO_ROOT
  };
  const peeks: ITestPeek[] = [];
  const peekCalls: IPeekWorkspaceInvalidationsOptions[] = [];
  const joinFixture: IJoinFixture = {
    fixture,
    gates,
    inputsSnapshot,
    peekCalls,
    peeks,
    router: new PhasedRequestRouter(fixture.session),
    scheduleSpy: jest.spyOn(fixture.graph, 'scheduleIterationAsync'),
    sessions,
    peekAsync: undefined
  };
  Object.assign(fixture.session, {
    inputsSnapshot,
    rushConfiguration: joinRunningBatch ? JOIN_CONFIGURATION : NO_JOIN_CONFIGURATION,
    peekInvalidationsAsync: async (
      options: IPeekWorkspaceInvalidationsOptions
    ): Promise<IWorkspaceInvalidationPeek | undefined> => {
      peekCalls.push(options);
      if (joinFixture.peekAsync) {
        return await joinFixture.peekAsync();
      }
      return createTestPeek(joinFixture);
    }
  });
  return joinFixture;
}

function createTestPeek(joinFixture: IJoinFixture, invalidated: Iterable<Operation> = []): ITestPeek {
  const peek: ITestPeek = {
    inputsSnapshot: joinFixture.inputsSnapshot,
    invalidatedOperations: new Set(invalidated),
    invalidationReason: 'test-inputs-changed',
    commit: jest.fn(),
    discard: jest.fn()
  };
  joinFixture.peeks.push(peek);
  return peek;
}

function createRequest(
  requestId: string,
  operationIds: ReadonlyArray<string>,
  admission?: IDaemonRequestAdmissionOptions
): IDaemonPhasedRequest {
  return {
    commandName: 'build',
    commandOrigin: 'built-in',
    engineShape: TEST_ENGINE_SHAPE,
    environment: {},
    operationSelection: operationIds.map((operationId: string) => ({ enabledState: true, operationId })),
    requestId,
    ...(admission ? { admission } : {})
  };
}

function withSession(request: IDaemonPhasedRequest, session: string): IDaemonPhasedRequest {
  return { ...request, environment: { [SESSION_VARIABLE]: session } };
}

function getOperationStatuses(result: IDaemonPhasedRequestResult): Record<string, string> {
  return Object.fromEntries(result.operationResults.map(({ operationId, status }) => [operationId, status]));
}

/** Records when a result arrived, relative to the other events of a test. */
function track(
  resultPromise: Promise<IDaemonPhasedRequestResult>,
  label: string,
  events: string[]
): Promise<IDaemonPhasedRequestResult> {
  return resultPromise.then((result: IDaemonPhasedRequestResult) => {
    events.push(`result:${label}`);
    return result;
  });
}

async function settleAsync(): Promise<void> {
  for (let turn: number = 0; turn < 20; turn++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function waitForAsync(condition: () => boolean): Promise<void> {
  for (let turn: number = 0; turn < 200; turn++) {
    if (condition()) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('The condition was not met.');
}

function collectTelemetry(reports: IPhasedRequestTelemetryReport[]): IPhasedRequestTelemetrySink {
  return { logRequest: (report: IPhasedRequestTelemetryReport) => reports.push(report) };
}

beforeEach(() => {
  previousJoinValue = process.env[JOIN_VARIABLE];
  previousCobuildValue = process.env[COBUILD_VARIABLE];
  // Only the daemon configuration that the session loaded enables joining.
  delete process.env[JOIN_VARIABLE];
  delete process.env[COBUILD_VARIABLE];
  joinLog.length = 0;
  const write: typeof process.stderr.write = process.stderr.write.bind(process.stderr);
  stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown, ...rest: never[]) => {
    const text: string = String(chunk);
    if (text.includes('the executing iteration')) {
      joinLog.push(
        text
          .replace(/^\S+ /, '')
          .replace(/ after \d+ ms/, '')
          .trimEnd()
      );
      return true;
    }
    return write(chunk as string, ...rest);
  }) as typeof process.stderr.write);
});

afterEach(() => {
  stderrSpy?.mockRestore();
  restoreVariable(JOIN_VARIABLE, previousJoinValue);
  restoreVariable(COBUILD_VARIABLE, previousCobuildValue);
});

describe('a request that arrives while a compatible batch executes', () => {
  it('joins the executing iteration and gets its result while the batch still runs', async () => {
    const { fixture, gates, peekCalls, peeks, router, scheduleSpy } = createJoinFixture([OPERATION_C]);
    const events: string[] = [];
    const first: Promise<IDaemonPhasedRequestResult> = track(
      router.executeAsync(createRequest('first', [OPERATION_C]), new TestPhasedRequestClient('first')),
      'first',
      events
    );
    await gates.get(OPERATION_C)!.started.promise;

    const joined: IDaemonPhasedRequestResult = await router.executeAsync(
      createRequest('joined', [OPERATION_A]),
      new TestPhasedRequestClient('joined')
    );
    events.push('C released');
    gates.get(OPERATION_C)!.released.resolve();
    const firstResult: IDaemonPhasedRequestResult = await first;

    expect(events).toEqual(['C released', 'result:first']);
    expect(joined).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(getOperationStatuses(joined)).toEqual({ [OPERATION_A]: OperationStatus.Success });
    expect(firstResult).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(getOperationStatuses(firstResult)).toEqual({ [OPERATION_C]: OperationStatus.Success });
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect((scheduleSpy.mock.calls[0][0] as IOperationGraphIterationOptions).holdUnneededOperations).toBe(
      true
    );
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
    expect(fixture.runners.get(OPERATION_B)?.runCount).toBe(0);
    expect(peekCalls).toHaveLength(1);
    expect(peekCalls[0].executingIterationRecords.has(fixture.operations.get(OPERATION_C)!)).toBe(true);
    expect(peeks[0].commit).toHaveBeenCalledTimes(1);
    expect(peeks[0].discard).not.toHaveBeenCalled();
    expect(joinLog).toEqual(['Request joined joined the executing iteration.']);
  });

  it('loads the join setting of a daemon started with the variable', () => {
    expect(JOIN_CONFIGURATION.daemon.joinRunningBatch).toBe(true);
    expect(NO_JOIN_CONFIGURATION.daemon.joinRunningBatch).toBe(false);
  });

  it('waits for the iteration to end as before when the daemon configuration does not enable joining', async () => {
    // The variable in the daemon's environment at request time does not matter; its configuration does.
    process.env[JOIN_VARIABLE] = '1';
    const { fixture, gates, peekCalls, router, scheduleSpy } = createJoinFixture([OPERATION_C], {
      joinRunningBatch: false
    });
    const events: string[] = [];
    const first: Promise<IDaemonPhasedRequestResult> = track(
      router.executeAsync(createRequest('first', [OPERATION_C]), new TestPhasedRequestClient('first')),
      'first',
      events
    );
    await gates.get(OPERATION_C)!.started.promise;
    const late: Promise<IDaemonPhasedRequestResult> = track(
      router.executeAsync(createRequest('late', [OPERATION_A]), new TestPhasedRequestClient('late')),
      'late',
      events
    );
    await settleAsync();
    events.push('C released');
    gates.get(OPERATION_C)!.released.resolve();
    const [firstResult, lateResult] = await Promise.all([first, late]);

    expect(events).toEqual(['C released', 'result:first', 'result:late']);
    expect(firstResult.outcome).toBe('success');
    expect(lateResult.outcome).toBe('success');
    expect(scheduleSpy).toHaveBeenCalledTimes(2);
    expect(scheduleSpy.mock.calls[0][0]).not.toHaveProperty('holdUnneededOperations');
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
    expect(peekCalls).toHaveLength(0);
    expect(joinLog).toEqual([]);
  });

  it('gives a participant whose operations are done its result when a request joins', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C, OPERATION_A]);
    const { gates, router } = joinFixture;
    const events: string[] = [];
    const peekReleased: IDeferred = createDeferred();
    const peekStarted: IDeferred = createDeferred();
    joinFixture.peekAsync = async () => {
      peekStarted.resolve();
      await peekReleased.promise;
      return createTestPeek(joinFixture);
    };
    const first: Promise<IDaemonPhasedRequestResult> = track(
      router.executeAsync(createRequest('first', [OPERATION_C]), new TestPhasedRequestClient('first')),
      'first',
      events
    );
    await gates.get(OPERATION_C)!.started.promise;
    const joined: Promise<IDaemonPhasedRequestResult> = track(
      router.executeAsync(createRequest('joined', [OPERATION_A]), new TestPhasedRequestClient('joined')),
      'joined',
      events
    );
    await peekStarted.promise;
    // The first request's operations finish while the join reads the inputs, which keeps the iteration running.
    gates.get(OPERATION_C)!.released.resolve();
    await settleAsync();
    events.push('peek released');
    peekReleased.resolve();
    await gates.get(OPERATION_A)!.started.promise;
    await settleAsync();
    events.push('A released');
    gates.get(OPERATION_A)!.released.resolve();
    const [firstResult, joinedResult] = await Promise.all([first, joined]);

    expect(events).toEqual(['peek released', 'result:first', 'A released', 'result:joined']);
    expect(firstResult).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(getOperationStatuses(firstResult)).toEqual({ [OPERATION_C]: OperationStatus.Success });
    expect(joinedResult).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(joinLog).toEqual(['Request joined joined the executing iteration.']);
  });

  it('gives a failed participant its result when a request joins', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_B, OPERATION_A], {
      dependencies: [[OPERATION_C, OPERATION_B]],
      failedOperationIds: [OPERATION_B]
    });
    const { gates, router } = joinFixture;
    const events: string[] = [];
    const peekReleased: IDeferred = createDeferred();
    const peekStarted: IDeferred = createDeferred();
    joinFixture.peekAsync = async () => {
      peekStarted.resolve();
      await peekReleased.promise;
      return createTestPeek(joinFixture);
    };
    const first: Promise<IDaemonPhasedRequestResult> = track(
      router.executeAsync(
        { ...createRequest('first', [OPERATION_C]), returnEarlyOnFailure: true },
        new TestPhasedRequestClient('first')
      ),
      'first',
      events
    );
    await gates.get(OPERATION_B)!.started.promise;
    const joined: Promise<IDaemonPhasedRequestResult> = track(
      router.executeAsync(createRequest('joined', [OPERATION_A]), new TestPhasedRequestClient('joined')),
      'joined',
      events
    );
    await peekStarted.promise;
    // The failure blocks the first request's target, and its blocked operation completes only when the iteration
    // ends, so its failed result waits for another participant.
    gates.get(OPERATION_B)!.released.resolve();
    await settleAsync();
    events.push('peek released');
    peekReleased.resolve();
    await gates.get(OPERATION_A)!.started.promise;
    await settleAsync();
    events.push('A released');
    gates.get(OPERATION_A)!.released.resolve();
    const [firstResult, joinedResult] = await Promise.all([first, joined]);

    expect(events).toEqual(['peek released', 'result:first', 'A released', 'result:joined']);
    expect(firstResult).toMatchObject({ outcome: 'failure' });
    expect(getOperationStatuses(firstResult)).toEqual({
      [OPERATION_B]: OperationStatus.Failure,
      [OPERATION_C]: OperationStatus.Blocked
    });
    expect(joinedResult).toMatchObject({ exitCode: 0, outcome: 'success' });
  });

  it('gives a request whose operations already ran in the iteration its result at once', async () => {
    const { fixture, gates, router, scheduleSpy } = createJoinFixture([OPERATION_C]);
    const events: string[] = [];
    const first: Promise<IDaemonPhasedRequestResult> = track(
      router.executeAsync(
        createRequest('first', [OPERATION_A, OPERATION_C]),
        new TestPhasedRequestClient('first')
      ),
      'first',
      events
    );
    await gates.get(OPERATION_C)!.started.promise;
    await waitForAsync(() => fixture.runners.get(OPERATION_A)!.runCount === 1);
    await settleAsync();

    const joined: IDaemonPhasedRequestResult = await router.executeAsync(
      createRequest('joined', [OPERATION_A]),
      new TestPhasedRequestClient('joined')
    );
    events.push('C released');
    gates.get(OPERATION_C)!.released.resolve();
    await first;

    expect(events).toEqual(['C released', 'result:first']);
    expect(joined).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(getOperationStatuses(joined)).toEqual({ [OPERATION_A]: OperationStatus.Success });
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });

  it.each<[string, IDaemonRequestAdmissionOptions | undefined]>([
    ['without admission options', undefined],
    ['with the default wait timeout', { waitTimeoutMs: 30_000, waitTimeoutIsDefault: true }],
    ['with an explicit wait timeout', { waitTimeoutMs: 60_000 }]
  ])('waits for the iteration to start before it joins, %s', async (title, admission) => {
    const { gates, router, scheduleSpy, fixture } = createJoinFixture([OPERATION_C]);
    const reconcileStarted: IDeferred = createDeferred();
    const reconcileReleased: IDeferred = createDeferred();
    fixture.session.onReconcileAsync = async () => {
      reconcileStarted.resolve();
      await reconcileReleased.promise;
    };
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await reconcileStarted.promise;
    fixture.session.onReconcileAsync = undefined;
    // Received after the reconcile started, so it cannot join the batch before it executes.
    const joined: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('joined', [OPERATION_A], admission),
      new TestPhasedRequestClient('joined')
    );
    await settleAsync();
    reconcileReleased.resolve();

    expect(await joined).toMatchObject({ exitCode: 0, outcome: 'success' });
    gates.get(OPERATION_C)!.released.resolve();
    expect((await first).outcome).toBe('success');
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect(joinLog).toEqual(['Request joined joined the executing iteration.']);
  });

  it('takes part in the batch telemetry as a request that joined', async () => {
    const { gates, router } = createJoinFixture([OPERATION_C]);
    const firstReports: IPhasedRequestTelemetryReport[] = [];
    const joinedReports: IPhasedRequestTelemetryReport[] = [];
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first'),
      false,
      undefined,
      undefined,
      collectTelemetry(firstReports)
    );
    await gates.get(OPERATION_C)!.started.promise;
    await router.executeAsync(
      createRequest('joined', [OPERATION_A]),
      new TestPhasedRequestClient('joined'),
      false,
      undefined,
      undefined,
      collectTelemetry(joinedReports)
    );
    gates.get(OPERATION_C)!.released.resolve();
    await first;

    expect(joinedReports).toHaveLength(1);
    const [joinedReport] = joinedReports;
    expect(joinedReport).toMatchObject({
      batchSize: 2,
      earlyResult: true,
      joinedIteration: true,
      scheduled: true
    });
    expect(joinedReport.measures.map(({ name }) => name)).toEqual([
      'rush:daemon:admission',
      'rush:daemon:queueWait',
      'rush:daemon:joinRunningIteration',
      'rush:daemon:reconcileInvalidations',
      'rush:daemon:applySelections',
      'rush:daemon:scheduleIteration',
      'rush:daemon:executeIteration'
    ]);
    const joinMeasure = joinedReport.measures[2];
    expect(joinedReport.executionStartTimeMs).toBe(joinMeasure.startTimeMs);
    expect(joinedReport.iterationStartTimeMs).toBeGreaterThanOrEqual(joinMeasure.startTimeMs);
    expect(joinedReport.iterationStartTimeMs).toBeLessThanOrEqual(joinMeasure.endTimeMs);
    expect(firstReports).toHaveLength(1);
    expect(firstReports[0]).toMatchObject({ batchSize: 2, earlyResult: false });
    expect(firstReports[0]).not.toHaveProperty('joinedIteration');
    expect(firstReports[0].measures.map(({ name }) => name)).not.toContain(
      'rush:daemon:joinRunningIteration'
    );
  });

  it('ends the execution measure of a request that joined when the iteration ends', async () => {
    const { gates, router } = createJoinFixture([OPERATION_C], {
      dependencies: [[OPERATION_A, OPERATION_C]]
    });
    const joinedReports: IPhasedRequestTelemetryReport[] = [];
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await gates.get(OPERATION_C)!.started.promise;
    const joined: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('joined', [OPERATION_A]),
      new TestPhasedRequestClient('joined'),
      false,
      undefined,
      undefined,
      collectTelemetry(joinedReports)
    );
    await waitForAsync(() => joinLog.length === 1);
    gates.get(OPERATION_C)!.released.resolve();

    expect(await joined).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect((await first).outcome).toBe('success');
    // Its work was the last that the iteration ran, so its result waited for the iteration to end.
    expect(joinedReports).toHaveLength(1);
    const [joinedReport] = joinedReports;
    expect(joinedReport).toMatchObject({ earlyResult: false, joinedIteration: true });
    const executeMeasure = joinedReport.measures.find(({ name }) => name === 'rush:daemon:executeIteration');
    expect(executeMeasure!.endTimeMs).toBeLessThan(joinedReport.resultTimeMs);
  });

  it('keeps work that it needs from being withheld after another participant left', async () => {
    const { gates, router } = createJoinFixture([OPERATION_C, OPERATION_A]);
    const leaving: TestPhasedRequestClient = new TestPhasedRequestClient('leaving');
    const staying: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('staying', [OPERATION_C]),
      new TestPhasedRequestClient('staying')
    );
    const left: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('leaving', [OPERATION_C]),
      leaving
    );
    await gates.get(OPERATION_C)!.started.promise;
    leaving.abortController.abort();
    expect(await left).toMatchObject({ aborted: true });

    const joined: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('joined', [OPERATION_A]),
      new TestPhasedRequestClient('joined')
    );
    await gates.get(OPERATION_A)!.started.promise;
    // The work of the request that joined is still running when the last operation that the batch needed ends.
    gates.get(OPERATION_C)!.released.resolve();
    expect((await staying).outcome).toBe('success');
    gates.get(OPERATION_A)!.released.resolve();

    const joinedResult: IDaemonPhasedRequestResult = await joined;
    expect(joinedResult).toMatchObject({ aborted: false, exitCode: 0, outcome: 'success' });
    expect(getOperationStatuses(joinedResult)).toEqual({ [OPERATION_A]: OperationStatus.Success });
  });

  it('answers a request that joined and then cancelled while the batch runs on', async () => {
    const { gates, router } = createJoinFixture([OPERATION_C, OPERATION_A]);
    const joinedClient: TestPhasedRequestClient = new TestPhasedRequestClient('joined');
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await gates.get(OPERATION_C)!.started.promise;
    const joined: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('joined', [OPERATION_A]),
      joinedClient
    );
    await gates.get(OPERATION_A)!.started.promise;
    joinedClient.abortController.abort();

    expect(await joined).toMatchObject({ aborted: true });
    // The operation that the request started runs on, as another participant still needs the iteration.
    gates.get(OPERATION_A)!.released.resolve();
    await settleAsync();
    gates.get(OPERATION_C)!.released.resolve();
    expect(await first).toMatchObject({ aborted: false, exitCode: 0, outcome: 'success' });
    expect(joinLog).toEqual(['Request joined joined the executing iteration.']);
  });

  it('fails only the request that joined when its execution cannot start', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    const { fixture, gates, router, scheduleSpy } = joinFixture;
    const getEnabledStates = (): Operation['enabled'][] =>
      OPERATION_IDS.map((operationId: string) => fixture.operations.get(operationId)!.enabled);
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await gates.get(OPERATION_C)!.started.promise;
    const enabledStates: Operation['enabled'][] = getEnabledStates();

    const joined: IDaemonPhasedRequestResult = await router.executeAsync(
      createRequest('joined', [OPERATION_A]),
      new TestPhasedRequestClient('joined'),
      false,
      () => {
        throw new Error('The workspace generation changed.');
      }
    );
    expect(getEnabledStates()).toEqual(enabledStates);
    gates.get(OPERATION_C)!.released.resolve();

    expect(joined).toMatchObject({
      errorMessage: 'The workspace generation changed.',
      exitCode: 1,
      scheduled: false
    });
    expect(await first).toMatchObject({ exitCode: 0, outcome: 'success' });
    // None of its work was added to the iteration.
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(0);
    expect(joinFixture.peeks[0].discard).toHaveBeenCalledTimes(1);
    expect(joinFixture.peeks[0].commit).not.toHaveBeenCalled();
    expect(joinLog).toEqual([
      'Request joined did not join the executing iteration: its execution could not start: The workspace generation changed.'
    ]);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });

  it('starts a request that joins only once the iteration takes its work', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    const { fixture, gates, router } = joinFixture;
    const events: string[] = [];
    const { graph } = fixture;
    const tryExtendCurrentIteration: typeof graph.tryExtendCurrentIteration =
      graph.tryExtendCurrentIteration.bind(graph);
    jest.spyOn(graph, 'tryExtendCurrentIteration').mockImplementation((options) => {
      events.push('extend');
      const extension: ReturnType<typeof tryExtendCurrentIteration> = tryExtendCurrentIteration(options);
      events.push(`extended: ${extension.extended}`);
      return extension;
    });
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first'),
      false,
      () => {
        events.push('first starts');
      }
    );
    await gates.get(OPERATION_C)!.started.promise;
    const joinedClient: TestPhasedRequestClient = new TestPhasedRequestClient('joined');
    joinedClient.onWriteAsync = async ({ requestStarted }: { readonly requestStarted?: boolean }) => {
      if (requestStarted) {
        events.push('joined request started');
      }
    };

    const joined: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('joined', [OPERATION_A]),
      joinedClient,
      false,
      () => {
        events.push('joined starts');
      }
    );
    await waitForAsync(() => joinLog.length > 0);

    expect(joinLog).toEqual(['Request joined joined the executing iteration.']);
    expect(events).toEqual([
      'first starts',
      'extend',
      'joined request started',
      'joined starts',
      'extended: true'
    ]);
    expect((await joined).outcome).toBe('success');
    gates.get(OPERATION_C)!.released.resolve();
    expect((await first).outcome).toBe('success');
    expect(events).toHaveLength(5);
  });

  it('fails only the request that joined when its inputs cannot be committed, and withholds its work', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C], {
      dependencies: [[OPERATION_A, OPERATION_C]]
    });
    const { fixture, gates, router } = joinFixture;
    joinFixture.peekAsync = async () => {
      const peek: ITestPeek = createTestPeek(joinFixture);
      peek.commit.mockImplementation(() => {
        throw new Error('The inputs could not be committed.');
      });
      return peek;
    };
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await gates.get(OPERATION_C)!.started.promise;

    const joined: IDaemonPhasedRequestResult = await router.executeAsync(
      createRequest('joined', [OPERATION_A]),
      new TestPhasedRequestClient('joined')
    );
    gates.get(OPERATION_C)!.released.resolve();

    expect(joined).toMatchObject({
      errorMessage: 'The inputs could not be committed.',
      exitCode: 1,
      scheduled: false
    });
    expect(await first).toMatchObject({ exitCode: 0, outcome: 'success' });
    // Its work waited for C, and no participant needs it.
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(0);
  });

  it('runs the work of a request that failed after it joined in the environment of a later request', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C], {
      dependencies: [[OPERATION_A, OPERATION_C]]
    });
    const { gates, router, sessions } = joinFixture;
    joinFixture.peekAsync = async () => {
      const peek: ITestPeek = createTestPeek(joinFixture);
      if (joinFixture.peeks.length === 1) {
        peek.commit.mockImplementation(() => {
          throw new Error('The inputs could not be committed.');
        });
      }
      return peek;
    };
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      withSession(createRequest('first', [OPERATION_C]), 'session-first'),
      new TestPhasedRequestClient('first')
    );
    await gates.get(OPERATION_C)!.started.promise;
    const failed: IDaemonPhasedRequestResult = await router.executeAsync(
      withSession(createRequest('failed', [OPERATION_A]), 'session-failed'),
      new TestPhasedRequestClient('failed')
    );
    const late: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      withSession(createRequest('late', [OPERATION_A]), 'session-late'),
      new TestPhasedRequestClient('late')
    );
    await waitForAsync(() => joinLog.length === 2);
    gates.get(OPERATION_C)!.released.resolve();

    expect(failed).toMatchObject({ errorMessage: 'The inputs could not be committed.', exitCode: 1 });
    expect(await late).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect((await first).outcome).toBe('success');
    expect(joinLog).toEqual([
      'Request failed joined the executing iteration.',
      'Request late joined the executing iteration.'
    ]);
    expect(sessions).toEqual(
      new Map([
        [OPERATION_C, 'session-first'],
        [OPERATION_A, 'session-late']
      ])
    );
  });

  it('runs the work that a request dispatched before it failed in the environment of that request', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    const { fixture, gates, router, sessions } = joinFixture;
    joinFixture.peekAsync = async () => {
      const peek: ITestPeek = createTestPeek(joinFixture);
      peek.commit.mockImplementation(() => {
        throw new Error('The inputs could not be committed.');
      });
      return peek;
    };
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      withSession(createRequest('first', [OPERATION_C]), 'session-first'),
      new TestPhasedRequestClient('first')
    );
    await gates.get(OPERATION_C)!.started.promise;

    const failed: IDaemonPhasedRequestResult = await router.executeAsync(
      withSession(createRequest('failed', [OPERATION_A]), 'session-failed'),
      new TestPhasedRequestClient('failed')
    );
    gates.get(OPERATION_C)!.released.resolve();

    expect(failed).toMatchObject({ errorMessage: 'The inputs could not be committed.', exitCode: 1 });
    expect((await first).outcome).toBe('success');
    // A free slot took its work as the iteration was extended.
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
    expect(sessions).toEqual(
      new Map([
        [OPERATION_C, 'session-first'],
        [OPERATION_A, 'session-failed']
      ])
    );
  });

  it('keeps the environment of the work of another request that joined when a request fails after it joined', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C], {
      dependencies: [
        [OPERATION_A, OPERATION_C],
        [OPERATION_B, OPERATION_C]
      ]
    });
    const { fixture, gates, router, sessions } = joinFixture;
    joinFixture.peekAsync = async () => {
      const peek: ITestPeek = createTestPeek(joinFixture);
      if (joinFixture.peeks.length === 2) {
        peek.commit.mockImplementation(() => {
          throw new Error('The inputs could not be committed.');
        });
      }
      return peek;
    };
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      withSession(createRequest('first', [OPERATION_C]), 'session-first'),
      new TestPhasedRequestClient('first')
    );
    await gates.get(OPERATION_C)!.started.promise;
    const joined: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      withSession(createRequest('joined', [OPERATION_A]), 'session-joined'),
      new TestPhasedRequestClient('joined')
    );
    await waitForAsync(() => joinLog.length === 1);
    const failed: IDaemonPhasedRequestResult = await router.executeAsync(
      withSession(createRequest('failed', [OPERATION_B]), 'session-failed'),
      new TestPhasedRequestClient('failed')
    );
    gates.get(OPERATION_C)!.released.resolve();

    expect(failed).toMatchObject({ errorMessage: 'The inputs could not be committed.', exitCode: 1 });
    expect(await joined).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect((await first).outcome).toBe('success');
    expect(fixture.runners.get(OPERATION_B)?.runCount).toBe(0);
    expect(sessions).toEqual(
      new Map([
        [OPERATION_C, 'session-first'],
        [OPERATION_A, 'session-joined']
      ])
    );
  });

  it('keeps the iteration from ending while it reads the inputs', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    const { fixture, gates, router, scheduleSpy } = joinFixture;
    const peekStarted: IDeferred = createDeferred();
    const peekReleased: IDeferred = createDeferred();
    joinFixture.peekAsync = async () => {
      peekStarted.resolve();
      await peekReleased.promise;
      return createTestPeek(joinFixture);
    };
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await gates.get(OPERATION_C)!.started.promise;
    const joined: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('joined', [OPERATION_A]),
      new TestPhasedRequestClient('joined')
    );
    await peekStarted.promise;
    // The last operation that the batch needs ends while the inputs are read.
    gates.get(OPERATION_C)!.released.resolve();
    await settleAsync();
    peekReleased.resolve();

    expect(await joined).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect((await first).outcome).toBe('success');
    expect(joinLog).toEqual(['Request joined joined the executing iteration.']);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
  });

  it('lets requests that arrive together join one at a time', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    const { fixture, gates, router, scheduleSpy } = joinFixture;
    const events: string[] = [];
    joinFixture.peekAsync = async () => {
      const index: number = joinFixture.peeks.length + 1;
      events.push(`peek ${index}`);
      // Gives a request that joins at the same time every chance to read the inputs meanwhile.
      await settleAsync();
      const peek: ITestPeek = createTestPeek(joinFixture);
      peek.commit.mockImplementation(() => {
        events.push(`commit ${index}`);
      });
      return peek;
    };
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await gates.get(OPERATION_C)!.started.promise;

    const joinedResults: IDaemonPhasedRequestResult[] = await Promise.all([
      router.executeAsync(createRequest('joined-a', [OPERATION_A]), new TestPhasedRequestClient('joined-a')),
      router.executeAsync(createRequest('joined-b', [OPERATION_B]), new TestPhasedRequestClient('joined-b'))
    ]);
    gates.get(OPERATION_C)!.released.resolve();

    expect(joinedResults.map(getOperationStatuses)).toEqual([
      { [OPERATION_A]: OperationStatus.Success },
      { [OPERATION_B]: OperationStatus.Success }
    ]);
    expect((await first).outcome).toBe('success');
    expect(events).toEqual(['peek 1', 'commit 1', 'peek 2', 'commit 2']);
    expect(joinLog).toEqual([
      'Request joined-a joined the executing iteration.',
      'Request joined-b joined the executing iteration.'
    ]);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
    expect(fixture.runners.get(OPERATION_B)?.runCount).toBe(1);
  });

  it('does not wait behind another request that is joining when the request does not wait', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    const { gates, router, scheduleSpy } = joinFixture;
    const peekReleased: IDeferred = createDeferred();
    const peekStarted: IDeferred = createDeferred();
    joinFixture.peekAsync = async () => {
      peekStarted.resolve();
      await peekReleased.promise;
      return createTestPeek(joinFixture);
    };
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await gates.get(OPERATION_C)!.started.promise;
    const joining: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('joining', [OPERATION_A]),
      new TestPhasedRequestClient('joining')
    );
    await peekStarted.promise;

    const late: IDaemonPhasedRequestResult = await router.executeAsync(
      createRequest('late', [OPERATION_B], { noWait: true }),
      new TestPhasedRequestClient('late')
    );
    peekReleased.resolve();
    expect(await joining).toMatchObject({ exitCode: 0, outcome: 'success' });
    gates.get(OPERATION_C)!.released.resolve();

    expect(late).toMatchObject({ admissionErrorCode: 'no-wait', scheduled: false });
    expect(await first).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(joinLog).toEqual([
      'Request late did not join the executing iteration: an earlier request is still joining, and the request limits its wait',
      'Request joining joined the executing iteration.'
    ]);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });

  it('runs its work in its own environment, not in that of a request that could not join', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    const { fixture, gates, router, sessions } = joinFixture;
    // The inputs of C changed before the first request that tries to join, and not since.
    joinFixture.peekAsync = async () =>
      createTestPeek(
        joinFixture,
        joinFixture.peeks.length === 0 ? [fixture.operations.get(OPERATION_C)!] : []
      );
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      withSession(createRequest('first', [OPERATION_C]), 'session-first'),
      new TestPhasedRequestClient('first')
    );
    await gates.get(OPERATION_C)!.started.promise;
    // It needs C, which started before its inputs changed, and it does not wait for the graph.
    const refused: IDaemonPhasedRequestResult = await router.executeAsync(
      withSession(createRequest('refused', [OPERATION_A, OPERATION_C], { noWait: true }), 'session-refused'),
      new TestPhasedRequestClient('refused')
    );
    const joined: IDaemonPhasedRequestResult = await router.executeAsync(
      withSession(createRequest('joined', [OPERATION_A]), 'session-joined'),
      new TestPhasedRequestClient('joined')
    );
    gates.get(OPERATION_C)!.released.resolve();

    expect(refused).toMatchObject({ admissionErrorCode: 'no-wait', scheduled: false });
    expect(joined).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect((await first).outcome).toBe('success');
    expect(joinLog).toEqual([
      `Request refused did not join the executing iteration: "${OPERATION_C}" started before its inputs or outputs changed.`,
      'Request joined joined the executing iteration.'
    ]);
    expect(sessions).toEqual(
      new Map([
        [OPERATION_C, 'session-first'],
        [OPERATION_A, 'session-joined']
      ])
    );
  });
});

describe('a request that cannot join the executing iteration', () => {
  async function expectToWaitForTheIterationAsync(
    joinFixture: IJoinFixture,
    late: IDaemonPhasedRequest,
    lateClient: TestPhasedRequestClient = new TestPhasedRequestClient('late'),
    lateSettings?: IPhasedCommandEngineRequestSettings,
    lateExclusivityClass?: RequestExclusivityClass
  ): Promise<IDaemonPhasedRequestResult> {
    const { gates, router } = joinFixture;
    const events: string[] = [];
    const first: Promise<IDaemonPhasedRequestResult> = track(
      router.executeAsync(createRequest('first', [OPERATION_C]), new TestPhasedRequestClient('first')),
      'first',
      events
    );
    await gates.get(OPERATION_C)!.started.promise;
    const lateResult: Promise<IDaemonPhasedRequestResult> = track(
      router.executeAsync(
        late,
        lateClient,
        false,
        undefined,
        lateSettings,
        undefined,
        undefined,
        lateExclusivityClass
      ),
      'late',
      events
    );
    await settleAsync();
    events.push('C released');
    gates.get(OPERATION_C)!.released.resolve();
    await first;
    const result: IDaemonPhasedRequestResult = await lateResult;
    expect(events).toEqual(['C released', 'result:first', 'result:late']);
    return result;
  }

  it('waits for the iteration to end if its request settings differ', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    const result: IDaemonPhasedRequestResult = await expectToWaitForTheIterationAsync(
      joinFixture,
      createRequest('late', [OPERATION_A]),
      undefined,
      { parallelism: 1, quietMode: false, isIncrementalBuildAllowed: true }
    );

    expect(result.outcome).toBe('success');
    expect(joinFixture.scheduleSpy).toHaveBeenCalledTimes(2);
    expect(joinFixture.peekCalls).toHaveLength(0);
    expect(joinLog).toEqual([]);
  });

  it('waits for the iteration to end if it is exclusive, even if its admission let it in', async () => {
    // Workspace admission holds an exclusive request until the requests of the batch finish, so nothing else here
    // reaches the joiner's own check. Admit this request at once, as if admission had not held it.
    const acquireAsync: RequestAdmissionController['acquireAsync'] =
      RequestAdmissionController.prototype.acquireAsync;
    const admissionSpy: jest.SpyInstance = jest
      .spyOn(RequestAdmissionController.prototype, 'acquireAsync')
      .mockImplementation(function (
        this: RequestAdmissionController,
        scheduler: RequestScheduler,
        exclusivityClass: RequestExclusivityClass,
        waitingFor?: string
      ): Promise<IRequestLease> {
        return exclusivityClass === RequestExclusivityClass.Exclusive
          ? Promise.resolve({ exclusivityClass, release: () => undefined })
          : acquireAsync.call(this, scheduler, exclusivityClass, waitingFor);
      });
    try {
      const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
      const result: IDaemonPhasedRequestResult = await expectToWaitForTheIterationAsync(
        joinFixture,
        createRequest('late', [OPERATION_A]),
        undefined,
        undefined,
        RequestExclusivityClass.Exclusive
      );

      expect(result.outcome).toBe('success');
      expect(admissionSpy).toHaveBeenCalledWith(
        expect.anything(),
        RequestExclusivityClass.Exclusive,
        undefined,
        expect.any(Function)
      );
      expect(joinFixture.scheduleSpy).toHaveBeenCalledTimes(2);
      expect(joinFixture.peekCalls).toHaveLength(0);
      expect(joinLog).toEqual([]);
    } finally {
      admissionSpy.mockRestore();
    }
  });

  it('waits for the iteration to end if the changed inputs cannot be added to it', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    joinFixture.peekAsync = async () => undefined;
    const result: IDaemonPhasedRequestResult = await expectToWaitForTheIterationAsync(
      joinFixture,
      createRequest('late', [OPERATION_A])
    );

    expect(result.outcome).toBe('success');
    expect(joinFixture.scheduleSpy).toHaveBeenCalledTimes(2);
    expect(joinLog).toEqual([
      'Request late did not join the executing iteration: the changed inputs cannot be added to an executing iteration'
    ]);
  });

  it('waits for the iteration to end if reading the inputs fails', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    joinFixture.peekAsync = async () => {
      throw new Error('The inputs could not be read.');
    };
    const result: IDaemonPhasedRequestResult = await expectToWaitForTheIterationAsync(
      joinFixture,
      createRequest('late', [OPERATION_A])
    );

    expect(result.outcome).toBe('success');
    expect(joinLog).toEqual([
      'Request late did not join the executing iteration: reading the inputs failed: The inputs could not be read.'
    ]);
  });

  it('waits for the iteration to end if another request waits for the graph', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    const { gates, router } = joinFixture;
    const events: string[] = [];
    const first: Promise<IDaemonPhasedRequestResult> = track(
      router.executeAsync(createRequest('first', [OPERATION_C]), new TestPhasedRequestClient('first')),
      'first',
      events
    );
    await gates.get(OPERATION_C)!.started.promise;
    const waiting: Promise<IDaemonPhasedRequestResult> = track(
      router.executeAsync(
        createRequest('waiting', [OPERATION_B]),
        new TestPhasedRequestClient('waiting'),
        false,
        undefined,
        { parallelism: 1, quietMode: false, isIncrementalBuildAllowed: true }
      ),
      'waiting',
      events
    );
    await settleAsync();
    const late: Promise<IDaemonPhasedRequestResult> = track(
      router.executeAsync(createRequest('late', [OPERATION_A]), new TestPhasedRequestClient('late')),
      'late',
      events
    );
    await settleAsync();
    events.push('C released');
    gates.get(OPERATION_C)!.released.resolve();
    const results: IDaemonPhasedRequestResult[] = await Promise.all([first, waiting, late]);

    expect(results.map(({ outcome }) => outcome)).toEqual(['success', 'success', 'success']);
    expect(events).toEqual(['C released', 'result:first', 'result:waiting', 'result:late']);
    expect(joinFixture.scheduleSpy).toHaveBeenCalledTimes(3);
    expect(joinFixture.peekCalls).toHaveLength(0);
    expect(joinLog).toEqual([
      'Request late did not join the executing iteration: another request waits for the graph'
    ]);
  });

  it('restores the graph and discards the inputs if the iteration cannot take its work', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    const { fixture, gates, router } = joinFixture;
    joinFixture.peekAsync = async () => createTestPeek(joinFixture, [fixture.operations.get(OPERATION_C)!]);
    const getEnabledStates = (): Operation['enabled'][] =>
      OPERATION_IDS.map((operationId: string) => fixture.operations.get(operationId)!.enabled);
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await gates.get(OPERATION_C)!.started.promise;
    const enabledStates: Operation['enabled'][] = getEnabledStates();
    const late: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('late', [OPERATION_A, OPERATION_C]),
      new TestPhasedRequestClient('late')
    );
    await waitForAsync(() => joinLog.length > 0);

    expect(joinLog).toEqual([
      `Request late did not join the executing iteration: "${OPERATION_C}" started before its inputs or outputs changed.`
    ]);
    expect(getEnabledStates()).toEqual(enabledStates);
    expect(joinFixture.peeks).toHaveLength(1);
    expect(joinFixture.peeks[0].discard).toHaveBeenCalledTimes(1);
    expect(joinFixture.peeks[0].commit).not.toHaveBeenCalled();
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(0);
    gates.get(OPERATION_C)!.released.resolve();
    expect((await first).outcome).toBe('success');
    expect((await late).outcome).toBe('success');
    expect(joinFixture.scheduleSpy).toHaveBeenCalledTimes(2);
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
  });

  it('starts a request that the iteration cannot take only when the batch that runs it starts', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    const { fixture, gates, router } = joinFixture;
    joinFixture.peekAsync = async () => createTestPeek(joinFixture, [fixture.operations.get(OPERATION_C)!]);
    const events: string[] = [];
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first'),
      false,
      () => {
        events.push('first starts');
      }
    );
    await gates.get(OPERATION_C)!.started.promise;
    const lateClient: TestPhasedRequestClient = new TestPhasedRequestClient('late');
    lateClient.onWriteAsync = async ({ requestStarted }: { readonly requestStarted?: boolean }) => {
      if (requestStarted) {
        events.push('late request started');
      }
    };
    const late: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('late', [OPERATION_A, OPERATION_C]),
      lateClient,
      false,
      () => {
        events.push('late starts');
      }
    );
    await waitForAsync(() => joinLog.length > 0);

    expect(joinLog).toEqual([
      `Request late did not join the executing iteration: "${OPERATION_C}" started before its inputs or outputs changed.`
    ]);
    events.push('C released');
    gates.get(OPERATION_C)!.released.resolve();
    expect((await first).outcome).toBe('success');
    expect((await late).outcome).toBe('success');
    // Its client is not told that it started while it waits, so a daemon that exits then leaves it to be sent again.
    expect(events).toEqual(['first starts', 'C released', 'late request started', 'late starts']);
  });

  it('restores the graph and discards the inputs if extending the iteration fails', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    const { fixture, gates, router } = joinFixture;
    jest.spyOn(fixture.graph, 'tryExtendCurrentIteration').mockImplementation(() => {
      throw new Error('A plugin failed.');
    });
    const getEnabledStates = (): Operation['enabled'][] =>
      OPERATION_IDS.map((operationId: string) => fixture.operations.get(operationId)!.enabled);
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await gates.get(OPERATION_C)!.started.promise;
    const enabledStates: Operation['enabled'][] = getEnabledStates();
    const late: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('late', [OPERATION_A]),
      new TestPhasedRequestClient('late')
    );
    await waitForAsync(() => joinLog.length > 0);

    expect(joinLog).toEqual([
      'Request late did not join the executing iteration: extending the iteration failed: A plugin failed.'
    ]);
    expect(getEnabledStates()).toEqual(enabledStates);
    expect(joinFixture.peeks[0].discard).toHaveBeenCalledTimes(1);
    expect(joinFixture.peeks[0].commit).not.toHaveBeenCalled();
    gates.get(OPERATION_C)!.released.resolve();
    expect((await first).outcome).toBe('success');
    expect((await late).outcome).toBe('success');
    expect(joinFixture.scheduleSpy).toHaveBeenCalledTimes(2);
  });

  it('does not wait for the iteration to start if its admission does not wait', async () => {
    const { fixture, gates, router } = createJoinFixture([OPERATION_C]);
    const reconcileStarted: IDeferred = createDeferred();
    const reconcileReleased: IDeferred = createDeferred();
    fixture.session.onReconcileAsync = async () => {
      reconcileStarted.resolve();
      await reconcileReleased.promise;
    };
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await reconcileStarted.promise;

    const late: IDaemonPhasedRequestResult = await router.executeAsync(
      createRequest('late', [OPERATION_A], { noWait: true }),
      new TestPhasedRequestClient('late')
    );
    expect(late).toMatchObject({ admissionErrorCode: 'no-wait', scheduled: false });
    expect(joinLog).toEqual([
      'Request late did not join the executing iteration: the iteration has not started, and the request limits its wait'
    ]);
    reconcileReleased.resolve();
    gates.get(OPERATION_C)!.released.resolve();
    expect((await first).outcome).toBe('success');
  });

  it('does not join if it was cancelled while the inputs were read', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    const { fixture, gates, router } = joinFixture;
    const peekStarted: IDeferred = createDeferred();
    const peekReleased: IDeferred = createDeferred();
    joinFixture.peekAsync = async () => {
      peekStarted.resolve();
      await peekReleased.promise;
      return createTestPeek(joinFixture);
    };
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await gates.get(OPERATION_C)!.started.promise;
    const lateClient: TestPhasedRequestClient = new TestPhasedRequestClient('late');
    const late: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('late', [OPERATION_A]),
      lateClient
    );
    await peekStarted.promise;
    lateClient.abortController.abort();
    peekReleased.resolve();

    expect(await late).toMatchObject({ aborted: true });
    expect(joinLog).toEqual(['Request late did not join the executing iteration: the request was cancelled']);
    expect(joinFixture.peeks[0].discard).toHaveBeenCalledTimes(1);
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(0);
    gates.get(OPERATION_C)!.released.resolve();
    expect((await first).outcome).toBe('success');
    expect(joinFixture.scheduleSpy).toHaveBeenCalledTimes(1);
  });

  it('waits for the iteration to start only within its wait timeout, which that wait spends', async () => {
    const { fixture, gates, router, scheduleSpy } = createJoinFixture([OPERATION_C]);
    const reconcileStarted: IDeferred = createDeferred();
    const reconcileReleased: IDeferred = createDeferred();
    fixture.session.onReconcileAsync = async () => {
      reconcileStarted.resolve();
      await reconcileReleased.promise;
    };
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await reconcileStarted.promise;
    fixture.session.onReconcileAsync = undefined;

    // The wait for the iteration to start spends the whole timeout, so the request does not wait for it to end.
    const late: IDaemonPhasedRequestResult = await router.executeAsync(
      createRequest('late', [OPERATION_A], { waitTimeoutMs: 50 }),
      new TestPhasedRequestClient('late')
    );
    expect(late).toMatchObject({ admissionErrorCode: 'wait-timeout', outcome: 'failure' });
    expect(joinLog).toEqual([
      "Request late did not join the executing iteration: the iteration did not start within the request's wait timeout"
    ]);
    reconcileReleased.resolve();
    gates.get(OPERATION_C)!.released.resolve();
    expect((await first).outcome).toBe('success');
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(0);
  });

  it('waits for the iteration to start within its own wait timeout while an earlier request waits too', async () => {
    const { fixture, gates, router, scheduleSpy } = createJoinFixture([OPERATION_C]);
    const reconcileStarted: IDeferred = createDeferred();
    const reconcileReleased: IDeferred = createDeferred();
    fixture.session.onReconcileAsync = async () => {
      reconcileStarted.resolve();
      await reconcileReleased.promise;
    };
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await reconcileStarted.promise;
    fixture.session.onReconcileAsync = undefined;
    const joined: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('joined', [OPERATION_A]),
      new TestPhasedRequestClient('joined')
    );
    await settleAsync();

    // It does not wait for the earlier request to join before its own wait for the iteration to start ends.
    const late: IDaemonPhasedRequestResult = await router.executeAsync(
      createRequest('late', [OPERATION_B], { waitTimeoutMs: 50 }),
      new TestPhasedRequestClient('late')
    );
    expect(late).toMatchObject({ admissionErrorCode: 'wait-timeout', outcome: 'failure' });
    reconcileReleased.resolve();
    expect(await joined).toMatchObject({ exitCode: 0, outcome: 'success' });
    gates.get(OPERATION_C)!.released.resolve();
    expect((await first).outcome).toBe('success');
    expect(joinLog).toEqual([
      "Request late did not join the executing iteration: the iteration did not start within the request's wait timeout",
      'Request joined joined the executing iteration.'
    ]);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect(fixture.runners.get(OPERATION_B)?.runCount).toBe(0);
  });

  it('waits for the next iteration if the iteration ends before it starts', async () => {
    const { fixture, router, scheduleSpy } = createJoinFixture();
    const reconcileStarted: IDeferred = createDeferred();
    const reconcileReleased: IDeferred = createDeferred();
    fixture.session.onReconcileAsync = async () => {
      reconcileStarted.resolve();
      await reconcileReleased.promise;
      throw new Error('The inputs could not be reconciled.');
    };
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await reconcileStarted.promise;
    fixture.session.onReconcileAsync = undefined;
    const late: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('late', [OPERATION_A]),
      new TestPhasedRequestClient('late')
    );
    await settleAsync();
    reconcileReleased.resolve();

    await expect(first).rejects.toThrow('The inputs could not be reconciled.');
    expect((await late).outcome).toBe('success');
    expect(joinLog).toEqual([
      'Request late did not join the executing iteration: the iteration ended before it started'
    ]);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });

  it('waits for the iteration to end if no participant needs it', async () => {
    const { gates, router } = createJoinFixture([OPERATION_C]);
    const firstClient: TestPhasedRequestClient = new TestPhasedRequestClient('first');
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      firstClient
    );
    await gates.get(OPERATION_C)!.started.promise;
    firstClient.abortController.abort();
    const late: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('late', [OPERATION_A]),
      new TestPhasedRequestClient('late')
    );
    await waitForAsync(() => joinLog.length > 0);

    expect(joinLog).toEqual([
      'Request late did not join the executing iteration: no participant needs the iteration'
    ]);
    gates.get(OPERATION_C)!.released.resolve();
    expect(await first).toMatchObject({ aborted: true });
    expect((await late).outcome).toBe('success');
  });

  it('waits for the next iteration if the iteration ended while the inputs were read', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    const { gates, router, scheduleSpy } = joinFixture;
    const peekStarted: IDeferred = createDeferred();
    const peekReleased: IDeferred = createDeferred();
    joinFixture.peekAsync = async () => {
      peekStarted.resolve();
      await peekReleased.promise;
      return createTestPeek(joinFixture);
    };
    const firstClient: TestPhasedRequestClient = new TestPhasedRequestClient('first');
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      firstClient
    );
    await gates.get(OPERATION_C)!.started.promise;
    const late: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('late', [OPERATION_A]),
      new TestPhasedRequestClient('late')
    );
    await peekStarted.promise;
    // The only participant cancels, which ends the iteration once its running operation ends.
    firstClient.abortController.abort();
    gates.get(OPERATION_C)!.released.resolve();
    expect(await first).toMatchObject({ aborted: true });
    peekReleased.resolve();

    expect((await late).outcome).toBe('success');
    expect(joinLog).toEqual(['Request late did not join the executing iteration: the iteration ended']);
    expect(joinFixture.peeks[0].discard).toHaveBeenCalledTimes(1);
    expect(joinFixture.peeks[0].commit).not.toHaveBeenCalled();
    expect(scheduleSpy).toHaveBeenCalledTimes(2);
  });

  it('waits for the iteration to end if the iteration holds no operations', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C]);
    jest.spyOn(joinFixture.fixture.graph, 'retainHeldOperations').mockReturnValue(undefined);
    const result: IDaemonPhasedRequestResult = await expectToWaitForTheIterationAsync(
      joinFixture,
      createRequest('late', [OPERATION_A])
    );

    expect(result.outcome).toBe('success');
    expect(joinFixture.peekCalls).toHaveLength(0);
    expect(joinLog).toEqual([
      'Request late did not join the executing iteration: the iteration holds no operations'
    ]);
  });

  it('waits for the iteration to end if a request that an earlier batch left waiting waits for the graph', async () => {
    const joinFixture: IJoinFixture = createJoinFixture([OPERATION_C, OPERATION_B]);
    const { gates, router, scheduleSpy } = joinFixture;
    const otherSettings: IPhasedCommandEngineRequestSettings = {
      parallelism: 1,
      quietMode: false,
      isIncrementalBuildAllowed: true
    };
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await gates.get(OPERATION_C)!.started.promise;
    const other: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('other', [OPERATION_B]),
      new TestPhasedRequestClient('other'),
      false,
      undefined,
      otherSettings
    );
    await settleAsync();
    const waiting: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('waiting', [OPERATION_A]),
      new TestPhasedRequestClient('waiting')
    );
    await waitForAsync(() => joinLog.length > 0);
    // The next batch takes the request with the other settings, and leaves the waiting request waiting.
    gates.get(OPERATION_C)!.released.resolve();
    await gates.get(OPERATION_B)!.started.promise;
    const late: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('late', [OPERATION_A]),
      new TestPhasedRequestClient('late'),
      false,
      undefined,
      otherSettings
    );
    await waitForAsync(() => joinLog.length > 1);
    gates.get(OPERATION_B)!.released.resolve();

    const results: IDaemonPhasedRequestResult[] = await Promise.all([first, other, waiting, late]);
    expect(results.map(({ outcome }) => outcome)).toEqual(['success', 'success', 'success', 'success']);
    expect(joinLog).toEqual([
      'Request waiting did not join the executing iteration: another request waits for the graph',
      'Request late did not join the executing iteration: another request waits for the graph'
    ]);
    expect(scheduleSpy).toHaveBeenCalledTimes(4);
  });

  it('does not try to join an iteration that ended while its batch finishes', async () => {
    const { fixture, router, scheduleSpy } = createJoinFixture();
    const leaseReleasing: IDeferred = createDeferred();
    const leaseReleased: IDeferred = createDeferred();
    fixture.session.acquireExecutionLeaseAsync = async () => ({
      [Symbol.asyncDispose]: async () => {
        leaseReleasing.resolve();
        await leaseReleased.promise;
      }
    });
    const first: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('first', [OPERATION_C]),
      new TestPhasedRequestClient('first')
    );
    await leaseReleasing.promise;
    const late: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('late', [OPERATION_A]),
      new TestPhasedRequestClient('late')
    );
    await settleAsync();
    leaseReleased.resolve();

    expect((await first).outcome).toBe('success');
    expect((await late).outcome).toBe('success');
    expect(joinLog).toEqual([]);
    expect(scheduleSpy).toHaveBeenCalledTimes(2);
  });
});

describe('the iteration of a batch that requests cannot join', () => {
  interface ICannotJoinCase {
    readonly title: string;
    readonly exclusivityClass?: RequestExclusivityClass;
    readonly requestSettings?: IPhasedCommandEngineRequestSettings;
    readonly setup?: (joinFixture: IJoinFixture) => void;
  }

  it.each<ICannotJoinCase>([
    {
      title: 'in a cobuild',
      setup: () => {
        process.env[COBUILD_VARIABLE] = 'test-cobuild';
      }
    },
    { title: 'for an exclusive request', exclusivityClass: RequestExclusivityClass.Exclusive },
    {
      title: 'for a request that runs every operation',
      requestSettings: { parallelism: 3, quietMode: false, isIncrementalBuildAllowed: false }
    },
    {
      title: 'if the graph cannot add work to an executing iteration',
      setup: ({ fixture }) => {
        Object.defineProperty(fixture.graph, 'tryExtendCurrentIteration', { value: undefined });
      }
    },
    {
      title: 'if the graph cannot hold operations',
      setup: ({ fixture }) => {
        Object.defineProperty(fixture.graph, 'retainHeldOperations', { value: undefined });
      }
    },
    {
      title: 'if the workspace session cannot read the inputs for an executing iteration',
      setup: ({ fixture }) => {
        Object.assign(fixture.session, { peekInvalidationsAsync: undefined });
      }
    }
  ])('is scheduled as before $title', async ({ exclusivityClass, requestSettings, setup }) => {
    const joinFixture: IJoinFixture = createJoinFixture();
    setup?.(joinFixture);
    const result: IDaemonPhasedRequestResult = await joinFixture.router.executeAsync(
      createRequest('only', [OPERATION_C]),
      new TestPhasedRequestClient('only'),
      false,
      undefined,
      requestSettings,
      undefined,
      undefined,
      exclusivityClass
    );

    expect(result).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(joinFixture.scheduleSpy).toHaveBeenCalledTimes(1);
    expect(joinFixture.scheduleSpy.mock.calls[0][0]).not.toHaveProperty('holdUnneededOperations');
  });
});
