// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonPhasedRequest, IDaemonPhasedRequestResult } from '@rushstack/rush-daemon-protocol';
import { OperationStatus } from '@microsoft/rush-lib';

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
 * failure decides a request's result.
 */
function createEarlyFailureFixture(
  dependencies: ReadonlyArray<readonly [string, string]> = A_CONSUMES_B_AND_C,
  failBeforeCStarts: boolean = false,
  silentC: boolean = false
): IEarlyFailureFixture {
  const startedC: IDeferred = createDeferred();
  const releaseC: IDeferred = createDeferred();
  const events: string[] = [];
  const fixture: ITestRoutingFixture = createRoutingFixture(
    new Map([
      [OPERATION_A, new TestOperationRunner(OPERATION_A)],
      [
        OPERATION_B,
        new TestOperationRunner(OPERATION_B, OperationStatus.Failure, async (): Promise<void> => {
          if (!failBeforeCStarts) {
            await startedC.promise;
          }
        })
      ],
      [
        OPERATION_C,
        new (silentC ? SilentTestOperationRunner : TestOperationRunner)(
          OPERATION_C,
          OperationStatus.Success,
          async (): Promise<void> => {
            startedC.resolve();
            await releaseC.promise;
          }
        )
      ]
    ]),
    dependencies,
    { parallelism: 2 }
  );
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
