// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonPhasedRequest } from '@rushstack/rush-daemon-protocol';
import {
  OperationStatus,
  type IPhasedCommandEngineTelemetryOptions,
  type IPhasedCommandEngineTelemetryRecord,
  type ITelemetryData,
  type Operation
} from '@microsoft/rush-lib';

import { PhasedRequestRouter } from '../PhasedRequestRouter';
import type { IPhasedRequestTelemetryReport, IPhasedRequestTelemetrySink } from '../PhasedRequestTelemetry';
import {
  createDaemonRequestTelemetryData,
  createDaemonRequestTelemetrySink,
  type IDaemonRequestTelemetryContext
} from '../DaemonRequestTelemetry';
import {
  TEST_ENGINE_SHAPE,
  TestOperationRunner,
  TestPhasedRequestClient,
  createRoutingFixture
} from './PhasedRequestRouterTestUtilities';
import type { ITestRoutingFixture } from './PhasedRequestRouterTestUtilities';

const OPERATION_A: string = 'project-a (_phase:test)';
const OPERATION_B: string = 'project-b (_phase:test)';

const DAEMON_MEASURES: ReadonlyArray<string> = [
  'rush:daemon:admission',
  'rush:daemon:queueWait',
  'rush:daemon:acquireExecutionLease',
  'rush:daemon:reconcileInvalidations',
  'rush:daemon:applySelections',
  'rush:daemon:scheduleIteration',
  'rush:daemon:executeIteration'
];

function createRequest(requestId: string, ...operationIds: ReadonlyArray<string>): IDaemonPhasedRequest {
  return {
    commandName: 'build',
    commandOrigin: 'built-in',
    engineShape: TEST_ENGINE_SHAPE,
    environment: {},
    operationSelection: operationIds.map((operationId: string) => ({ enabledState: true, operationId })),
    requestId
  };
}

function createFixture(statusesA: ReadonlyArray<OperationStatus> = []): ITestRoutingFixture {
  const pendingStatusesA: OperationStatus[] = [...statusesA];
  return createRoutingFixture(
    new Map([
      [
        OPERATION_A,
        new TestOperationRunner(OPERATION_A, OperationStatus.Success, async () => pendingStatusesA.shift())
      ],
      [OPERATION_B, new TestOperationRunner(OPERATION_B)]
    ]),
    [[OPERATION_B, OPERATION_A]]
  );
}

class RecordingTelemetrySink implements IPhasedRequestTelemetrySink {
  public readonly reports: IPhasedRequestTelemetryReport[] = [];
  public readonly resultsWrittenBeforeReport: boolean[] = [];
  readonly #client: TestPhasedRequestClient;

  public constructor(client: TestPhasedRequestClient) {
    this.#client = client;
  }

  public logRequest(report: IPhasedRequestTelemetryReport): void {
    this.resultsWrittenBeforeReport.push(this.#client.writes.some(({ result }) => result !== undefined));
    this.reports.push(report);
  }
}

function getStatuses(report: IPhasedRequestTelemetryReport): Record<string, OperationStatus> {
  const statuses: Record<string, OperationStatus> = {};
  for (const [operation, record] of report.records) {
    statuses[operation.name] = record.status;
  }
  return statuses;
}

async function executeAsync(
  router: PhasedRequestRouter,
  request: IDaemonPhasedRequest
): Promise<RecordingTelemetrySink> {
  const client: TestPhasedRequestClient = new TestPhasedRequestClient(request.requestId);
  const sink: RecordingTelemetrySink = new RecordingTelemetrySink(client);
  await router.executeAsync(request, client, false, undefined, undefined, sink);
  return sink;
}

describe('phased request telemetry', () => {
  it('reports each coalesced request once, with its own selection, before its result is written', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    try {
      const [dependency, consumer] = await Promise.all([
        executeAsync(router, createRequest('dependency', OPERATION_A)),
        executeAsync(router, createRequest('consumer', OPERATION_B))
      ]);

      expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(1);
      for (const sink of [dependency, consumer]) {
        expect(sink.reports).toHaveLength(1);
        expect(sink.resultsWrittenBeforeReport).toEqual([false]);
        const [report] = sink.reports;
        expect(report).toMatchObject({ batchSize: 2, scheduled: true, countRetained: 0 });
        expect(report.result).toMatchObject({ exitCode: 0, outcome: 'success' });
        expect(report.measures.map(({ name }) => name)).toEqual(DAEMON_MEASURES);
        for (const { startTimeMs, endTimeMs } of report.measures) {
          expect(endTimeMs).toBeGreaterThanOrEqual(startTimeMs);
        }
        expect(report.receivedTimeMs).toBeLessThanOrEqual(report.executionStartTimeMs);
        expect(report.executionStartTimeMs).toBeLessThanOrEqual(report.iterationStartTimeMs!);
        expect(report.iterationStartTimeMs!).toBeLessThanOrEqual(report.resultTimeMs);
      }
      expect(dependency.reports[0].request.requestId).toBe('dependency');
      expect(getStatuses(dependency.reports[0])).toEqual({ [OPERATION_A]: OperationStatus.Success });
      expect(getStatuses(consumer.reports[0])).toEqual({
        [OPERATION_A]: OperationStatus.Success,
        [OPERATION_B]: OperationStatus.Success
      });
    } finally {
      await fixture.session[Symbol.asyncDispose]();
    }
  });

  it('reports every request of an iteration before the next queued iteration starts', async () => {
    const OPERATION_C: string = 'project-c (_phase:test)';
    let resolveStarted: () => void = () => undefined;
    let resolveRelease: () => void = () => undefined;
    const consumerStarted: Promise<void> = new Promise((resolve) => (resolveStarted = resolve));
    const releaseConsumer: Promise<void> = new Promise((resolve) => (resolveRelease = resolve));
    const fixture: ITestRoutingFixture = createRoutingFixture(
      new Map([
        [OPERATION_A, new TestOperationRunner(OPERATION_A)],
        [
          OPERATION_B,
          new TestOperationRunner(OPERATION_B, OperationStatus.Success, async () => {
            resolveStarted();
            await releaseConsumer;
          })
        ],
        [OPERATION_C, new TestOperationRunner(OPERATION_C)]
      ]),
      [[OPERATION_B, OPERATION_A]]
    );
    // Like a telemetry plugin that starts a new session for each iteration and reads it in beforeLog.
    let iteration: number = 0;
    const events: string[] = [];
    fixture.graph.hooks.beforeExecuteIterationAsync.tap('iteration session', () => {
      events.push(`iteration ${++iteration}`);
    });
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    async function executeRecordedAsync(requestId: string, operationId: string): Promise<void> {
      const client: TestPhasedRequestClient = new TestPhasedRequestClient(requestId);
      // A slow reader spreads each request's final flush, which precedes its report, over several event loop turns.
      client.onWriteAsync = async (): Promise<void> => {
        await new Promise<void>((resolve) => setImmediate(resolve));
      };
      await router.executeAsync(createRequest(requestId, operationId), client, false, undefined, undefined, {
        logRequest: ({ batchSize, earlyResult }: IPhasedRequestTelemetryReport) => {
          events.push(`log ${requestId} in iteration ${iteration} (batch ${batchSize}, early ${earlyResult})`);
        }
      });
    }
    try {
      const firstBatch: Promise<unknown> = Promise.all([
        executeRecordedAsync('dependency', OPERATION_A),
        executeRecordedAsync('consumer', OPERATION_B)
      ]);
      await consumerStarted;
      const queued: Promise<void> = executeRecordedAsync('queued', OPERATION_C);
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      expect(fixture.runners.get(OPERATION_C)?.runCount).toBe(0);
      resolveRelease();
      await Promise.all([firstBatch, queued]);

      expect(events).toEqual([
        'iteration 1',
        'log dependency in iteration 1 (batch 2, early true)',
        'log consumer in iteration 1 (batch 2, early false)',
        'iteration 2',
        'log queued in iteration 2 (batch 1, early false)'
      ]);
    } finally {
      await fixture.session[Symbol.asyncDispose]();
    }
  });

  it('reports the operations of a request with no work as retained and skipped', async () => {
    const fixture: ITestRoutingFixture = createFixture();
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
    try {
      await executeAsync(router, createRequest('initial', OPERATION_B));
      const sink: RecordingTelemetrySink = await executeAsync(router, createRequest('repeat', OPERATION_B));

      expect(fixture.runners.get(OPERATION_B)?.runCount).toBe(1);
      expect(sink.reports).toHaveLength(1);
      const [report] = sink.reports;
      expect(report).toMatchObject({ batchSize: 1, scheduled: false, countRetained: 2 });
      expect(report.result).toMatchObject({ exitCode: 0, scheduled: false });
      expect(report.iterationStartTimeMs).toBeUndefined();
      expect(getStatuses(report)).toEqual({
        [OPERATION_A]: OperationStatus.Skipped,
        [OPERATION_B]: OperationStatus.Skipped
      });
      for (const record of report.records.values()) {
        expect(record.stopwatch).toEqual({
          startTime: report.executionStartTimeMs,
          endTime: report.executionStartTimeMs
        });
      }
      expect(report.measures.map(({ name }) => name)).not.toContain('rush:daemon:executeIteration');
    } finally {
      await fixture.session[Symbol.asyncDispose]();
    }
  });

  it('reports a failed request and a later passing request separately', async () => {
    const fixture: ITestRoutingFixture = createFixture([OperationStatus.Failure]);
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    try {
      const failed: RecordingTelemetrySink = await executeAsync(router, createRequest('failed', OPERATION_B));
      const passed: RecordingTelemetrySink = await executeAsync(router, createRequest('passed', OPERATION_B));

      expect(failed.reports[0].result).toMatchObject({ exitCode: 1, outcome: 'failure' });
      expect(getStatuses(failed.reports[0])).toEqual({
        [OPERATION_A]: OperationStatus.Failure,
        [OPERATION_B]: OperationStatus.Blocked
      });
      expect(passed.reports[0].result).toMatchObject({ exitCode: 0, outcome: 'success' });
      expect(getStatuses(passed.reports[0])).toEqual({
        [OPERATION_A]: OperationStatus.Success,
        [OPERATION_B]: OperationStatus.Success
      });
    } finally {
      await fixture.session[Symbol.asyncDispose]();
    }
  });

  it('does not report a request rejected before execution, and ignores sink errors', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    try {
      const rejectedSink: jest.Mocked<IPhasedRequestTelemetrySink> = { logRequest: jest.fn() };
      await expect(
        router.executeAsync(
          createRequest('rejected', 'missing (_phase:test)'),
          new TestPhasedRequestClient(),
          false,
          undefined,
          undefined,
          rejectedSink
        )
      ).rejects.toThrow();
      expect(rejectedSink.logRequest).not.toHaveBeenCalled();

      const client: TestPhasedRequestClient = new TestPhasedRequestClient();
      await expect(
        router.executeAsync(createRequest('accepted', OPERATION_A), client, false, undefined, undefined, {
          logRequest: () => {
            throw new Error('telemetry failure');
          }
        })
      ).resolves.toMatchObject({ exitCode: 0, outcome: 'success' });
      expect(client.writes.some(({ result }) => result?.exitCode === 0)).toBe(true);
    } finally {
      await fixture.session[Symbol.asyncDispose]();
    }
  });
});

describe(createDaemonRequestTelemetryData.name, () => {
  // Other suites' graph iterations record native measures in the same process-wide timeline.
  beforeEach(() => performance.clearMeasures());
  afterEach(() => performance.clearMeasures());

  function createContext(
    overrides: Partial<IDaemonRequestTelemetryContext> = {}
  ): IDaemonRequestTelemetryContext & { readonly calls: IPhasedCommandEngineTelemetryOptions[] } {
    const fixture: ITestRoutingFixture = createFixture();
    const calls: IPhasedCommandEngineTelemetryOptions[] = [];
    return {
      calls,
      command: {
        createTelemetryData: (options: IPhasedCommandEngineTelemetryOptions): ITelemetryData => {
          calls.push(options);
          return { name: 'build', durationInSeconds: options.durationInSeconds, result: 'Succeeded' };
        }
      },
      logTelemetry: jest.fn(),
      workspaceSession: fixture.session,
      lifecycleInfo: { receivedTimeMs: 100, preparedTimeMs: 150, reloadTier: 1 },
      resolveStartTimeMs: 150,
      resolveEndTimeMs: 200,
      engineCreation: undefined,
      getRequestIndex: () => 4,
      ...overrides
    };
  }

  function createReport(overrides: Partial<IPhasedRequestTelemetryReport> = {}): IPhasedRequestTelemetryReport {
    const records: Map<Operation, IPhasedCommandEngineTelemetryRecord> = new Map();
    return {
      request: {
        ...createRequest('request', OPERATION_A),
        environment: { COPILOT_AGENT_SESSION_ID: 'agent-1', ODSP_TELEMETRY_TAG: 'tag-1' }
      },
      result: {
        aborted: false,
        exitCode: 0,
        operationResults: [],
        outcome: 'success',
        scheduled: true
      } as unknown as IPhasedRequestTelemetryReport['result'],
      records,
      countRetained: 0,
      batchSize: 2,
      scheduled: true,
      earlyResult: false,
      receivedTimeMs: 210,
      executionStartTimeMs: 250,
      iterationStartTimeMs: 300,
      resultTimeMs: 1300,
      measures: [{ name: 'rush:daemon:queueWait', startTimeMs: 220, endTimeMs: 250 }],
      ...overrides
    };
  }

  it('measures the iteration as a native command does and adds the daemon fields', () => {
    const context: ReturnType<typeof createContext> = createContext();
    createDaemonRequestTelemetryData(context, createReport());

    const [options] = context.calls;
    expect(options).toMatchObject({ succeeded: true, durationInSeconds: 1, timeOriginMs: 100 });
    expect(options.extraData).toMatchObject({
      daemon: true,
      daemonPid: process.pid,
      requestId: 'request',
      reloadTier: 1,
      requestIndex: 4,
      batchSize: 2,
      queueWaitSeconds: 0.03,
      graphWasInitialized: true,
      scheduled: true,
      earlyResult: false,
      countRetained: 0,
      exitCode: 0,
      outcome: 'success',
      durationBasis: 'iteration',
      bootDurationSeconds: 0.2,
      totalDurationSeconds: 1.2,
      agentSessionId: 'agent-1',
      telemetryTag: 'tag-1'
    });
    expect(typeof options.extraData?.daemonVersion).toBe('string');
    expect(options.extraData?.generationToken).toHaveLength(8);
    expect(options.performanceEntries?.map(({ name, startTime, duration }) => [name, startTime, duration])).toEqual([
      ['rush:daemon:prepareWorkspace', 100, 50],
      ['rush:daemon:resolve', 150, 50],
      ['rush:daemon:queueWait', 220, 30]
    ]);
  });

  it('attributes engine creation and its native measures to the request that created the engine', () => {
    performance.measure('rush:test:beforeEngine', { start: 110, end: 115 });
    performance.measure('rush:test:createEngine', { start: 160, end: 170 });
    performance.measure('rush:executionManager:test', { start: 400, end: 900 });
    performance.measure('rush:executionManager:afterResult', { start: 400, end: 1400 });
    const context: ReturnType<typeof createContext> = createContext({
      engineCreation: { startTimeMs: 155, endTimeMs: 180 }
    });
    createDaemonRequestTelemetryData(context, createReport());

    const [options] = context.calls;
    expect(options.extraData).toMatchObject({ graphWasInitialized: false });
    expect(options.performanceEntries?.map(({ name }) => name)).toEqual([
      'rush:daemon:prepareWorkspace',
      'rush:daemon:createEngine',
      'rush:daemon:resolve',
      'rush:daemon:queueWait',
      'rush:test:createEngine',
      'rush:executionManager:test'
    ]);
  });

  it('measures a request that needed no iteration from when its batch began handling it', () => {
    const context: ReturnType<typeof createContext> = createContext({ lifecycleInfo: undefined });
    createDaemonRequestTelemetryData(
      context,
      createReport({
        scheduled: false,
        iterationStartTimeMs: undefined,
        resultTimeMs: 350,
        result: { exitCode: 1, outcome: 'failure' } as unknown as IPhasedRequestTelemetryReport['result']
      })
    );

    const [options] = context.calls;
    expect(options).toMatchObject({ succeeded: false, durationInSeconds: 0.1, timeOriginMs: 150 });
    expect(options.extraData).toMatchObject({ durationBasis: 'batch', exitCode: 1, outcome: 'failure' });
    expect(options.extraData).not.toHaveProperty('reloadTier');
    expect(options.performanceEntries?.map(({ name }) => name)).toEqual([
      'rush:daemon:resolve',
      'rush:daemon:queueWait'
    ]);
  });

  it('runs beforeLog taps only for entries that an iteration served', () => {
    const logTelemetry: jest.Mock = jest.fn();
    const sink: IPhasedRequestTelemetrySink = createDaemonRequestTelemetrySink(createContext({ logTelemetry }));
    sink.logRequest(createReport());
    sink.logRequest(createReport({ scheduled: false, iterationStartTimeMs: undefined }));

    expect(logTelemetry.mock.calls.map(([, options]) => options)).toEqual([
      { servedByIteration: true },
      { servedByIteration: false }
    ]);
  });

  it('logs through the engine and reports a logging failure without throwing', () => {
    const context: ReturnType<typeof createContext> = createContext({
      logTelemetry: () => {
        throw new Error('disk full');
      }
    });
    const stderrSpy: jest.SpyInstance = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(() => createDaemonRequestTelemetrySink(context).logRequest(createReport())).not.toThrow();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('disk full'));
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
