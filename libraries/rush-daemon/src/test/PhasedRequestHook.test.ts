// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { OperationStatus } from '@microsoft/rush-lib';
import type { IOperationExecutionResult, IOperationGraphRequestResult } from '@microsoft/rush-lib';
import {
  DaemonFrameType,
  decodeDaemonEventFrame,
  decodeDaemonLogChunk,
  type IDaemonEventEnvelope,
  type IDaemonPhasedOperationSelection,
  type IDaemonPhasedRequest,
  type IDaemonPhasedRequestResult
} from '@rushstack/rush-daemon-protocol';

import { PhasedRequestRouter } from '../PhasedRequestRouter';
import type { ITerminalExchange } from './DaemonRequestWireTestUtilities';
import { createFixtureAsync, runAsync, runs, type IFixture } from './NativeEngineTestFixture';
import {
  TEST_ENGINE_SHAPE,
  TestOperationRunner,
  TestPhasedRequestClient,
  createRoutingFixture,
  type ITestClientWrite,
  type ITestRoutingFixture
} from './PhasedRequestRouterTestUtilities';

jest.setTimeout(30_000);

const OPERATION_A: string = 'project-a (_phase:test)';
const OPERATION_B: string = 'project-b (_phase:test)';
const OPERATION_C: string = 'project-c (_phase:test)';
const OPERATION_D: string = 'project-d (_phase:test)';
const BUILD_DURATION_LINE: RegExp = /^rush build \(\d+\.\d\d seconds\)$/m;

interface IRecordedRequest {
  readonly commandName: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly requestId: string | undefined;
  readonly results: ReadonlyMap<string, IOperationExecutionResult>;
  readonly status: OperationStatus;
}

function createRequest(
  requestId: string,
  commandName: string,
  operationIds: ReadonlyArray<string>,
  environment: Record<string, string> = {}
): IDaemonPhasedRequest {
  return {
    commandName,
    commandOrigin: 'built-in',
    engineShape: TEST_ENGINE_SHAPE,
    environment,
    operationSelection: operationIds.map(
      (operationId: string): IDaemonPhasedOperationSelection => ({ enabledState: true, operationId })
    ),
    requestId
  };
}

function createFixture(): ITestRoutingFixture {
  return createRoutingFixture(
    new Map([
      [OPERATION_A, new TestOperationRunner(OPERATION_A)],
      [OPERATION_B, new TestOperationRunner(OPERATION_B)],
      [OPERATION_C, new TestOperationRunner(OPERATION_C)]
    ]),
    [[OPERATION_B, OPERATION_A]]
  );
}

/** Records each request that reaches the hook, and writes `hook-<requestId>` to the request's terminal. */
function recordRequests(
  fixture: ITestRoutingFixture,
  onRequest?: (request: IOperationGraphRequestResult) => void
): IRecordedRequest[] {
  const requests: IRecordedRequest[] = [];
  fixture.session.operationGraph.hooks.afterExecuteRequestAsync.tapPromise(
    'test',
    async (request: IOperationGraphRequestResult): Promise<void> => {
      requests.push({
        commandName: request.commandName,
        environment: request.environment,
        requestId: request.requestId,
        results: new Map(
          Array.from(request.operationResults, ([operation, result]) => [operation.name, result])
        ),
        status: request.status
      });
      request.terminal.writeLine(`hook-${request.requestId}`);
      onRequest?.(request);
    }
  );
  return requests;
}

function getRequest(requests: ReadonlyArray<IRecordedRequest>, requestId: string): IRecordedRequest {
  const request: IRecordedRequest | undefined = requests.find((r) => r.requestId === requestId);
  if (!request) {
    throw new Error(`The hook did not receive request "${requestId}".`);
  }
  return request;
}

function getActivity(client: TestPhasedRequestClient, stream: 'stdout' | 'stderr'): string {
  let text: string = '';
  for (const { event } of client.writes) {
    const payload: { stream?: string; text?: string } | undefined =
      event?.type === 'activityChanged' ? (event.payload as { stream?: string; text?: string }) : undefined;
    if (payload?.stream === stream) {
      text += payload.text;
    }
  }
  return text;
}

/** Expects the hook's line to follow the status tables and to precede the duration line. */
function expectHookOutputBetween(
  stdout: string,
  statusBanner: string,
  hookLine: string,
  durationLine: RegExp
): void {
  const bannerIndex: number = stdout.indexOf(statusBanner);
  const hookIndex: number = stdout.indexOf(`${hookLine}\n`);
  expect(bannerIndex).toBeGreaterThanOrEqual(0);
  expect(hookIndex).toBeGreaterThan(bannerIndex);
  expect(stdout.search(durationLine)).toBeGreaterThan(hookIndex);
}

describe('afterExecuteRequestAsync in the phased request router', () => {
  it("invokes the hook once for each coalesced request, with that request's own results and environment", async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const scheduleSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'scheduleIterationAsync');
    const requests: IRecordedRequest[] = recordRequests(fixture);
    try {
      const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
      const clientA: TestPhasedRequestClient = new TestPhasedRequestClient('one');
      const clientC: TestPhasedRequestClient = new TestPhasedRequestClient('two');
      const [resultA, resultC] = await Promise.all([
        router.executeAsync(createRequest('a', 'build', [OPERATION_A], { ORIGIN: 'client-a' }), clientA),
        router.executeAsync(createRequest('c', 'build', [OPERATION_C], { ORIGIN: 'client-c' }), clientC)
      ]);

      expect(scheduleSpy).toHaveBeenCalledTimes(1);
      expect(resultA).toMatchObject({ exitCode: 0, outcome: 'success' });
      expect(resultC).toMatchObject({ exitCode: 0, outcome: 'success' });
      expect(requests).toHaveLength(2);

      const requestA: IRecordedRequest = getRequest(requests, 'a');
      expect(requestA).toMatchObject({ commandName: 'build', status: OperationStatus.Success });
      expect(requestA.environment).toEqual({ ORIGIN: 'client-a' });
      expect(Array.from(requestA.results.keys())).toEqual([OPERATION_A]);
      expect(requestA.results.get(OPERATION_A)?.status).toBe(OperationStatus.Success);

      const requestC: IRecordedRequest = getRequest(requests, 'c');
      expect(requestC).toMatchObject({ commandName: 'build', status: OperationStatus.Success });
      expect(requestC.environment).toEqual({ ORIGIN: 'client-c' });
      expect(Array.from(requestC.results.keys())).toEqual([OPERATION_C]);
      expect(requestC.results.get(OPERATION_C)?.status).toBe(OperationStatus.Success);

      // Each request's terminal writes only into that request's output, between its summary and duration line.
      const stdoutA: string = getActivity(clientA, 'stdout');
      const stdoutC: string = getActivity(clientC, 'stdout');
      expect(stdoutA).not.toContain('hook-c');
      expect(stdoutC).not.toContain('hook-a');
      expectHookOutputBetween(stdoutA, '==[ SUCCESS: 1 operation ]==', 'hook-a', BUILD_DURATION_LINE);
      expectHookOutputBetween(stdoutC, '==[ SUCCESS: 1 operation ]==', 'hook-c', BUILD_DURATION_LINE);
    } finally {
      await fixture.session[Symbol.asyncDispose]();
    }
  });

  it("passes each request's own command name", async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const requests: IRecordedRequest[] = recordRequests(fixture);
    try {
      const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
      await router.executeAsync(createRequest('a', 'build', [OPERATION_A]), new TestPhasedRequestClient());
      const client: TestPhasedRequestClient = new TestPhasedRequestClient();
      const result = await router.executeAsync(createRequest('c', 'test', [OPERATION_C]), client);

      expect(result).toMatchObject({ exitCode: 0, outcome: 'success' });
      expect(requests.map(({ commandName, requestId }) => ({ commandName, requestId }))).toEqual([
        { commandName: 'build', requestId: 'a' },
        { commandName: 'test', requestId: 'c' }
      ]);
      expectHookOutputBetween(
        getActivity(client, 'stdout'),
        '==[ SUCCESS: 1 operation ]==',
        'hook-c',
        /^rush test \(\d+\.\d\d seconds\)$/m
      );
    } finally {
      await fixture.session[Symbol.asyncDispose]();
    }
  });

  it('invokes the hook with Skipped results for a warm request that needs no iteration', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    try {
      const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
      await router.executeAsync(createRequest('cold', 'build', [OPERATION_B]), new TestPhasedRequestClient());
      let iterations: number = 0;
      fixture.session.operationGraph.hooks.afterExecuteIterationAsync.tap(
        'test',
        (status: OperationStatus) => {
          iterations++;
          return status;
        }
      );
      // Simulate the incremental plugin disabling every operation whose inputs did not change.
      fixture.graph.hooks.configureIteration.tap('test', (records) => {
        for (const record of records.values()) {
          record.enabled = false;
        }
      });
      const requests: IRecordedRequest[] = recordRequests(fixture);
      const client: TestPhasedRequestClient = new TestPhasedRequestClient();

      const result = await router.executeAsync(createRequest('warm', 'build', [OPERATION_B]), client);

      expect(result).toMatchObject({ exitCode: 0, scheduled: false });
      expect(iterations).toBe(0);
      expect(requests).toHaveLength(1);
      const warm: IRecordedRequest = getRequest(requests, 'warm');
      expect(warm.status).toBe(OperationStatus.Success);
      expect(Array.from(warm.results.keys())).toEqual([OPERATION_A, OPERATION_B]);
      for (const upToDate of warm.results.values()) {
        expect(upToDate).toMatchObject({
          error: undefined,
          logFilePaths: undefined,
          silent: false,
          status: OperationStatus.Skipped
        });
        expect(upToDate.stopwatch).toMatchObject({ duration: 0, endTime: undefined, startTime: undefined });
        expect(upToDate.problemCollector.problems.size).toBe(0);
      }
      // The results that other requests and the next iteration read are unchanged.
      const graphStatuses: Map<string, OperationStatus> = new Map(
        Array.from(fixture.session.operationGraph.resultByOperation, ([operation, graphResult]) => [
          operation.name,
          graphResult.status
        ])
      );
      expect(graphStatuses.get(OPERATION_A)).toBe(OperationStatus.Success);
      expect(graphStatuses.get(OPERATION_B)).toBe(OperationStatus.Success);
      expectHookOutputBetween(
        getActivity(client, 'stdout'),
        '==[ SKIPPED: 2 operations ]==',
        'hook-warm',
        BUILD_DURATION_LINE
      );
    } finally {
      await fixture.session[Symbol.asyncDispose]();
    }
  });

  it('fails only the request whose tap throws', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const requests: IRecordedRequest[] = recordRequests(fixture, (request: IOperationGraphRequestResult) => {
      if (request.requestId === 'a') {
        throw new Error('summary-write-failed');
      }
    });
    try {
      const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
      const clientA: TestPhasedRequestClient = new TestPhasedRequestClient('one');
      const clientC: TestPhasedRequestClient = new TestPhasedRequestClient('two');
      const [resultA, resultC] = await Promise.all([
        router.executeAsync(createRequest('a', 'build', [OPERATION_A]), clientA),
        router.executeAsync(createRequest('c', 'build', [OPERATION_C]), clientC)
      ]);

      expect(requests.map(({ requestId }) => requestId).sort()).toEqual(['a', 'c']);
      expect(resultA).toMatchObject({
        errorMessage: expect.stringContaining('summary-write-failed'),
        exitCode: 1,
        outcome: 'failure'
      });
      expect(getActivity(clientA, 'stderr')).toMatch(/^rush build - Errors! \(\d+\.\d\d seconds\)$/m);
      expect(getActivity(clientA, 'stdout')).not.toMatch(BUILD_DURATION_LINE);
      expect(resultC).toMatchObject({ exitCode: 0, outcome: 'success' });
      expect(getActivity(clientC, 'stdout')).toMatch(BUILD_DURATION_LINE);
      expect(getActivity(clientC, 'stderr')).not.toContain('Errors!');
    } finally {
      await fixture.session[Symbol.asyncDispose]();
    }
  });

  it('invokes the hook once for a request that returns early, with only the results that are final', async () => {
    let startC: () => void = () => undefined;
    const startedC: Promise<void> = new Promise((resolve) => {
      startC = resolve;
    });
    let releaseC: () => void = () => undefined;
    const releasedC: Promise<void> = new Promise((resolve) => {
      releaseC = resolve;
    });
    let buildsOfB: number = 0;
    let buildsOfC: number = 0;
    // A consumes B and D, and D consumes C. In the second build, B fails once C runs, so C runs and D waits.
    const fixture: ITestRoutingFixture = createRoutingFixture(
      new Map([
        [OPERATION_A, new TestOperationRunner(OPERATION_A)],
        [
          OPERATION_B,
          new TestOperationRunner(
            OPERATION_B,
            OperationStatus.Success,
            async (): Promise<OperationStatus> => {
              if (++buildsOfB === 1) {
                return OperationStatus.Success;
              }
              await startedC;
              return OperationStatus.Failure;
            }
          )
        ],
        [
          OPERATION_C,
          new TestOperationRunner(OPERATION_C, OperationStatus.Success, async (): Promise<void> => {
            if (++buildsOfC > 1) {
              startC();
              await releasedC;
            }
          })
        ],
        [OPERATION_D, new TestOperationRunner(OPERATION_D)]
      ]),
      [
        [OPERATION_A, OPERATION_B],
        [OPERATION_A, OPERATION_D],
        [OPERATION_D, OPERATION_C]
      ],
      { parallelism: 2 }
    );
    try {
      const router: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
      // The first build leaves a successful result for every operation, which the second build runs again.
      await expect(
        router.executeAsync(createRequest('cold', 'build', [OPERATION_A]), new TestPhasedRequestClient())
      ).resolves.toMatchObject({ exitCode: 0 });
      const requests: IRecordedRequest[] = recordRequests(fixture);
      const client: TestPhasedRequestClient = new TestPhasedRequestClient();
      let onWritten: () => void = () => undefined;
      const written: Promise<void> = new Promise((resolve) => {
        onWritten = resolve;
      });
      client.onWriteAsync = async (write: ITestClientWrite): Promise<void> => {
        if (write.result) {
          onWritten();
        }
      };
      const resultPromise: Promise<IDaemonPhasedRequestResult> = router.executeAsync(
        { ...createRequest('early', 'build', [OPERATION_A]), returnEarlyOnFailure: true },
        client
      );
      await written;

      expect(requests).toHaveLength(1);
      const early: IRecordedRequest = getRequest(requests, 'early');
      expect(early.status).toBe(OperationStatus.Failure);
      // C still runs and D has not started, so neither has a result to report yet.
      expect(
        Object.fromEntries(Array.from(early.results, ([name, result]) => [name, result.status]))
      ).toEqual({
        [OPERATION_A]: OperationStatus.Blocked,
        [OPERATION_B]: OperationStatus.Failure
      });
      // The summary that the client prints lists the same operations.
      const stdout: string = getActivity(client, 'stdout');
      expect(stdout).not.toContain('SKIPPED');
      expectHookOutputBetween(stdout, '==[ BLOCKED: 1 operation ]==', 'hook-early', BUILD_DURATION_LINE);

      releaseC();
      await expect(resultPromise).resolves.toMatchObject({ exitCode: 1 });
      expect(requests).toHaveLength(1);
    } finally {
      releaseC();
      await fixture.session[Symbol.asyncDispose]();
    }
  });

  it('does not invoke the hook for a request whose iteration failed', async () => {
    const fixture: ITestRoutingFixture = createFixture();
    const requests: IRecordedRequest[] = recordRequests(fixture);
    fixture.session.operationGraph.hooks.beforeExecuteIterationAsync.tapPromise(
      'test',
      async (): Promise<undefined> => {
        throw new Error('iteration-failed');
      }
    );
    try {
      const client: TestPhasedRequestClient = new TestPhasedRequestClient();
      const result = await new PhasedRequestRouter(fixture.session).executeAsync(
        createRequest('broken', 'build', [OPERATION_A]),
        client
      );

      expect(result).toMatchObject({
        errorMessage: expect.stringContaining('iteration-failed'),
        exitCode: 1
      });
      expect(requests).toEqual([]);
      expect(getActivity(client, 'stderr')).toMatch(/^rush build - Errors! \(\d+\.\d\d seconds\)$/m);
    } finally {
      await fixture.session[Symbol.asyncDispose]();
    }
  });

  it('does not invoke the hook for a request that its client cancels', async () => {
    let markStarted: () => void = () => undefined;
    const started: Promise<void> = new Promise((resolve) => {
      markStarted = resolve;
    });
    let release: () => void = () => undefined;
    const released: Promise<void> = new Promise((resolve) => {
      release = resolve;
    });
    const fixture: ITestRoutingFixture = createRoutingFixture(
      new Map([
        [
          OPERATION_A,
          new TestOperationRunner(OPERATION_A, OperationStatus.Success, async (): Promise<void> => {
            markStarted();
            await released;
          })
        ]
      ])
    );
    const requests: IRecordedRequest[] = recordRequests(fixture);
    try {
      const client: TestPhasedRequestClient = new TestPhasedRequestClient();
      const resultPromise: Promise<IDaemonPhasedRequestResult> = new PhasedRequestRouter(
        fixture.session
      ).executeAsync(createRequest('cancelled', 'build', [OPERATION_A]), client);
      await started;
      client.abortController.abort();
      release();

      await expect(resultPromise).resolves.toMatchObject({ exitCode: 1, outcome: 'aborted' });
      expect(requests.map(({ requestId }) => requestId)).toEqual([]);
    } finally {
      release();
      await fixture.session[Symbol.asyncDispose]();
    }
  });
});

function getProjectStatuses(request: IOperationGraphRequestResult): Record<string, OperationStatus> {
  return Object.fromEntries(
    Array.from(request.operationResults, ([operation, result]) => [
      operation.associatedProject.packageName,
      result.status
    ])
  );
}

/** The text that a request's terminal wrote, whether it arrived as activity events or as log chunks. */
function getRequestOutput(exchange: ITerminalExchange): string {
  let text: string = '';
  for (const frame of exchange.frames) {
    if (frame.kind === DaemonFrameType.event) {
      const event: IDaemonEventEnvelope = decodeDaemonEventFrame(frame.payload);
      if (event.type === 'activityChanged') {
        text += (event.payload as { text?: string }).text ?? '';
      }
    } else if (frame.kind === DaemonFrameType.logStdout || frame.kind === DaemonFrameType.logStderr) {
      text += Buffer.from(decodeDaemonLogChunk(frame.payload).chunk).toString();
    }
  }
  return text;
}

describe('afterExecuteRequestAsync on a native engine', () => {
  it('invokes the hook once for each request, including a warm request that needs no iteration', async () => {
    const fixture: IFixture = await createFixtureAsync();
    try {
      expect((await runAsync(fixture, 'cold', ['build'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      const requests: IOperationGraphRequestResult[] = [];
      fixture.session.operationGraph!.hooks.afterExecuteRequestAsync.tapPromise(
        'test',
        async (request: IOperationGraphRequestResult): Promise<void> => {
          requests.push(request);
          request.terminal.writeLine(`hook-${request.requestId}-${request.status}`);
        }
      );

      const warm: ITerminalExchange = await runAsync(fixture, 'warm', ['build']);
      expect(warm.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: false }
      });
      fs.writeFileSync(path.join(fixture.repoRoot, 'projects/c/input.txt'), 'two');
      const changed: ITerminalExchange = await runAsync(fixture, 'changed', ['build']);
      expect(changed.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });

      expect([...runs(fixture)].sort()).toEqual(['a:one:', 'b:one:', 'c:one:', 'c:two:']);
      // The engine does not also invoke the hook from its iteration, which would report the changed request twice.
      expect(
        requests.map(({ commandName, requestId, status }) => ({ commandName, requestId, status }))
      ).toEqual([
        { commandName: 'build', requestId: 'warm', status: OperationStatus.Success },
        { commandName: 'build', requestId: 'changed', status: OperationStatus.Success }
      ]);
      expect(getProjectStatuses(requests[0])).toEqual({
        a: OperationStatus.Skipped,
        b: OperationStatus.Skipped,
        c: OperationStatus.Skipped
      });
      expect(getProjectStatuses(requests[1])).toEqual({
        a: OperationStatus.Skipped,
        b: OperationStatus.Skipped,
        c: OperationStatus.Success
      });
      expect(getRequestOutput(warm)).toContain('hook-warm-SUCCESS\n');
      expect(getRequestOutput(changed)).toContain('hook-changed-SUCCESS\n');
      expect(getRequestOutput(changed)).not.toContain('hook-warm');
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });
});
