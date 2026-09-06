// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type {
  DaemonRushCommandOrigin,
  IDaemonCommandResult,
  IDaemonPhasedRequest,
  IDaemonRequestAdmissionOptions,
  IDaemonRequestQueuePositionMessage,
  IDaemonTerminalPolicyResult
} from '@rushstack/rush-daemon-protocol';
import { OperationStatus } from '@microsoft/rush-lib';

import type { IGlobalCommandExecutionContext } from '../GlobalCommandExecutionContext';
import type { IResolvedGlobalCommandRequest } from '../GlobalCommandRequest';
import type { IGlobalCommandRequestClient } from '../GlobalCommandRequestClient';
import {
  GlobalCommandRequestRouter
} from '../GlobalCommandRequestRouter';
import type {
  GlobalCommandExecutor,
  IGlobalCommandExecutionResult
} from '../GlobalCommandRequestRouter';
import type { IInteractiveRequestSession } from '../InteractiveRequestInputRouter';
import { InteractiveRequestInputRouter } from '../InteractiveRequestInputRouter';
import { PhasedRequestRouter } from '../PhasedRequestRouter';
import {
  TEST_ENGINE_SHAPE,
  TestOperationRunner,
  TestPhasedRequestClient,
  createRoutingFixture
} from './PhasedRequestRouterTestUtilities';
import { TestWorkspaceSession, TEST_REPO_ROOT } from './TestWorkspaceSession';

const TEST_CWD: string = path.join(TEST_REPO_ROOT, 'libraries', 'rush-daemon');
const TEST_OPERATION: string = 'project-a (_phase:test)';

class AdmissionClient implements IGlobalCommandRequestClient {
  public readonly abortController: AbortController = new AbortController();
  public readonly positions: number[] = [];
  public readonly results: IDaemonCommandResult[] = [];
  public readonly supportsRequestAdmission: boolean;
  public interactiveSession: IInteractiveRequestSession | undefined;
  public onQueuePositionAsync: (() => Promise<void>) | undefined;
  public onResultAsync: (() => Promise<void>) | undefined;

  public constructor(supportsRequestAdmission: boolean = true) {
    this.supportsRequestAdmission = supportsRequestAdmission;
  }

  public get abortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  public writeQueuePositionAsync(message: IDaemonRequestQueuePositionMessage): Promise<void> {
    this.positions.push(message.payload.position);
    return this.onQueuePositionAsync?.() ?? Promise.resolve();
  }

  public async writeResultAsync(result: IDaemonCommandResult): Promise<void> {
    await this.onResultAsync?.();
    this.results.push(result);
  }

  public writeTerminalChunkAsync(): Promise<void> {
    return Promise.resolve();
  }

  public writeTerminalPolicyAsync(result: IDaemonTerminalPolicyResult): Promise<void> {
    void result;
    return Promise.resolve();
  }
}

function createRequest(
  router: GlobalCommandRequestRouter,
  requestId: string,
  commandName: string,
  admission?: IDaemonRequestAdmissionOptions,
  commandOrigin: DaemonRushCommandOrigin = 'built-in'
): IResolvedGlobalCommandRequest {
  return router.resolveRequest({
    admission,
    commandName,
    commandOrigin,
    cwd: TEST_CWD,
    environment: {},
    requestId,
    terminal: { columns: 80, isTTY: false, supportsColor: false }
  });
}

function createBlockingExecutor(started: () => void, completion: Promise<void>): GlobalCommandExecutor {
  return async (): Promise<IGlobalCommandExecutionResult> => {
    started();
    await completion;
    return { exitCode: 0 };
  };
}

function createPhasedRequest(
  requestId: string,
  admission?: IDaemonRequestAdmissionOptions
): IDaemonPhasedRequest {
  return {
    admission,
    commandName: 'build',
    commandOrigin: 'built-in',
    engineShape: TEST_ENGINE_SHAPE,
    environment: {},
    operationSelection: [{ enabledState: true, operationId: TEST_OPERATION }],
    requestId
  };
}

function createLegacyPhasedRequest(requestId: string): IDaemonPhasedRequest {
  const legacyRequest: Partial<IDaemonPhasedRequest> = {
    commandName: 'build',
    engineShape: TEST_ENGINE_SHAPE,
    environment: {},
    operationSelection: [{ enabledState: true, operationId: TEST_OPERATION }],
    requestId
  };
  return legacyRequest as IDaemonPhasedRequest;
}

function createDeferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolvePromise: (() => void) | undefined;
  const promise: Promise<void> = new Promise((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: () => resolvePromise?.() };
}

describe('request admission integration', () => {
  it('admits compatible shared reads concurrently', async () => {
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const release = createDeferred();
    const bothStarted = createDeferred();
    let startedCount: number = 0;
    const markStarted = (): void => {
      if (++startedCount === 2) {
        bothStarted.resolve();
      }
    };

    const first = router.executeAsync(
      createRequest(router, 'first', 'list'),
      createBlockingExecutor(markStarted, release.promise),
      new AdmissionClient()
    );
    const second = router.executeAsync(
      createRequest(router, 'second', 'scan'),
      createBlockingExecutor(markStarted, release.promise),
      new AdmissionClient()
    );
    await bothStarted.promise;
    release.resolve();

    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { outcome: 'success' },
      { outcome: 'success' }
    ]);
  });

  it('uses an exclusive request as a FIFO gate and reports one-based positions', async () => {
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const releaseRead = createDeferred();
    const releaseExclusive = createDeferred();
    const readStarted = createDeferred();
    const exclusiveStarted = createDeferred();
    let laterReadStarted: boolean = false;
    const first = router.executeAsync(
      createRequest(router, 'active-read', 'list'),
      createBlockingExecutor(readStarted.resolve, releaseRead.promise),
      new AdmissionClient()
    );
    await readStarted.promise;
    const exclusiveClient: AdmissionClient = new AdmissionClient();
    const exclusive = router.executeAsync(
      createRequest(router, 'exclusive', 'custom-command'),
      createBlockingExecutor(exclusiveStarted.resolve, releaseExclusive.promise),
      exclusiveClient
    );
    const laterClient: AdmissionClient = new AdmissionClient();
    const laterRead = router.executeAsync(
      createRequest(router, 'later-read', 'scan'),
      async (): Promise<IGlobalCommandExecutionResult> => {
        laterReadStarted = true;
        return { exitCode: 0 };
      },
      laterClient
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(exclusiveClient.positions).toEqual([1, 1]);
    expect(laterClient.positions).toEqual([2]);
    releaseRead.resolve();
    await exclusiveStarted.promise;
    expect(laterReadStarted).toBe(false);
    releaseExclusive.resolve();

    await Promise.all([first, exclusive, laterRead]);
    expect(laterReadStarted).toBe(true);
  });

  it('maps no-wait, timeout, and queued cancellation to typed results', async () => {
    jest.useFakeTimers();
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const release = createDeferred();
    const activeStarted = createDeferred();
    const active = router.executeAsync(
      createRequest(router, 'active', 'custom-active'),
      createBlockingExecutor(activeStarted.resolve, release.promise),
      new AdmissionClient()
    );
    await activeStarted.promise;
    const executor: jest.Mock<Promise<IGlobalCommandExecutionResult>, []> = jest.fn(async () => ({
      exitCode: 0
    }));

    const noWaitClient: AdmissionClient = new AdmissionClient();
    const noWait = await router.executeAsync(
      createRequest(router, 'no-wait', 'list', { noWait: true }),
      executor,
      noWaitClient
    );
    const timeoutClient: AdmissionClient = new AdmissionClient();
    const timeoutPromise = router.executeAsync(
      createRequest(router, 'timeout', 'list', { waitTimeoutMs: 10 }),
      executor,
      timeoutClient
    );
    jest.advanceTimersByTime(10);
    const timeout = await timeoutPromise;
    const abortedClient: AdmissionClient = new AdmissionClient();
    const abortedPromise = router.executeAsync(
      createRequest(router, 'aborted', 'list'),
      executor,
      abortedClient
    );
    abortedClient.abortController.abort();
    const aborted = await abortedPromise;

    expect(noWait).toMatchObject({ admissionErrorCode: 'no-wait', outcome: 'failure' });
    expect(timeout).toMatchObject({ admissionErrorCode: 'wait-timeout', outcome: 'failure' });
    expect(aborted).toMatchObject({ admissionErrorCode: 'aborted', outcome: 'aborted' });
    expect(noWaitClient.results).toEqual([noWait]);
    expect(timeoutClient.results).toEqual([timeout]);
    expect(abortedClient.results).toEqual([aborted]);
    expect(executor).not.toHaveBeenCalled();
    release.resolve();
    await active;
    jest.useRealTimers();
  });

  it('cancels queued work on a progress write failure without leaking admission', async () => {
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const release = createDeferred();
    const activeStarted = createDeferred();
    const active = router.executeAsync(
      createRequest(router, 'active', 'custom-active'),
      createBlockingExecutor(activeStarted.resolve, release.promise),
      new AdmissionClient()
    );
    await activeStarted.promise;
    const disconnectedClient: AdmissionClient = new AdmissionClient();
    disconnectedClient.onQueuePositionAsync = () => Promise.reject(new Error('client disconnected'));
    const executor: jest.Mock<Promise<IGlobalCommandExecutionResult>, []> = jest.fn(async () => ({
      exitCode: 0
    }));
    await expect(
      router.executeAsync(
        createRequest(router, 'disconnected', 'list'),
        executor,
        disconnectedClient
      )
    ).rejects.toThrow('client disconnected');
    release.resolve();
    await active;
    await expect(
      router.executeAsync(
        createRequest(router, 'follow-up', 'list'),
        async (): Promise<IGlobalCommandExecutionResult> => ({ exitCode: 0 }),
        new AdmissionClient()
      )
    ).resolves.toMatchObject({ outcome: 'success' });
    expect(executor).not.toHaveBeenCalled();
  });

  it('does not send queue controls to a client that did not negotiate support', async () => {
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const release = createDeferred();
    const activeStarted = createDeferred();
    const active = router.executeAsync(
      createRequest(router, 'active', 'custom-active'),
      createBlockingExecutor(activeStarted.resolve, release.promise),
      new AdmissionClient()
    );
    await activeStarted.promise;
    const legacyClient: AdmissionClient = new AdmissionClient(false);
    const queued = router.executeAsync(
      createRequest(router, 'legacy', 'list'),
      async (): Promise<IGlobalCommandExecutionResult> => ({ exitCode: 0 }),
      legacyClient
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(legacyClient.positions).toEqual([]);
    release.resolve();

    await Promise.all([active, queued]);
  });

  it('accepts a legacy phased request without command origin and fails it closed', async () => {
    const fixture = createRoutingFixture(
      new Map([[TEST_OPERATION, new TestOperationRunner(TEST_OPERATION)]])
    );
    const globalRouter: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(fixture.session);
    const phasedRouter: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const release = createDeferred();
    const activeStarted = createDeferred();
    const active = globalRouter.executeAsync(
      createRequest(globalRouter, 'active-build', 'build'),
      createBlockingExecutor(activeStarted.resolve, release.promise),
      new AdmissionClient()
    );
    await activeStarted.promise;
    const legacyClient: TestPhasedRequestClient = new TestPhasedRequestClient();
    const legacy = phasedRouter.executeAsync(createLegacyPhasedRequest('legacy'), legacyClient);

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(fixture.runners.get(TEST_OPERATION)?.runCount).toBe(0);
    expect(legacyClient.writes.map(({ queuePosition }) => queuePosition?.payload.position)).toContain(
      1
    );
    release.resolve();

    await Promise.all([active, legacy]);
    expect(fixture.runners.get(TEST_OPERATION)?.runCount).toBe(1);
  });

  it('applies no-wait and timeouts to requests admitted after a shared iteration starts', async () => {
    jest.useFakeTimers();
    const graphStarted = createDeferred();
    const releaseGraph = createDeferred();
    const fixture = createRoutingFixture(
      new Map([
        [
          TEST_OPERATION,
          new TestOperationRunner(TEST_OPERATION, undefined, async (): Promise<void> => {
            graphStarted.resolve();
            await releaseGraph.promise;
          })
        ]
      ])
    );
    const globalRouter: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(fixture.session);
    const phasedRouter: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const workspaceStarted = createDeferred();
    const releaseWorkspace = createDeferred();
    const activeGlobal = globalRouter.executeAsync(
      createRequest(globalRouter, 'active-read', 'list'),
      createBlockingExecutor(workspaceStarted.resolve, releaseWorkspace.promise),
      new AdmissionClient()
    );
    await workspaceStarted.promise;

    const firstPhased = phasedRouter.executeAsync(
      createPhasedRequest('first-phased'),
      new TestPhasedRequestClient()
    );
    releaseWorkspace.resolve();
    await jest.advanceTimersByTimeAsync(0);
    await graphStarted.promise;

    const noWaitResult = await phasedRouter.executeAsync(
      createPhasedRequest('no-wait-phased', { noWait: true }),
      new TestPhasedRequestClient()
    );
    expect(noWaitResult).toMatchObject({ admissionErrorCode: 'no-wait', outcome: 'failure' });
    const timeoutClient: TestPhasedRequestClient = new TestPhasedRequestClient();
    const timeoutPhased = phasedRouter.executeAsync(
      createPhasedRequest('timeout-phased', { waitTimeoutMs: 10 }),
      timeoutClient
    );
    await jest.advanceTimersByTimeAsync(10);
    const timeoutResult = await timeoutPhased;
    expect(timeoutResult).toMatchObject({ admissionErrorCode: 'wait-timeout', outcome: 'failure' });
    expect(
      timeoutClient.writes
        .map(({ queuePosition }) => queuePosition?.payload.position)
        .filter((position): position is number => position !== undefined)
    ).toContain(1);
    expect(fixture.runners.get(TEST_OPERATION)?.runCount).toBe(1);

    releaseGraph.resolve();
    await Promise.all([activeGlobal, firstPhased]);
    jest.useRealTimers();
  });

  it('shares admission between global and phased routers while serializing graph execution', async () => {
    const fixture = createRoutingFixture(
      new Map([[TEST_OPERATION, new TestOperationRunner(TEST_OPERATION)]])
    );
    const globalRouter: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(fixture.session);
    const phasedRouter: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const release = createDeferred();
    const globalStarted = createDeferred();
    const global = globalRouter.executeAsync(
      createRequest(globalRouter, 'global', 'custom-exclusive'),
      createBlockingExecutor(globalStarted.resolve, release.promise),
      new AdmissionClient()
    );
    await globalStarted.promise;
    const phasedClient: TestPhasedRequestClient = new TestPhasedRequestClient();
    const phased = phasedRouter.executeAsync(
      createPhasedRequest('phased'),
      phasedClient
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(
      phasedClient.writes.map(({ queuePosition }) => queuePosition?.payload.position)
    ).toContain(1);
    expect(fixture.runners.get(TEST_OPERATION)?.runCount).toBe(0);
    release.resolve();

    await Promise.all([global, phased]);
    expect(fixture.runners.get(TEST_OPERATION)?.runCount).toBe(1);
  });

  it('keeps an exclusive FIFO gate between shared-build batches', async () => {
    const buildStarted = createDeferred();
    const releaseBuild = createDeferred();
    const fixture = createRoutingFixture(
      new Map([
        [
          TEST_OPERATION,
          new TestOperationRunner(TEST_OPERATION, OperationStatus.Success, async (): Promise<void> => {
            buildStarted.resolve();
            await releaseBuild.promise;
          })
        ]
      ])
    );
    const globalRouter: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(fixture.session);
    const phasedRouter: PhasedRequestRouter = new PhasedRequestRouter(fixture.session);
    const firstBuild = phasedRouter.executeAsync(
      {
        commandName: 'build',
        commandOrigin: 'built-in',
        engineShape: TEST_ENGINE_SHAPE,
        environment: {},
        operationSelection: [{ enabledState: true, operationId: TEST_OPERATION }],
        requestId: 'first-build'
      },
      new TestPhasedRequestClient('first-build')
    );
    await buildStarted.promise;

    const exclusiveStarted = createDeferred();
    const releaseExclusive = createDeferred();
    const exclusive = globalRouter.executeAsync(
      createRequest(globalRouter, 'exclusive', 'custom-exclusive'),
      createBlockingExecutor(exclusiveStarted.resolve, releaseExclusive.promise),
      new AdmissionClient()
    );
    let lateBuildSettled: boolean = false;
    const lateBuild = phasedRouter
      .executeAsync(
        {
          commandName: 'build',
          commandOrigin: 'built-in',
          engineShape: TEST_ENGINE_SHAPE,
          environment: {},
          operationSelection: [{ enabledState: true, operationId: TEST_OPERATION }],
          requestId: 'late-build'
        },
        new TestPhasedRequestClient('late-build')
      )
      .then((result) => {
        lateBuildSettled = true;
        return result;
      });

    releaseBuild.resolve();
    await exclusiveStarted.promise;
    expect(lateBuildSettled).toBe(false);
    releaseExclusive.resolve();

    await Promise.all([firstBuild, exclusive, lateBuild]);
    expect(lateBuildSettled).toBe(true);
  });

  it('holds an exclusive lease until cleanup and final-result output settle', async () => {
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const releaseResult = createDeferred();
    const resultWriteStarted = createDeferred();
    const firstClient: AdmissionClient = new AdmissionClient();
    firstClient.onResultAsync = async (): Promise<void> => {
      resultWriteStarted.resolve();
      await releaseResult.promise;
    };
    const first = router.executeAsync(
      createRequest(router, 'first', 'custom-exclusive'),
      async (context: IGlobalCommandExecutionContext): Promise<IGlobalCommandExecutionResult> => {
        context.registerDisposable({
          [Symbol.asyncDispose]: async (): Promise<void> => undefined
        });
        return { exitCode: 0 };
      },
      firstClient
    );
    await resultWriteStarted.promise;
    let secondStarted: boolean = false;
    const second = router.executeAsync(
      createRequest(router, 'second', 'list'),
      async (): Promise<IGlobalCommandExecutionResult> => {
        secondStarted = true;
        return { exitCode: 0 };
      },
      new AdmissionClient()
    );
    await Promise.resolve();
    expect(secondStarted).toBe(false);
    releaseResult.resolve();

    await Promise.all([first, second]);
    expect(secondStarted).toBe(true);
  });

  it('releases admission after a final-result write failure', async () => {
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const firstClient: AdmissionClient = new AdmissionClient();
    firstClient.onResultAsync = () => Promise.reject(new Error('result output failed'));

    await expect(
      router.executeAsync(
        createRequest(router, 'first', 'custom-exclusive'),
        async (): Promise<IGlobalCommandExecutionResult> => ({ exitCode: 0 }),
        firstClient
      )
    ).rejects.toThrow('result output failed');
    await expect(
      router.executeAsync(
        createRequest(router, 'second', 'list'),
        async (): Promise<IGlobalCommandExecutionResult> => ({ exitCode: 0 }),
        new AdmissionClient()
      )
    ).resolves.toMatchObject({ outcome: 'success' });
  });

  it('releases admission after raw-mode restoration fails', async () => {
    const router: GlobalCommandRequestRouter = new GlobalCommandRequestRouter(
      new TestWorkspaceSession(TEST_REPO_ROOT)
    );
    const client: AdmissionClient = new AdmissionClient();
    const inputRouter: InteractiveRequestInputRouter = new InteractiveRequestInputRouter();
    client.interactiveSession = inputRouter.register({
      acceptsStdin: true,
      client: {
        abortSignal: client.abortSignal,
        writeRawModeControlAsync: ({ payload }): Promise<void> =>
          payload.enabled ? Promise.resolve() : Promise.reject(new Error('raw restore failed'))
      },
      onFailure: () => undefined,
      requestId: 'raw-failure'
    });
    const request: IResolvedGlobalCommandRequest = router.resolveRequest({
      commandName: 'custom-exclusive',
      commandOrigin: 'custom',
      cwd: TEST_CWD,
      environment: {},
      requestId: 'raw-failure',
      terminal: { acceptsStdin: true, columns: 80, isTTY: true, supportsColor: true }
    });

    await expect(
      router.executeAsync(
        request,
        async (context: IGlobalCommandExecutionContext): Promise<IGlobalCommandExecutionResult> => {
          await context.interactiveInput?.setRawModeAsync(true);
          return { exitCode: 0 };
        },
        client
      )
    ).resolves.toMatchObject({ errorMessage: 'raw restore failed', outcome: 'failure' });
    await expect(
      router.executeAsync(
        createRequest(router, 'follow-up', 'list'),
        async (): Promise<IGlobalCommandExecutionResult> => ({ exitCode: 0 }),
        new AdmissionClient()
      )
    ).resolves.toMatchObject({ outcome: 'success' });
  });
});
