// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IDaemonContinuingOperations,
  IDaemonPhasedRequest,
  IDaemonPhasedRequestResult,
  IDaemonRequestQueuePositionMessage,
  IDaemonWorkspaceStatus
} from '@rushstack/rush-daemon-protocol';
import { type IOperationRunnerContext, OperationStatus } from '@microsoft/rush-lib';
import type { ITerminal } from '@rushstack/terminal';

import { PhasedRequestRouter, describeContinuingOperations } from '../PhasedRequestRouter';
import type { IPhasedRequestTelemetryReport, IPhasedRequestTelemetrySink } from '../PhasedRequestTelemetry';
import type { IWorkspaceSession } from '../WorkspaceSession';
import type { WorkspaceSessionProvider } from '../WorkspaceSessionProvider';
import { getWorkspaceStatus } from '../WorkspaceStatus';
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
const OPERATION_D: string = 'project-d (_phase:test)';
/** A consumes B and C, so A is the only target of a request that selects A. */
const A_CONSUMES_B_AND_C: ReadonlyArray<readonly [string, string]> = [
  [OPERATION_A, OPERATION_B],
  [OPERATION_A, OPERATION_C]
];

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

function createRequest(
  requestId: string,
  returnEarlyOnFailure: boolean,
  ...selectedOperationIds: ReadonlyArray<string>
): IDaemonPhasedRequest {
  return {
    commandName: 'build',
    commandOrigin: 'built-in',
    engineShape: TEST_ENGINE_SHAPE,
    environment: {},
    operationSelection: selectedOperationIds.map((operationId: string) => ({
      enabledState: true,
      operationId
    })),
    requestId,
    ...(returnEarlyOnFailure ? { returnEarlyOnFailure } : {})
  };
}

async function settleAsync(): Promise<void> {
  for (let turn: number = 0; turn < 20; turn++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

interface IEarlyFailureFixture {
  readonly events: string[];
  readonly fixture: ITestRoutingFixture;
  /** Lets C, which is slow, finish. */
  readonly releaseC: () => void;
  readonly router: PhasedRequestRouter;
  readonly startedC: Promise<void>;
}

/** Runs nothing that the user sees, like a phase that the project does not define. */
class SilentTestOperationRunner extends TestOperationRunner {
  public override readonly silent: boolean = true;
}

/**
 * B fails and C is slow. Unless `failBeforeCStarts` is set, B fails only once C runs, so C is executing when B's
 * failure decides a request's result. If `silentC` is set, C is silent. If `terminable` is set, the graph can
 * terminate running operations, and C stops with `Aborted` when it does, as a runner that kills its process does.
 * If `dependencies` names D, D succeeds as soon as it runs. If `bFailsWhen` is given, B fails only once it resolves.
 */
function createEarlyFailureFixture(
  dependencies: ReadonlyArray<readonly [string, string]> = A_CONSUMES_B_AND_C,
  failBeforeCStarts: boolean = false,
  silentC: boolean = false,
  terminable: boolean = false,
  bFailsWhen?: Promise<void>
): IEarlyFailureFixture {
  const startedC: IDeferred = createDeferred();
  const releaseC: IDeferred = createDeferred();
  const events: string[] = [];
  const runners: Map<string, TestOperationRunner> = new Map([
    [OPERATION_A, new TestOperationRunner(OPERATION_A)],
    [
      OPERATION_B,
      new TestOperationRunner(OPERATION_B, OperationStatus.Failure, async (): Promise<void> => {
        if (!failBeforeCStarts) {
          await startedC.promise;
        }
        if (bFailsWhen) {
          await bFailsWhen;
        }
      })
    ],
    [
      OPERATION_C,
      new (silentC ? SilentTestOperationRunner : TestOperationRunner)(
        OPERATION_C,
        OperationStatus.Success,
        async (
          terminal: ITerminal,
          { abortSignal }: IOperationRunnerContext
        ): Promise<void | OperationStatus> => {
          startedC.resolve();
          const terminated: Promise<OperationStatus> = new Promise((resolve) => {
            abortSignal?.addEventListener('abort', () => resolve(OperationStatus.Aborted), { once: true });
          });
          return await Promise.race([releaseC.promise, terminated]);
        }
      )
    ]
  ]);
  if (dependencies.some((pair: readonly [string, string]) => pair.includes(OPERATION_D))) {
    runners.set(OPERATION_D, new TestOperationRunner(OPERATION_D));
  }
  const fixture: ITestRoutingFixture = createRoutingFixture(runners, dependencies, {
    parallelism: 2,
    supportsTerminateRunning: terminable
  });
  fixture.session.acquireExecutionLeaseAsync = async (): Promise<AsyncDisposable> => {
    events.push('acquired');
    return {
      [Symbol.asyncDispose]: async (): Promise<void> => {
        events.push('released');
      }
    };
  };
  return {
    events,
    fixture,
    releaseC: releaseC.resolve,
    router: new PhasedRequestRouter(fixture.session),
    startedC: startedC.promise
  };
}

interface ITrackedClient {
  readonly client: TestPhasedRequestClient;
  /** Resolves when the client's result was written, with the graph status at that moment. */
  readonly written: Promise<OperationStatus>;
}

function trackClient(label: string, { events, fixture }: IEarlyFailureFixture): ITrackedClient {
  const client: TestPhasedRequestClient = new TestPhasedRequestClient(label);
  let onWritten: (status: OperationStatus) => void = () => undefined;
  const written: Promise<OperationStatus> = new Promise((resolve) => {
    onWritten = resolve;
  });
  client.onWriteAsync = async (write: ITestClientWrite): Promise<void> => {
    if (write.result) {
      events.push(`wrote:${label}`);
      onWritten(fixture.graph.status);
    }
  };
  return { client, written };
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

/** Counts the aborts that the router requested; every iteration's start also calls the spy without options. */
function countTerminatingAborts(abortSpy: jest.SpyInstance): number {
  return abortSpy.mock.calls.filter(
    ([options]: ReadonlyArray<{ terminateRunning?: boolean } | undefined>) =>
      options?.terminateRunning === true
  ).length;
}

function getRetainedStatus({ graph }: ITestRoutingFixture, operationId: string): OperationStatus | undefined {
  return [...graph.resultByOperation.values()].find(({ operation }) => operation.name === operationId)
    ?.status;
}

function getWrittenResults(client: TestPhasedRequestClient): ReadonlyArray<IDaemonPhasedRequestResult> {
  return client.writes.flatMap(({ result }: ITestClientWrite) => (result ? [result] : []));
}

function getQueuePositions(
  client: TestPhasedRequestClient
): ReadonlyArray<IDaemonRequestQueuePositionMessage['payload']> {
  return client.writes.flatMap(({ queuePosition }: ITestClientWrite) =>
    queuePosition ? [queuePosition.payload] : []
  );
}

/** Resolves once the client's result was written. */
function whenResultWritten(client: TestPhasedRequestClient): Promise<void> {
  return new Promise((resolve) => {
    client.onWriteAsync = async (write: ITestClientWrite): Promise<void> => {
      if (write.result) {
        resolve();
      }
    };
  });
}

/** The workspace status that `daemon status` reports while `session` is the installed workspace session. */
function getSessionStatus(session: IWorkspaceSession): IDaemonWorkspaceStatus {
  const provider: Partial<WorkspaceSessionProvider> = {
    currentGenerationToken: 'generation-token',
    currentSession: session,
    generation: 1
  };
  return getWorkspaceStatus(provider as WorkspaceSessionProvider);
}

/** Records the telemetry reports of a request, and when each was logged. */
function recordTelemetry(
  label: string,
  events: string[],
  reports: IPhasedRequestTelemetryReport[]
): IPhasedRequestTelemetrySink {
  return {
    logRequest: (report: IPhasedRequestTelemetryReport): void => {
      events.push(`logged:${label}`);
      reports.push(report);
    }
  };
}

function getRecordedStatuses(report: IPhasedRequestTelemetryReport): Record<string, OperationStatus> {
  const statuses: Record<string, OperationStatus> = {};
  for (const [operation, record] of report.records) {
    statuses[operation.name] = record.status;
  }
  return statuses;
}

interface IOrdinaryCase {
  readonly commandName: string;
  readonly dependencies: ReadonlyArray<readonly [string, string]>;
  readonly failBeforeCStarts: boolean;
  readonly name: string;
  readonly selection: ReadonlyArray<string>;
  readonly silentC?: boolean;
}

/** Requests that ask to return early on failure, but whose failed result can only be written at the end. */
const ORDINARY_CASES: ReadonlyArray<IOrdinaryCase> = [
  {
    commandName: 'build',
    dependencies: [[OPERATION_A, OPERATION_B]],
    failBeforeCStarts: false,
    name: 'a target is still running',
    selection: [OPERATION_A, OPERATION_C]
  },
  {
    commandName: 'build',
    dependencies: [[OPERATION_A, OPERATION_B]],
    failBeforeCStarts: true,
    name: 'nothing else is unfinished',
    selection: [OPERATION_A]
  },
  {
    commandName: 'rebuild',
    dependencies: A_CONSUMES_B_AND_C,
    failBeforeCStarts: false,
    name: 'the request is not a shared build',
    selection: [OPERATION_A]
  },
  {
    // An early result would not list C, so it could not say that C continues.
    commandName: 'build',
    dependencies: A_CONSUMES_B_AND_C,
    failBeforeCStarts: false,
    name: 'only a silent operation is unfinished',
    selection: [OPERATION_A],
    silentC: true
  }
];

describe('phased requests that return early on failure', () => {
  it('writes a failed result once no unfinished operation can change it, and keeps independent work running', async () => {
    const setup: IEarlyFailureFixture = createEarlyFailureFixture();
    const { events, fixture, router } = setup;
    const agent: ITrackedClient = trackClient('agent', setup);

    const resultPromise: Promise<IDaemonPhasedRequestResult> = trackResult(
      router.executeAsync(createRequest('agent', true, OPERATION_A), agent.client),
      'agent',
      events
    );

    expect(await agent.written).toBe(OperationStatus.Executing);
    await settleAsync();
    // The request stays active, holding its admission and the execution lease, until C finishes.
    expect(events).toEqual(['acquired', 'wrote:agent']);
    const [early] = getWrittenResults(agent.client);
    expect(early).toMatchObject({ aborted: false, exitCode: 1, outcome: 'failure', scheduled: true });
    expect(early.operationResults).toEqual([
      expect.objectContaining({ operationId: OPERATION_A, status: OperationStatus.Blocked }),
      expect.objectContaining({ operationId: OPERATION_B, status: OperationStatus.Failure }),
      expect.objectContaining({ operationId: OPERATION_C, status: OperationStatus.Executing })
    ]);

    setup.releaseC();
    expect(await resultPromise).toBe(early);
    expect(events).toEqual(['acquired', 'wrote:agent', 'released', 'result:agent']);
    expect(getWrittenResults(agent.client)).toHaveLength(1);
    expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(1);
    // A later build can use it, e.g. from the build cache.
    expect(getRetainedStatus(fixture, OPERATION_C)).toBe(OperationStatus.Success);
  });

  it('keeps the ordinary contract for a request that did not ask to return early', async () => {
    const setup: IEarlyFailureFixture = createEarlyFailureFixture();
    const tracked: ITrackedClient = trackClient('human', setup);
    const resultPromise: Promise<IDaemonPhasedRequestResult> = trackResult(
      setup.router.executeAsync(createRequest('human', false, OPERATION_A), tracked.client),
      'human',
      setup.events
    );

    await setup.startedC;
    await settleAsync();
    expect(setup.events).toEqual(['acquired']);
    setup.releaseC();
    const result: IDaemonPhasedRequestResult = await resultPromise;

    expect(setup.events).toEqual(['acquired', 'released', 'wrote:human', 'result:human']);
    expect(result.operationResults).toEqual([
      expect.objectContaining({ operationId: OPERATION_A, status: OperationStatus.Blocked }),
      expect.objectContaining({ operationId: OPERATION_B, status: OperationStatus.Failure }),
      expect.objectContaining({ operationId: OPERATION_C, status: OperationStatus.Success })
    ]);
  });

  it.each(ORDINARY_CASES)(
    'writes the result after the iteration when $name',
    async ({ commandName, dependencies, failBeforeCStarts, selection, silentC }: IOrdinaryCase) => {
      const setup: IEarlyFailureFixture = createEarlyFailureFixture(dependencies, failBeforeCStarts, silentC);
      const tracked: ITrackedClient = trackClient('agent', setup);
      const resultPromise: Promise<IDaemonPhasedRequestResult> = trackResult(
        setup.router.executeAsync(
          { ...createRequest('agent', true, ...selection), commandName },
          tracked.client
        ),
        'agent',
        setup.events
      );

      if (!failBeforeCStarts) {
        await setup.startedC;
        await settleAsync();
        expect(setup.events).toEqual(['acquired']);
      }
      setup.releaseC();
      const result: IDaemonPhasedRequestResult = await resultPromise;

      expect(setup.events).toEqual(['acquired', 'released', 'wrote:agent', 'result:agent']);
      expect(result).toMatchObject({ exitCode: 1, outcome: 'failure' });
    }
  );

  it('keeps work that it shares with a participant that cancels after the early result', async () => {
    const setup: IEarlyFailureFixture = createEarlyFailureFixture();
    const { events, fixture, router } = setup;
    const agent: ITrackedClient = trackClient('agent', setup);
    const departing: TestPhasedRequestClient = new TestPhasedRequestClient('departing');
    const abortSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'abortCurrentIterationAsync');

    const agentPromise: Promise<IDaemonPhasedRequestResult> = trackResult(
      router.executeAsync(createRequest('agent', true, OPERATION_A), agent.client),
      'agent',
      events
    );
    const departingPromise: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('departing', false, OPERATION_C),
      departing
    );
    await agent.written;
    departing.abortController.abort();

    expect(await departingPromise).toMatchObject({ aborted: true, outcome: 'aborted' });
    setup.releaseC();
    await agentPromise;

    expect(countTerminatingAborts(abortSpy)).toBe(0);
    expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(1);
    expect(getRetainedStatus(fixture, OPERATION_C)).toBe(OperationStatus.Success);
  });

  it('lets a later build wait for the work that continues instead of stopping it', async () => {
    const setup: IEarlyFailureFixture = createEarlyFailureFixture();
    const { events, fixture, router } = setup;
    const agent: ITrackedClient = trackClient('agent', setup);
    const abortSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'abortCurrentIterationAsync');

    const agentPromise: Promise<IDaemonPhasedRequestResult> = trackResult(
      router.executeAsync(createRequest('agent', true, OPERATION_A), agent.client),
      'agent',
      events
    );
    await agent.written;
    await settleAsync();
    const laterPromise: Promise<IDaemonPhasedRequestResult> = trackResult(
      router.executeAsync(createRequest('later', false, OPERATION_C), new TestPhasedRequestClient('later')),
      'later',
      events
    );
    await settleAsync();

    expect(countTerminatingAborts(abortSpy)).toBe(0);
    expect(events).toEqual(['acquired', 'wrote:agent']);
    expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(1);
    setup.releaseC();
    expect(await laterPromise).toMatchObject({ exitCode: 0, outcome: 'success' });
    await agentPromise;

    expect(countTerminatingAborts(abortSpy)).toBe(0);
    expect(getRetainedStatus(fixture, OPERATION_C)).toBe(OperationStatus.Success);

    // The later build ran its own iteration only after the one that continued had ended.
    expect(events.slice(0, 3)).toEqual(['acquired', 'wrote:agent', 'released']);
    expect(events.indexOf('result:agent')).toBeLessThan(events.indexOf('result:later'));
    expect(events.filter((event: string) => event === 'acquired')).toHaveLength(2);
  });

  it.each(['rebuild', 'list'])(
    'lets a %s request that cannot run alongside the work that continues stop it',
    async (commandName: string) => {
      const setup: IEarlyFailureFixture = createEarlyFailureFixture();
      const { events, fixture, router } = setup;
      const agent: ITrackedClient = trackClient('agent', setup);
      const abortSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'abortCurrentIterationAsync');

      const agentPromise: Promise<IDaemonPhasedRequestResult> = trackResult(
        router.executeAsync(createRequest('agent', true, OPERATION_A), agent.client),
        'agent',
        events
      );
      await agent.written;
      await settleAsync();
      const otherPromise: Promise<IDaemonPhasedRequestResult> = trackResult(
        router.executeAsync(
          { ...createRequest(commandName, false, OPERATION_C), commandName },
          new TestPhasedRequestClient(commandName)
        ),
        commandName,
        events
      );
      await settleAsync();

      expect(countTerminatingAborts(abortSpy)).toBe(1);
      setup.releaseC();
      await Promise.all([agentPromise, otherPromise]);

      expect(events.indexOf('result:agent')).toBeLessThan(events.indexOf(`result:${commandName}`));
      expect(getWrittenResults(agent.client)).toHaveLength(1);
    }
  );

  it('stops the work that continues when the request is aborted after its result', async () => {
    const setup: IEarlyFailureFixture = createEarlyFailureFixture();
    const agent: ITrackedClient = trackClient('agent', setup);
    const abortSpy: jest.SpyInstance = jest.spyOn(setup.fixture.graph, 'abortCurrentIterationAsync');

    const resultPromise: Promise<IDaemonPhasedRequestResult> = setup.router.executeAsync(
      createRequest('agent', true, OPERATION_A),
      agent.client
    );
    await agent.written;
    await settleAsync();
    expect(countTerminatingAborts(abortSpy)).toBe(0);
    agent.client.abortController.abort();

    expect(countTerminatingAborts(abortSpy)).toBe(1);
    setup.releaseC();
    const result: IDaemonPhasedRequestResult = await resultPromise;
    expect(result).toBe(getWrittenResults(agent.client)[0]);
    expect(getWrittenResults(agent.client)).toHaveLength(1);
  });

  it("logs a request that returned early once the work that continues settled, with that work's final status", async () => {
    // A consumes B and D, and D consumes C, so D starts only after the request has its result.
    const setup: IEarlyFailureFixture = createEarlyFailureFixture([
      [OPERATION_A, OPERATION_B],
      [OPERATION_A, OPERATION_D],
      [OPERATION_D, OPERATION_C]
    ]);
    const { events } = setup;
    const agent: ITrackedClient = trackClient('agent', setup);
    const reports: IPhasedRequestTelemetryReport[] = [];

    const resultPromise: Promise<IDaemonPhasedRequestResult> = trackResult(
      setup.router.executeAsync(
        createRequest('agent', true, OPERATION_A),
        agent.client,
        false,
        undefined,
        undefined,
        recordTelemetry('agent', events, reports)
      ),
      'agent',
      events
    );
    await agent.written;
    await settleAsync();
    // C and D still run for this request, so its entry waits for them.
    expect(events).toEqual(['acquired', 'wrote:agent']);
    const [early] = getWrittenResults(agent.client);
    expect(early.operationResults).toEqual([
      expect.objectContaining({ operationId: OPERATION_A, status: OperationStatus.Blocked }),
      expect.objectContaining({ operationId: OPERATION_B, status: OperationStatus.Failure }),
      expect.objectContaining({ operationId: OPERATION_C, status: OperationStatus.Executing }),
      expect.objectContaining({ operationId: OPERATION_D, status: OperationStatus.Waiting })
    ]);

    setup.releaseC();
    expect(await resultPromise).toBe(early);
    expect(events).toEqual(['acquired', 'wrote:agent', 'released', 'logged:agent', 'result:agent']);
    expect(reports).toHaveLength(1);
    const [report] = reports;
    // The entry describes the result that the client received while C and D still ran.
    expect(report.result).toBe(early);
    expect(report).toMatchObject({ countRetained: 0, earlyResult: true, scheduled: true });
    expect(getRecordedStatuses(report)).toEqual({
      [OPERATION_A]: OperationStatus.Blocked,
      [OPERATION_B]: OperationStatus.Failure,
      [OPERATION_C]: OperationStatus.Success,
      [OPERATION_D]: OperationStatus.Success
    });
    for (const [operation, record] of report.records) {
      if (operation.name === OPERATION_C || operation.name === OPERATION_D) {
        expect(record.stopwatch.endTime).toBeGreaterThan(report.resultTimeMs);
      }
    }
    // The measures are taken at the result too, when the iteration had not ended yet.
    expect(report.measures).toContainEqual({
      name: 'rush:daemon:executeIteration',
      startTimeMs: expect.any(Number),
      endTimeMs: report.resultTimeMs
    });
  });

  it('logs the work that continues as aborted when the request is aborted after its result and stops it', async () => {
    const setup: IEarlyFailureFixture = createEarlyFailureFixture(A_CONSUMES_B_AND_C, false, false, true);
    const { events } = setup;
    const agent: ITrackedClient = trackClient('agent', setup);
    const reports: IPhasedRequestTelemetryReport[] = [];

    const resultPromise: Promise<IDaemonPhasedRequestResult> = trackResult(
      setup.router.executeAsync(
        createRequest('agent', true, OPERATION_A),
        agent.client,
        false,
        undefined,
        undefined,
        recordTelemetry('agent', events, reports)
      ),
      'agent',
      events
    );
    await agent.written;
    await settleAsync();
    // The daemon stops C, which nobody waits for any more.
    agent.client.abortController.abort();
    await resultPromise;

    expect(events).toEqual(['acquired', 'wrote:agent', 'released', 'logged:agent', 'result:agent']);
    expect(reports).toHaveLength(1);
    expect(reports[0].earlyResult).toBe(true);
    expect(getRecordedStatuses(reports[0])).toEqual({
      [OPERATION_A]: OperationStatus.Blocked,
      [OPERATION_B]: OperationStatus.Failure,
      [OPERATION_C]: OperationStatus.Aborted
    });
  });

  it('rejects a flag that is not a boolean', async () => {
    const setup: IEarlyFailureFixture = createEarlyFailureFixture();
    await expect(
      setup.router.executeAsync(
        { ...createRequest('agent', false, OPERATION_A), returnEarlyOnFailure: 'yes' as unknown as boolean },
        new TestPhasedRequestClient('agent')
      )
    ).rejects.toThrow('Phased request returnEarlyOnFailure must be a boolean value.');
  });
});

describe('the operations that continue after an early result', () => {
  const continuingC: IDaemonContinuingOperations = { count: 1, names: [OPERATION_C] };

  it('are named to a later build that waits only for them', async () => {
    const setup: IEarlyFailureFixture = createEarlyFailureFixture();
    const agent: ITrackedClient = trackClient('agent', setup);
    const agentPromise: Promise<IDaemonPhasedRequestResult> = setup.router.executeAsync(
      createRequest('agent', true, OPERATION_A),
      agent.client
    );
    await agent.written;
    await settleAsync();
    const later: TestPhasedRequestClient = new TestPhasedRequestClient('later');
    const laterPromise: Promise<IDaemonPhasedRequestResult> = setup.router.executeAsync(
      createRequest('later', false, OPERATION_C),
      later
    );
    await settleAsync();

    expect(getQueuePositions(later)).toEqual([
      { position: 1, requestId: 'later', continuingOperations: continuingC }
    ]);
    setup.releaseC();
    await Promise.all([agentPromise, laterPromise]);
    expect(getQueuePositions(later)).toHaveLength(1);
  });

  it.each(['rebuild', 'list'])(
    'are named as stopping to a %s request that cannot run alongside them (task 345)',
    async (commandName: string) => {
      const setup: IEarlyFailureFixture = createEarlyFailureFixture();
      const agent: ITrackedClient = trackClient('agent', setup);
      const agentPromise: Promise<IDaemonPhasedRequestResult> = setup.router.executeAsync(
        createRequest('agent', true, OPERATION_A),
        agent.client
      );
      await agent.written;
      await settleAsync();
      const other: TestPhasedRequestClient = new TestPhasedRequestClient(commandName);
      const otherPromise: Promise<IDaemonPhasedRequestResult> = setup.router.executeAsync(
        { ...createRequest(commandName, false, OPERATION_C), commandName },
        other
      );
      await settleAsync();

      expect(getQueuePositions(other)).toEqual([
        { position: 1, requestId: commandName, continuingOperations: { ...continuingC, stopping: true } }
      ]);
      setup.releaseC();
      await Promise.all([agentPromise, otherPromise]);
      expect(getQueuePositions(other)).toHaveLength(1);
    }
  );

  it('are named again to a build that already waited when the failed build returned early', async () => {
    const failB: IDeferred = createDeferred();
    const setup: IEarlyFailureFixture = createEarlyFailureFixture(
      A_CONSUMES_B_AND_C,
      false,
      false,
      false,
      failB.promise
    );
    const agent: ITrackedClient = trackClient('agent', setup);
    const agentPromise: Promise<IDaemonPhasedRequestResult> = setup.router.executeAsync(
      createRequest('agent', true, OPERATION_A),
      agent.client
    );
    await setup.startedC;
    await settleAsync();
    const later: TestPhasedRequestClient = new TestPhasedRequestClient('later');
    const laterPromise: Promise<IDaemonPhasedRequestResult> = setup.router.executeAsync(
      createRequest('later', false, OPERATION_C),
      later
    );
    await settleAsync();
    // The failed build still waits for its result, so the later build waits for another request.
    expect(getQueuePositions(later)).toEqual([{ position: 1, requestId: 'later' }]);

    failB.resolve();
    await agent.written;
    await settleAsync();
    expect(getQueuePositions(later)).toEqual([
      { position: 1, requestId: 'later' },
      { position: 1, requestId: 'later', continuingOperations: continuingC }
    ]);
    setup.releaseC();
    await Promise.all([agentPromise, laterPromise]);
    expect(getQueuePositions(later)).toHaveLength(2);
  });

  it.each(['rebuild', 'list'])(
    'are named as stopping to a %s request that already waited when the failed build returned early',
    async (commandName: string) => {
      const failB: IDeferred = createDeferred();
      const setup: IEarlyFailureFixture = createEarlyFailureFixture(
        A_CONSUMES_B_AND_C,
        false,
        false,
        false,
        failB.promise
      );
      const agent: ITrackedClient = trackClient('agent', setup);
      const agentPromise: Promise<IDaemonPhasedRequestResult> = setup.router.executeAsync(
        createRequest('agent', true, OPERATION_A),
        agent.client
      );
      await setup.startedC;
      await settleAsync();
      const other: TestPhasedRequestClient = new TestPhasedRequestClient(commandName);
      const otherPromise: Promise<IDaemonPhasedRequestResult> = setup.router.executeAsync(
        { ...createRequest(commandName, false, OPERATION_C), commandName },
        other
      );
      await settleAsync();
      // The failed build still waits for its result, so the request waits for another request.
      expect(getQueuePositions(other)).toEqual([{ position: 1, requestId: commandName }]);

      failB.resolve();
      await agent.written;
      await settleAsync();
      expect(getQueuePositions(other)).toEqual([
        { position: 1, requestId: commandName },
        { position: 1, requestId: commandName, continuingOperations: { ...continuingC, stopping: true } }
      ]);
      setup.releaseC();
      await agentPromise;
      const otherResult: IDaemonPhasedRequestResult = await otherPromise;
      expect(otherResult.exitCode).toBe(0);
      expect(getQueuePositions(other)).toHaveLength(2);
    }
  );

  it('are named to a waiting build once the last participant that waited for its result leaves', async () => {
    const failB: IDeferred = createDeferred();
    const setup: IEarlyFailureFixture = createEarlyFailureFixture(
      A_CONSUMES_B_AND_C,
      false,
      false,
      false,
      failB.promise
    );
    const agent: ITrackedClient = trackClient('agent', setup);
    const departing: TestPhasedRequestClient = new TestPhasedRequestClient('departing');
    const agentPromise: Promise<IDaemonPhasedRequestResult> = setup.router.executeAsync(
      createRequest('agent', true, OPERATION_A),
      agent.client
    );
    const departingPromise: Promise<IDaemonPhasedRequestResult> = setup.router.executeAsync(
      createRequest('departing', false, OPERATION_C),
      departing
    );
    await setup.startedC;
    await settleAsync();
    const later: TestPhasedRequestClient = new TestPhasedRequestClient('later');
    const laterPromise: Promise<IDaemonPhasedRequestResult> = setup.router.executeAsync(
      createRequest('later', false, OPERATION_C),
      later
    );
    await settleAsync();
    failB.resolve();
    await agent.written;
    await settleAsync();
    // The departing participant still waits for C, so the later build still waits for another request.
    expect(getQueuePositions(later)).toEqual([{ position: 1, requestId: 'later' }]);

    departing.abortController.abort();
    await departingPromise;
    await settleAsync();
    expect(getQueuePositions(later)).toEqual([
      { position: 1, requestId: 'later' },
      { position: 1, requestId: 'later', continuingOperations: continuingC }
    ]);
    setup.releaseC();
    await Promise.all([agentPromise, laterPromise]);
  });

  it('are in the workspace status only while no request waits for the iteration', async () => {
    const failB: IDeferred = createDeferred();
    const setup: IEarlyFailureFixture = createEarlyFailureFixture(
      A_CONSUMES_B_AND_C,
      false,
      false,
      false,
      failB.promise
    );
    const { session } = setup.fixture;
    expect(describeContinuingOperations(session)).toBeUndefined();
    const agent: ITrackedClient = trackClient('agent', setup);
    const agentPromise: Promise<IDaemonPhasedRequestResult> = setup.router.executeAsync(
      createRequest('agent', true, OPERATION_A),
      agent.client
    );
    await setup.startedC;
    await settleAsync();
    expect(getSessionStatus(session).continuingOperations).toBeUndefined();

    failB.resolve();
    await agent.written;
    await settleAsync();
    expect(getSessionStatus(session)).toMatchObject({ continuingOperations: continuingC });

    setup.releaseC();
    await agentPromise;
    expect(getSessionStatus(session).continuingOperations).toBeUndefined();
  });

  it('are counted across the requests that left them running, and the first three are named in name order', async () => {
    const release: IDeferred = createDeferred();
    const [operationA1, operationA2, operationV, operationW, operationX, operationY, operationZ] = [
      'a1',
      'a2',
      'v',
      'w',
      'x',
      'y',
      'z'
    ].map((name: string) => `project-${name} (_phase:test)`);
    const slow = (): Promise<void> => release.promise;
    const runners: Map<string, TestOperationRunner> = new Map([
      [operationA1, new TestOperationRunner(operationA1)],
      [operationA2, new TestOperationRunner(operationA2)],
      [OPERATION_B, new TestOperationRunner(OPERATION_B, OperationStatus.Failure)],
      [operationV, new SilentTestOperationRunner(operationV, OperationStatus.Success, slow)],
      ...[operationW, operationX, operationY, operationZ].map((name: string): [string, TestOperationRunner] => [
        name,
        new TestOperationRunner(name, OperationStatus.Success, slow)
      ])
    ]);
    // The first build leaves V, X and Z running, and the second W and Y; V is silent.
    const fixture: ITestRoutingFixture = createRoutingFixture(
      runners,
      [
        ...[OPERATION_B, operationV, operationX, operationZ].map(
          (name: string): readonly [string, string] => [operationA1, name]
        ),
        ...[OPERATION_B, operationW, operationY].map((name: string): readonly [string, string] => [
          operationA2,
          name
        ])
      ],
      { parallelism: runners.size }
    );
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const first: TestPhasedRequestClient = new TestPhasedRequestClient('first');
    const second: TestPhasedRequestClient = new TestPhasedRequestClient('second');
    const written: Promise<void[]> = Promise.all([whenResultWritten(first), whenResultWritten(second)]);
    const resultPromises: Promise<IDaemonPhasedRequestResult>[] = [
      router.executeAsync(createRequest('first', true, operationA1), first),
      router.executeAsync(createRequest('second', true, operationA2), second)
    ];
    await written;
    await settleAsync();

    expect(describeContinuingOperations(fixture.session)).toEqual({
      count: 4,
      names: [operationW, operationX, operationY]
    });
    release.resolve();
    await Promise.all(resultPromises);
    expect(describeContinuingOperations(fixture.session)).toBeUndefined();
  });

  it('are named again, without the ones that ended, each time their number gets smaller', async () => {
    const [operationE, operationF, operationU, operationX, operationY] = ['e', 'f', 'u', 'x', 'y'].map(
      (name: string) => `project-${name} (_phase:test)`
    );
    const [startedU, startedX, startedY, releaseU, releaseX, releaseY] = [1, 2, 3, 4, 5, 6].map(() =>
      createDeferred()
    );
    const ended: string[] = [];
    const slow = (name: string, started: IDeferred, release: IDeferred): TestOperationRunner =>
      new TestOperationRunner(name, OperationStatus.Success, async (): Promise<void> => {
        started.resolve();
        await release.promise;
        ended.push(name);
      });
    const runners: Map<string, TestOperationRunner> = new Map([
      [operationE, new TestOperationRunner(operationE)],
      [operationF, new TestOperationRunner(operationF)],
      [
        OPERATION_B,
        new TestOperationRunner(OPERATION_B, OperationStatus.Failure, async (): Promise<void> => {
          await Promise.all([startedU.promise, startedX.promise, startedY.promise]);
        })
      ],
      [operationU, slow(operationU, startedU, releaseU)],
      [operationX, slow(operationX, startedX, releaseX)],
      [operationY, slow(operationY, startedY, releaseY)]
    ]);
    // The failed build leaves X and Y running. U runs only for the request that leaves, and F waits for U.
    const fixture: ITestRoutingFixture = createRoutingFixture(
      runners,
      [
        [operationE, OPERATION_B],
        [operationE, operationX],
        [operationE, operationY],
        [operationF, operationU]
      ],
      { parallelism: runners.size }
    );
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const agent: TestPhasedRequestClient = new TestPhasedRequestClient('agent');
    const departing: TestPhasedRequestClient = new TestPhasedRequestClient('departing');
    const agentWritten: Promise<void> = whenResultWritten(agent);
    const agentPromise: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('agent', true, operationE),
      agent
    );
    const departingPromise: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('departing', false, operationF),
      departing
    );
    await agentWritten;
    await settleAsync();
    const later: TestPhasedRequestClient = new TestPhasedRequestClient('later');
    const laterPromise: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
      createRequest('later', false, operationX),
      later
    );
    await settleAsync();
    departing.abortController.abort();
    await departingPromise;
    await settleAsync();
    const bothRun: IDaemonRequestQueuePositionMessage['payload'] = {
      position: 1,
      requestId: 'later',
      continuingOperations: { count: 2, names: [operationX, operationY] }
    };
    expect(getQueuePositions(later)).toEqual([{ position: 1, requestId: 'later' }, bothRun]);

    // U ends, but the failed build didn't leave it running, so the later build waits for the same operations.
    releaseU.resolve();
    await settleAsync();
    expect(ended).toEqual([operationU]);
    expect(getQueuePositions(later)).toEqual([{ position: 1, requestId: 'later' }, bothRun]);

    releaseX.resolve();
    await settleAsync();
    const yRuns: IDaemonRequestQueuePositionMessage['payload'] = {
      position: 1,
      requestId: 'later',
      continuingOperations: { count: 1, names: [operationY] }
    };
    expect(getQueuePositions(later)).toEqual([{ position: 1, requestId: 'later' }, bothRun, yRuns]);
    expect(getSessionStatus(fixture.session)).toMatchObject({ continuingOperations: { count: 1 } });

    // Once the last one ends, the iteration ends, and the later build runs without another position.
    releaseY.resolve();
    await Promise.all([agentPromise, laterPromise]);
    expect(getQueuePositions(later)).toEqual([{ position: 1, requestId: 'later' }, bothRun, yRuns]);
    expect(getSessionStatus(fixture.session).continuingOperations).toBeUndefined();
  });
});
