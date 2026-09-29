// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { OperationStatus } from '@microsoft/rush-lib';
import type { IPhasedCommandEngineRequestSettings } from '@microsoft/rush-lib';
import { DaemonFrameType, decodeDaemonControlMessage } from '@rushstack/rush-daemon-protocol';
import type {
  DaemonControlMessage,
  IDaemonFrame,
  IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';
import type { ITerminal } from '@rushstack/terminal';

import type { GlobalCommandExecutor, IDaemonRequestResolver } from '../index';
import { DaemonRequestDispatchError } from '../DaemonRequestDispatcher';
import { DaemonShutdownError, getDaemonShutdownReason } from '../DaemonShutdownError';
import { DaemonWireRequestClient } from '../DaemonWireRequestClient';
import { RushDaemonHost } from '../RushDaemonHost';
import type { IRushDaemonHostOptions } from '../RushDaemonHost';
import { TestWorkspaceSession } from './TestWorkspaceSession';
import {
  TEST_ENGINE_SHAPE,
  TestOperationRunner,
  createRoutingFixture
} from './PhasedRequestRouterTestUtilities';
import type { ITestRoutingFixture } from './PhasedRequestRouterTestUtilities';
import {
  CallbackDaemonRequestResolver,
  DaemonRequestWireClient,
  createDeferred,
  createWireEnvelope
} from './DaemonRequestWireTestUtilities';
import type { IDeferred, ITerminalExchange } from './DaemonRequestWireTestUtilities';

const DAEMON_VERSION: string = 'wire-test';
const RUSH_VERSION: string = '5.178.1';
const OPERATION_A: string = 'project-a (_phase:test)';
/** How long a test gives the daemon to do what it must not do yet. */
const SETTLE_MS: number = 50;
const testRepoRoots: Set<string> = new Set();

afterEach(() => {
  for (const repoRoot of testRepoRoots) fs.rmSync(repoRoot, { force: true, recursive: true });
  testRepoRoots.clear();
});

function createRepoRoot(): string {
  const repoRoot: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-wire-started-'));
  testRepoRoots.add(repoRoot);
  return repoRoot;
}

async function startGlobalHostAsync(
  repoRoot: string,
  executorFor: (requestId: string) => GlobalCommandExecutor
): Promise<RushDaemonHost> {
  const resolver: IDaemonRequestResolver = new CallbackDaemonRequestResolver(async ({ envelope }) => ({
    executor: executorFor(envelope.requestId),
    kind: 'global'
  }));
  return await startHostAsync(repoRoot, resolver);
}

async function startHostAsync(repoRoot: string, resolver: IDaemonRequestResolver): Promise<RushDaemonHost> {
  const options: IRushDaemonHostOptions = {
    createWorkspaceSessionAsync: () => Promise.resolve(new TestWorkspaceSession(repoRoot)),
    daemonVersion: DAEMON_VERSION,
    repoRoot,
    requestResolver: resolver,
    rushVersion: RUSH_VERSION
  };
  return await RushDaemonHost.startAsync(options);
}

async function connectAsync(
  host: RushDaemonHost,
  supportsRequestStarted: boolean | undefined
): Promise<DaemonRequestWireClient> {
  const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(host.paths.socketPath);
  await client.handshakeAsync(supportsRequestStarted === undefined ? {} : { supportsRequestStarted });
  return client;
}

async function startAsync(
  client: DaemonRequestWireClient,
  envelope: IDaemonRequestEnvelope
): Promise<ITerminalExchange> {
  await client.sendControlAsync({ kind: 'requestStart', payload: envelope });
  return await client.readTerminalAsync(envelope.requestId);
}

/** Each frame of the exchange as a control message kind, or as `output` for a log or event frame. */
function describeFrames(frames: ReadonlyArray<IDaemonFrame>): string[] {
  return frames.map((frame: IDaemonFrame) =>
    frame.kind === DaemonFrameType.controlJson ? decodeDaemonControlMessage(frame.payload).kind : 'output'
  );
}

function findStarted(frames: ReadonlyArray<IDaemonFrame>): DaemonControlMessage[] {
  return frames
    .filter((frame: IDaemonFrame) => frame.kind === DaemonFrameType.controlJson)
    .map((frame: IDaemonFrame) => decodeDaemonControlMessage(frame.payload))
    .filter((message: DaemonControlMessage) => message.kind === 'requestStarted');
}

/**
 * Makes the daemon's requestStarted writes wait for `release` before they write, and records in `order` when each
 * write starts and ends.
 */
function holdRequestStartedWrites(
  order: string[],
  writeStarted: IDeferred<void>,
  release: Promise<void>
): jest.SpyInstance {
  const writeAsync: () => Promise<void> = DaemonWireRequestClient.prototype.writeRequestStartedAsync;
  return jest
    .spyOn(DaemonWireRequestClient.prototype, 'writeRequestStartedAsync')
    .mockImplementation(async function (this: DaemonWireRequestClient): Promise<void> {
      order.push('write');
      writeStarted.resolve();
      await release;
      await writeAsync.call(this);
      order.push('written');
    });
}

async function settleAsync(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, SETTLE_MS));
}

describe('requestStarted', () => {
  it('tells a client that asked for it when a global command starts, once and before its output', async () => {
    const repoRoot: string = createRepoRoot();
    const host: RushDaemonHost = await startGlobalHostAsync(repoRoot, () => async (context) => {
      context.terminal.write('first');
      context.terminal.write('second');
      return { exitCode: 0 };
    });
    const client: DaemonRequestWireClient = await connectAsync(host, true);
    try {
      const exchange: ITerminalExchange = await startAsync(
        client,
        createWireEnvelope('global', 'custom', repoRoot)
      );
      expect(findStarted(exchange.frames)).toEqual([
        { kind: 'requestStarted', payload: { requestId: 'global' } }
      ]);
      const kinds: string[] = describeFrames(exchange.frames);
      expect(kinds.indexOf('output')).toBeGreaterThan(kinds.indexOf('requestStarted'));
      expect(exchange.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
    } finally {
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it.each([false, undefined])(
    'tells a client whose subscribe has supportsRequestStarted %s nothing',
    async (supportsRequestStarted: boolean | undefined) => {
      const repoRoot: string = createRepoRoot();
      const host: RushDaemonHost = await startGlobalHostAsync(repoRoot, () => async (context) => {
        context.terminal.write('output');
        return { exitCode: 0 };
      });
      const client: DaemonRequestWireClient = await connectAsync(host, supportsRequestStarted);
      try {
        const exchange: ITerminalExchange = await startAsync(
          client,
          createWireEnvelope('global', 'custom', repoRoot)
        );
        expect(describeFrames(exchange.frames)).not.toContain('requestStarted');
        expect(exchange.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      } finally {
        await client.closeAsync();
        await host.closeAsync();
      }
    }
  );

  it('tells a queued request only once the request ahead of it finishes and it starts', async () => {
    const repoRoot: string = createRepoRoot();
    const holderStarted: IDeferred<void> = createDeferred<void>();
    const releaseHolder: IDeferred<void> = createDeferred<void>();
    const host: RushDaemonHost = await startGlobalHostAsync(repoRoot, (requestId: string) => async () => {
      if (requestId === 'holder') {
        holderStarted.resolve();
        await releaseHolder.promise;
      }
      return { exitCode: 0 };
    });
    const holder: DaemonRequestWireClient = await connectAsync(host, true);
    const queued: DaemonRequestWireClient = await connectAsync(host, true);
    try {
      await holder.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('holder', 'custom', repoRoot)
      });
      await holderStarted.promise;
      await queued.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('queued', 'custom', repoRoot)
      });
      expect(await queued.readControlAsync()).toMatchObject({
        kind: 'queuePosition',
        payload: { requestId: 'queued' }
      });
      // The daemon answers in order, so a requestStarted that it had sent would arrive before the pong.
      await queued.sendControlAsync({ kind: 'ping', payload: {} });
      expect((await queued.readControlAsync()).kind).toBe('pong');
      releaseHolder.resolve();
      const holderExchange: ITerminalExchange = await holder.readTerminalAsync('holder');
      expect(findStarted(holderExchange.frames)).toEqual([
        { kind: 'requestStarted', payload: { requestId: 'holder' } }
      ]);
      const exchange: ITerminalExchange = await queued.readTerminalAsync('queued');
      expect(findStarted(exchange.frames)).toEqual([
        { kind: 'requestStarted', payload: { requestId: 'queued' } }
      ]);
      expect(exchange.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
    } finally {
      releaseHolder.resolve();
      await Promise.all([holder.closeAsync(), queued.closeAsync()]);
      await host.closeAsync();
    }
  });

  it('tells a request whose resolver had not returned at shutdown that it did not start', async () => {
    const repoRoot: string = createRepoRoot();
    const resolving: IDeferred<void> = createDeferred<void>();
    // Like ProductionDaemonRequestResolver, it stops when its request is aborted and reports the shutdown's reason.
    const resolver: IDaemonRequestResolver = new CallbackDaemonRequestResolver(async ({ abortSignal }) => {
      await new Promise<void>((resolve) => {
        abortSignal.addEventListener('abort', () => resolve(), { once: true });
        resolving.resolve();
      });
      const reason: DaemonShutdownError | undefined = getDaemonShutdownReason(abortSignal);
      throw new DaemonRequestDispatchError(
        'routingFailed',
        reason?.message ?? 'The request was not shut down.'
      );
    });
    const host: RushDaemonHost = await startHostAsync(repoRoot, resolver);
    const client: DaemonRequestWireClient = await connectAsync(host, true);
    try {
      await client.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('resolving', 'custom', repoRoot)
      });
      await resolving.promise;
      const closePromise: Promise<void> = host.closeAsync(
        new DaemonShutdownError({ initiator: 'signal', signal: 'SIGTERM' })
      );
      const exchange: ITerminalExchange = await client.readTerminalAsync('resolving');
      expect(findStarted(exchange.frames)).toEqual([]);
      expect(exchange.terminal).toEqual({
        kind: 'requestRejected',
        payload: {
          code: 'routingFailed',
          message:
            'The Rush daemon was shut down (the daemon process received SIGTERM) while this request was ' +
            'queued; it did not start. Re-run the command.',
          requestId: 'resolving'
        }
      });
      await closePromise;
    } finally {
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('tells a request queued for admission that it did not start, and sends it no requestStarted', async () => {
    const repoRoot: string = createRepoRoot();
    const holderStarted: IDeferred<void> = createDeferred<void>();
    const releaseHolder: IDeferred<void> = createDeferred<void>();
    const host: RushDaemonHost = await startGlobalHostAsync(repoRoot, (requestId: string) => async () => {
      if (requestId === 'holder') {
        holderStarted.resolve();
        await releaseHolder.promise;
      }
      return { exitCode: 0 };
    });
    const holder: DaemonRequestWireClient = await connectAsync(host, true);
    const queued: DaemonRequestWireClient = await connectAsync(host, true);
    try {
      await holder.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('holder', 'custom', repoRoot)
      });
      await holderStarted.promise;
      await queued.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('queued', 'custom', repoRoot)
      });
      expect(await queued.readControlAsync()).toMatchObject({
        kind: 'queuePosition',
        payload: { requestId: 'queued' }
      });
      const closePromise: Promise<void> = host.closeAsync(
        new DaemonShutdownError({ initiator: 'controlClient' })
      );
      releaseHolder.resolve();
      const exchange: ITerminalExchange = await queued.readTerminalAsync('queued');
      expect(findStarted(exchange.frames)).toEqual([]);
      expect(exchange.terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          aborted: true,
          errorMessage:
            'The Rush daemon was shut down (requested by "rush-client daemon stop" or "daemon restart") ' +
            'while this request was queued; it did not start. Re-run the command.',
          requestId: 'queued'
        }
      });
      await closePromise;
    } finally {
      releaseHolder.resolve();
      await Promise.all([holder.closeAsync(), queued.closeAsync()]);
      await host.closeAsync();
    }
  });

  it('tells a request that got requestStarted that it was running when the daemon shut down', async () => {
    const repoRoot: string = createRepoRoot();
    const started: IDeferred<void> = createDeferred<void>();
    const release: IDeferred<void> = createDeferred<void>();
    const host: RushDaemonHost = await startGlobalHostAsync(repoRoot, () => async () => {
      started.resolve();
      await release.promise;
      return { exitCode: 0 };
    });
    const client: DaemonRequestWireClient = await connectAsync(host, true);
    try {
      await client.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('started', 'custom', repoRoot)
      });
      await started.promise;
      const closePromise: Promise<void> = host.closeAsync(
        new DaemonShutdownError({ initiator: 'controlClient' })
      );
      release.resolve();
      const exchange: ITerminalExchange = await client.readTerminalAsync('started');
      expect(findStarted(exchange.frames)).toEqual([
        { kind: 'requestStarted', payload: { requestId: 'started' } }
      ]);
      expect(exchange.terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          aborted: true,
          errorMessage:
            'The Rush daemon was shut down (requested by "rush-client daemon stop" or "daemon restart") ' +
            'while this request was running; re-run the command.',
          requestId: 'started'
        }
      });
      await closePromise;
    } finally {
      release.resolve();
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('tells a client when a phased request starts, before the events and output of its operations', async () => {
    const repoRoot: string = createRepoRoot();
    const fixture: ITestRoutingFixture = createRoutingFixture(
      new Map([
        [
          OPERATION_A,
          new TestOperationRunner(OPERATION_A, OperationStatus.Success, async (terminal: ITerminal) =>
            terminal.writeLine('operation-output')
          )
        ]
      ])
    );
    const resolver: IDaemonRequestResolver = new CallbackDaemonRequestResolver(async ({ envelope }) => ({
      kind: 'phased',
      request: {
        commandName: envelope.commandName,
        commandOrigin: envelope.commandOrigin,
        engineShape: TEST_ENGINE_SHAPE,
        environment: envelope.environment,
        operationSelection: [{ enabledState: true, operationId: OPERATION_A }],
        requestId: envelope.requestId
      }
    }));
    const host: RushDaemonHost = await RushDaemonHost.startAsync({
      createWorkspaceSessionAsync: () => Promise.resolve(fixture.session),
      daemonVersion: DAEMON_VERSION,
      repoRoot,
      requestResolver: resolver,
      rushVersion: RUSH_VERSION
    });
    const client: DaemonRequestWireClient = await connectAsync(host, true);
    try {
      const exchange: ITerminalExchange = await startAsync(
        client,
        createWireEnvelope('phased', 'build', repoRoot, {
          argv: ['build', OPERATION_A],
          commandOrigin: 'built-in'
        })
      );
      expect(exchange.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
      expect(findStarted(exchange.frames)).toEqual([
        { kind: 'requestStarted', payload: { requestId: 'phased' } }
      ]);
      const kinds: string[] = describeFrames(exchange.frames);
      expect(kinds).toContain('output');
      expect(kinds.indexOf('output')).toBeGreaterThan(kinds.indexOf('requestStarted'));
    } finally {
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('runs a global command only once its requestStarted frame is written', async () => {
    const repoRoot: string = createRepoRoot();
    const order: string[] = [];
    const writeStarted: IDeferred<void> = createDeferred<void>();
    const release: IDeferred<void> = createDeferred<void>();
    const spy: jest.SpyInstance = holdRequestStartedWrites(order, writeStarted, release.promise);
    const host: RushDaemonHost = await startGlobalHostAsync(repoRoot, () => async () => {
      order.push('executor');
      return { exitCode: 0 };
    });
    const client: DaemonRequestWireClient = await connectAsync(host, true);
    try {
      const exchangePromise: Promise<ITerminalExchange> = startAsync(
        client,
        createWireEnvelope('global', 'custom', repoRoot)
      );
      // A failed expectation closes the connection before the exchange is awaited.
      exchangePromise.catch(() => undefined);
      await writeStarted.promise;
      await settleAsync();
      expect(order).toEqual(['write']);
      release.resolve();
      const exchange: ITerminalExchange = await exchangePromise;
      expect(order).toEqual(['write', 'written', 'executor']);
      expect(findStarted(exchange.frames)).toHaveLength(1);
      expect(exchange.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
    } finally {
      release.resolve();
      spy.mockRestore();
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('tells a phased request after its batch reconciles, and runs it only once the frame is written', async () => {
    const repoRoot: string = createRepoRoot();
    const order: string[] = [];
    const writeStarted: IDeferred<void> = createDeferred<void>();
    const release: IDeferred<void> = createDeferred<void>();
    const runner: TestOperationRunner = new TestOperationRunner(
      OPERATION_A,
      OperationStatus.Success,
      async () => {
        order.push('operation');
      }
    );
    const fixture: ITestRoutingFixture = createRoutingFixture(new Map([[OPERATION_A, runner]]));
    fixture.session.onReconcileAsync = async (): Promise<void> => {
      order.push('reconcile');
    };
    // A rebuild closes the runners before it schedules, which must also wait for the frame.
    const rebuildSettings: IPhasedCommandEngineRequestSettings = {
      isIncrementalBuildAllowed: false,
      parallelism: 1,
      quietMode: true
    };
    const resolver: IDaemonRequestResolver = new CallbackDaemonRequestResolver(async ({ envelope }) => ({
      kind: 'phased',
      request: {
        commandName: envelope.commandName,
        commandOrigin: envelope.commandOrigin,
        engineShape: TEST_ENGINE_SHAPE,
        environment: envelope.environment,
        operationSelection: [{ enabledState: true, operationId: OPERATION_A }],
        requestId: envelope.requestId
      },
      requestSettings: rebuildSettings
    }));
    const spy: jest.SpyInstance = holdRequestStartedWrites(order, writeStarted, release.promise);
    const host: RushDaemonHost = await RushDaemonHost.startAsync({
      createWorkspaceSessionAsync: () => Promise.resolve(fixture.session),
      daemonVersion: DAEMON_VERSION,
      repoRoot,
      requestResolver: resolver,
      rushVersion: RUSH_VERSION
    });
    const client: DaemonRequestWireClient = await connectAsync(host, true);
    try {
      const exchangePromise: Promise<ITerminalExchange> = startAsync(
        client,
        createWireEnvelope('phased', 'build', repoRoot, {
          argv: ['build', OPERATION_A],
          commandOrigin: 'built-in'
        })
      );
      // A failed expectation closes the connection before the exchange is awaited.
      exchangePromise.catch(() => undefined);
      await writeStarted.promise;
      await settleAsync();
      expect(order).toEqual(['reconcile', 'write']);
      expect(runner.closeCount).toBe(0);
      release.resolve();
      const exchange: ITerminalExchange = await exchangePromise;
      expect(order).toEqual(['reconcile', 'write', 'written', 'operation']);
      expect(runner.closeCount).toBeGreaterThan(0);
      expect(findStarted(exchange.frames)).toHaveLength(1);
      expect(exchange.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, scheduled: true }
      });
    } finally {
      release.resolve();
      spy.mockRestore();
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('rejects a requestStarted that a client sends as a protocol error', async () => {
    const repoRoot: string = createRepoRoot();
    const host: RushDaemonHost = await startGlobalHostAsync(repoRoot, () => async () => ({ exitCode: 0 }));
    const client: DaemonRequestWireClient = await connectAsync(host, true);
    try {
      await client.sendControlAsync({ kind: 'requestStarted', payload: { requestId: 'client-sent' } });
      expect(await client.readControlAsync()).toMatchObject({
        kind: 'error',
        payload: { code: 'malformedControlMessage' }
      });
    } finally {
      await client.closeAsync();
      await host.closeAsync();
    }
  });
});
