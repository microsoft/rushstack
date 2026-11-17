// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { OperationStatus } from '@microsoft/rush-lib';
import {
  DAEMON_PROTOCOL_VERSION,
  DaemonFrameType,
  createDaemonHello,
  decodeDaemonControlMessage,
  decodeDaemonEventFrame,
  decodeDaemonLogChunk
} from '@rushstack/rush-daemon-protocol';
import type {
  DaemonControlMessage,
  IDaemonFrame,
  IDaemonPhasedRequest,
  IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';
import { DaemonFrameConnection } from '@rushstack/rush-daemon-transport';
import type { ITerminal } from '@rushstack/terminal';

import { ConnectingClientTracker } from '../ConnectingClientTracker';
import type { IConnectingClient } from '../ConnectingClientTracker';
import type { IDaemonRequestResolver } from '../DaemonRequestDispatcher';
import { RushDaemonHost } from '../RushDaemonHost';
import type { IRushDaemonHostOptions } from '../RushDaemonHost';
import { WorkspaceEngineRecreationRequiredError } from '../WorkspaceEngineComponentFactory';
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

const OPERATION_A: string = 'project-a (_phase:test)';
const OPERATION_B: string = 'project-b (_phase:test)';
const OPERATION_C: string = 'project-c (_phase:test)';
const DAEMON_VERSION: string = 'wire-test';
const RUSH_VERSION: string = '5.178.1';
const testRepoRoots: Set<string> = new Set();

afterEach(() => {
  for (const repoRoot of testRepoRoots) fs.rmSync(repoRoot, { force: true, recursive: true });
  testRepoRoots.clear();
});

function createRepoRoot(): string {
  const repoRoot: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-wire-phased-'));
  testRepoRoots.add(repoRoot);
  return repoRoot;
}

function createResolver(): IDaemonRequestResolver {
  return new CallbackDaemonRequestResolver(async ({ envelope }) => ({
    kind: 'phased',
    request: createPhasedRequest(envelope)
  }));
}

function createPhasedRequest(envelope: IDaemonRequestEnvelope): IDaemonPhasedRequest {
  return {
    admission: envelope.admission,
    acceptsStdin: envelope.terminal.acceptsStdin,
    commandName: envelope.commandName,
    commandOrigin: envelope.commandOrigin,
    engineShape: TEST_ENGINE_SHAPE,
    environment: envelope.environment,
    operationSelection: envelope.argv.slice(1).map((operationId: string) => ({
      enabledState: true,
      operationId
    })),
    requestId: envelope.requestId,
    terminalRequirement: envelope.terminal.terminalRequirement
  };
}

async function startHostAsync(
  repoRoot: string,
  fixture: ITestRoutingFixture,
  resolver: IDaemonRequestResolver = createResolver()
): Promise<RushDaemonHost> {
  const options: IRushDaemonHostOptions = {
    createWorkspaceSessionAsync: () => Promise.resolve(fixture.session),
    daemonVersion: DAEMON_VERSION,
    repoRoot,
    requestResolver: resolver,
    rushVersion: RUSH_VERSION
  };
  return await RushDaemonHost.startAsync(options);
}

async function connectAsync(host: RushDaemonHost): Promise<DaemonRequestWireClient> {
  const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(host.paths.socketPath);
  await client.handshakeAsync();
  return client;
}

async function startAsync(
  client: DaemonRequestWireClient,
  envelope: IDaemonRequestEnvelope
): Promise<ITerminalExchange> {
  await client.sendControlAsync({ kind: 'requestStart', payload: envelope });
  return await client.readTerminalAsync(envelope.requestId);
}

function phasedEnvelope(
  repoRoot: string,
  requestId: string,
  ...operations: ReadonlyArray<string>
): IDaemonRequestEnvelope {
  return createWireEnvelope(requestId, 'build', repoRoot, {
    argv: ['build', ...operations],
    commandOrigin: 'built-in'
  });
}

describe('daemon phased request wire integration', () => {
  it('streams a selected subtree, preserves warning and failure exits, and reuses a warm no-op graph', async () => {
    const repoRoot: string = createRepoRoot();
    const fixture: ITestRoutingFixture = createRoutingFixture(
      new Map([
        [
          OPERATION_A,
          new TestOperationRunner(
            OPERATION_A,
            OperationStatus.SuccessWithWarning,
            async (terminal: ITerminal) => terminal.writeLine('warning-output')
          )
        ],
        [OPERATION_B, new TestOperationRunner(OPERATION_B)],
        [OPERATION_C, new TestOperationRunner(OPERATION_C, OperationStatus.Failure)]
      ]),
      [[OPERATION_B, OPERATION_A]]
    );
    let iteration: number = 0;
    fixture.graph.hooks.configureIteration.tap('warm no-op', (records, previousResults) => {
      if (iteration++ === 0) return;
      for (const record of records.values()) {
        if (previousResults.has(record.operation)) record.enabled = false;
      }
    });
    const host: RushDaemonHost = await startHostAsync(repoRoot, fixture);
    const client: DaemonRequestWireClient = await connectAsync(host);
    try {
      const first: ITerminalExchange = await startAsync(client, {
        ...phasedEnvelope(repoRoot, 'subtree', OPERATION_B),
        environment: { RUSH_ALLOW_WARNINGS_IN_SUCCESSFUL_BUILD: '1' }
      });
      expect(first.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, outcome: 'success-with-warning', scheduled: true }
      });
      expect(readOperationIds(first)).toEqual(new Set([OPERATION_A, OPERATION_B]));
      expect(readLogText(first)).toContain('warning-output');
      const warm: ITerminalExchange = await startAsync(client, {
        ...phasedEnvelope(repoRoot, 'warm', OPERATION_B),
        environment: { RUSH_ALLOW_WARNINGS_IN_SUCCESSFUL_BUILD: '1' }
      });
      expect(warm.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { scheduled: false }
      });
      const failure: ITerminalExchange = await startAsync(
        client,
        phasedEnvelope(repoRoot, 'failure', OPERATION_C)
      );
      expect(failure.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, outcome: 'failure' }
      });
    } finally {
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('merges two connections into one shared iteration with subset-specific results', async () => {
    const repoRoot: string = createRepoRoot();
    const fixture: ITestRoutingFixture = createRoutingFixture(
      new Map([
        [OPERATION_A, new TestOperationRunner(OPERATION_A)],
        [OPERATION_B, new TestOperationRunner(OPERATION_B)],
        [OPERATION_C, new TestOperationRunner(OPERATION_C, OperationStatus.Failure)]
      ]),
      [[OPERATION_B, OPERATION_A]]
    );
    const scheduleSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'scheduleIterationAsync');
    const host: RushDaemonHost = await startHostAsync(repoRoot, fixture);
    const clients: ReadonlyArray<DaemonRequestWireClient> = [
      await connectAsync(host),
      await connectAsync(host)
    ];
    try {
      const exchanges: ReadonlyArray<ITerminalExchange> = await Promise.all([
        startAsync(clients[0], phasedEnvelope(repoRoot, 'passing', OPERATION_B)),
        startAsync(clients[1], phasedEnvelope(repoRoot, 'failing', OPERATION_C))
      ]);
      expect(scheduleSpy).toHaveBeenCalledTimes(1);
      expect(exchanges[0].terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0, outcome: 'success' }
      });
      expect(exchanges[1].terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, outcome: 'failure' }
      });
      expect(readOperationIds(exchanges[0])).toEqual(new Set([OPERATION_A, OPERATION_B]));
      expect(readOperationIds(exchanges[1])).toEqual(new Set([OPERATION_C]));
    } finally {
      await Promise.all(clients.map((client: DaemonRequestWireClient) => client.closeAsync()));
      await host.closeAsync();
    }
  });

  it('lets a client that connected while the daemon was busy send a request that joins the batch', async () => {
    const repoRoot: string = createRepoRoot();
    const fixture: ITestRoutingFixture = createRoutingFixture(
      new Map([
        [OPERATION_A, new TestOperationRunner(OPERATION_A)],
        [OPERATION_C, new TestOperationRunner(OPERATION_C)]
      ])
    );
    const leaseRequested: IDeferred<void> = createDeferred<void>();
    const grantLease: IDeferred<void> = createDeferred<void>();
    fixture.session.acquireExecutionLeaseAsync = async (): Promise<AsyncDisposable> => {
      leaseRequested.resolve();
      await grantLease.promise;
      return { [Symbol.asyncDispose]: async (): Promise<void> => undefined };
    };
    const reconcileStarted: IDeferred<void> = createDeferred<void>();
    const lateRequestResolved: IDeferred<void> = createDeferred<void>();
    let reconcileCount: number = 0;
    fixture.session.onReconcileAsync = async (): Promise<void> => {
      if (reconcileCount++ === 0) {
        reconcileStarted.resolve();
        // Like a slower reconcile, this one lets the late request reach the router before it ends.
        await lateRequestResolved.promise;
        await settleAsync();
      }
    };
    const scheduleSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'scheduleIterationAsync');
    const resolver: IDaemonRequestResolver = new CallbackDaemonRequestResolver(async ({ envelope }) => {
      if (envelope.requestId === 'late') {
        // Like a slower resolver, this one reaches the router after the reconcile started. The request still joins,
        // because the daemon received it before then.
        await reconcileStarted.promise;
        lateRequestResolved.resolve();
      }
      return { kind: 'phased', request: createPhasedRequest(envelope) };
    });
    const host: RushDaemonHost = await startHostAsync(repoRoot, fixture, resolver);
    const clients: DaemonRequestWireClient[] = [await connectAsync(host)];
    try {
      const early: Promise<ITerminalExchange> = startAsync(
        clients[0],
        phasedEnvelope(repoRoot, 'early', OPERATION_A)
      );
      await leaseRequested.promise;
      // The late client connects, then takes a while before its handshake, as when the daemon replies slowly.
      clients.push(await DaemonRequestWireClient.connectAsync(host.paths.socketPath));
      await sleepAsync(150);
      await clients[1].handshakeAsync();
      grantLease.resolve();
      await settleAsync();
      const late: ITerminalExchange = await startAsync(
        clients[1],
        phasedEnvelope(repoRoot, 'late', OPERATION_C)
      );

      for (const exchange of [await early, late]) {
        expect(exchange.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      }
      expect(scheduleSpy).toHaveBeenCalledTimes(1);
    } finally {
      await Promise.all(clients.map((client: DaemonRequestWireClient) => client.closeAsync()));
      await host.closeAsync();
    }
  });

  it('counts a connection as connecting until it sends its first request or closes', async () => {
    const addSpy: jest.SpyInstance = jest.spyOn(ConnectingClientTracker.prototype, 'add');
    const repoRoot: string = createRepoRoot();
    const fixture: ITestRoutingFixture = createRoutingFixture(
      new Map([[OPERATION_A, new TestOperationRunner(OPERATION_A)]])
    );
    const leaseRequested: IDeferred<void> = createDeferred<void>();
    const grantLease: IDeferred<void> = createDeferred<void>();
    fixture.session.acquireExecutionLeaseAsync = async (): Promise<AsyncDisposable> => {
      leaseRequested.resolve();
      await grantLease.promise;
      return { [Symbol.asyncDispose]: async (): Promise<void> => undefined };
    };
    const host: RushDaemonHost = await startHostAsync(repoRoot, fixture);
    const clients: DaemonRequestWireClient[] = [];
    try {
      clients.push(await connectAsync(host));
      const tracker: ConnectingClientTracker = addSpy.mock.contexts[0] as ConnectingClientTracker;
      expect(await isWaitingAsync(tracker)).toBe(true);
      const exchange: Promise<ITerminalExchange> = startAsync(
        clients[0],
        phasedEnvelope(repoRoot, 'request', OPERATION_A)
      );
      // The request's own batch must not wait for the connection that sent it.
      await leaseRequested.promise;
      expect(await isWaitingAsync(tracker)).toBe(false);
      grantLease.resolve();
      expect((await exchange).terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect(await isWaitingAsync(tracker)).toBe(false);

      clients.push(await connectAsync(host));
      expect(await isWaitingAsync(tracker)).toBe(true);
      await clients[1].closeAsync();
      await clients[1].closed;
      expect(await isWaitingAsync(tracker)).toBe(false);
      expect(addSpy).toHaveBeenCalledTimes(2);
    } finally {
      addSpy.mockRestore();
      await Promise.all(clients.map((client: DaemonRequestWireClient) => client.closeAsync()));
      await host.closeAsync();
    }
  });

  it('counts a connection as connecting again once the daemon finishes writing a reply that waited', async () => {
    let nowMs: number = 0;
    const clockSpy: jest.SpyInstance = jest.spyOn(performance, 'now').mockImplementation(() => nowMs);
    const helloWritten: IDeferred<void> = createDeferred<void>();
    const pongWriting: IDeferred<void> = createDeferred<void>();
    const finishPongWrite: IDeferred<void> = createDeferred<void>();
    const pongWritten: IDeferred<void> = createDeferred<void>();
    const add: () => IConnectingClient = ConnectingClientTracker.prototype.add;
    const addSpy: jest.SpyInstance = jest
      .spyOn(ConnectingClientTracker.prototype, 'add')
      .mockImplementation(function (this: ConnectingClientTracker): IConnectingClient {
        const client: IConnectingClient = add.call(this);
        const touch: () => void = client.touch;
        let activityCount: number = 0;
        client.touch = (): void => {
          touch();
          // Each exchange records the received frame, then the completed reply.
          if (++activityCount === 2) helloWritten.resolve();
          if (activityCount === 4) pongWritten.resolve();
        };
        return client;
      });
    const sendFrameAsync: (frame: IDaemonFrame) => Promise<void> =
      DaemonFrameConnection.prototype.sendFrameAsync;
    const sendSpy: jest.SpyInstance = jest
      .spyOn(DaemonFrameConnection.prototype, 'sendFrameAsync')
      .mockImplementation(async function (this: DaemonFrameConnection, frame: IDaemonFrame): Promise<void> {
        if (
          frame.kind === DaemonFrameType.controlJson &&
          decodeDaemonControlMessage(frame.payload).kind === 'pong'
        ) {
          pongWriting.resolve();
          await finishPongWrite.promise;
        }
        await sendFrameAsync.call(this, frame);
      });
    const repoRoot: string = createRepoRoot();
    const fixture: ITestRoutingFixture = createRoutingFixture(
      new Map([[OPERATION_A, new TestOperationRunner(OPERATION_A)]])
    );
    const host: RushDaemonHost = await startHostAsync(repoRoot, fixture);
    const clients: DaemonRequestWireClient[] = [];
    try {
      const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(
        host.paths.socketPath
      );
      clients.push(client);
      await client.sendControlAsync(createDaemonHello(DAEMON_PROTOCOL_VERSION));
      expect((await client.readControlAsync()).kind).toBe('helloAck');
      await helloWritten.promise;
      const tracker: ConnectingClientTracker = addSpy.mock.contexts[0] as ConnectingClientTracker;
      await client.sendControlAsync({ kind: 'ping', payload: {} });
      await pongWriting.promise;
      // Hold only this write, rather than depending on socket buffer sizes or a slow reader to back it up.
      // A connection whose reply is still pending must become idle after its last received frame ages out.
      nowMs = 150;
      expect(await isWaitingAsync(tracker)).toBe(false);

      finishPongWrite.resolve();
      expect((await client.readControlAsync()).kind).toBe('pong');
      // Reading the pong is not a clock or a server-side completion barrier. Wait for the outgoing activity,
      // and keep the clock fixed so decoding or a descheduled test cannot consume the 100 ms idle window.
      await pongWritten.promise;
      expect(await isWaitingAsync(tracker)).toBe(true);
      nowMs = 300;
      expect(await isWaitingAsync(tracker)).toBe(false);
    } finally {
      finishPongWrite.resolve();
      sendSpy.mockRestore();
      addSpy.mockRestore();
      clockSpy.mockRestore();
      await Promise.all(clients.map((client: DaemonRequestWireClient) => client.closeAsync()));
      await host.closeAsync();
    }
  });

  it('fails closed with a typed recreation-required outcome before scheduling stale work', async () => {
    const repoRoot: string = createRepoRoot();
    const fixture: ITestRoutingFixture = createRoutingFixture(
      new Map([[OPERATION_A, new TestOperationRunner(OPERATION_A)]])
    );
    fixture.session.onReconcileAsync = () => Promise.reject(new WorkspaceEngineRecreationRequiredError());
    const scheduleSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'scheduleIterationAsync');
    const host: RushDaemonHost = await startHostAsync(repoRoot, fixture);
    const client: DaemonRequestWireClient = await connectAsync(host);
    try {
      const exchange: ITerminalExchange = await startAsync(
        client,
        phasedEnvelope(repoRoot, 'recreate', OPERATION_A)
      );
      expect(exchange.terminal).toMatchObject({
        kind: 'requestRejected',
        payload: { code: 'workspaceRecreationRequired', requestId: 'recreate' }
      });
      expect(scheduleSpy).not.toHaveBeenCalled();
      expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(0);
    } finally {
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('returns a typed in-process fallback without executing controlling-terminal work', async () => {
    const repoRoot: string = createRepoRoot();
    const fixture: ITestRoutingFixture = createRoutingFixture(
      new Map([[OPERATION_A, new TestOperationRunner(OPERATION_A)]])
    );
    const host: RushDaemonHost = await startHostAsync(repoRoot, fixture);
    const client: DaemonRequestWireClient = await connectAsync(host);
    try {
      const exchange: ITerminalExchange = await startAsync(client, {
        ...phasedEnvelope(repoRoot, 'fallback', OPERATION_A),
        terminal: {
          isTTY: true,
          supportsColor: true,
          terminalRequirement: 'controllingTerminal'
        }
      });
      expect(exchange.terminal).toMatchObject({
        kind: 'terminalPolicy',
        payload: { decision: 'requiresInProcess', requestId: 'fallback' }
      });
      expect(fixture.runners.get(OPERATION_A)?.runCount).toBe(0);
    } finally {
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('rejects duplicate request ids deterministically and cancels connection-owned work', async () => {
    const repoRoot: string = createRepoRoot();
    const started: IDeferred<void> = createDeferred<void>();
    const release: IDeferred<void> = createDeferred<void>();
    const fixture: ITestRoutingFixture = createRoutingFixture(
      new Map([
        [
          OPERATION_A,
          new TestOperationRunner(OPERATION_A, OperationStatus.Success, async () => {
            started.resolve();
            await release.promise;
          })
        ]
      ])
    );
    const host: RushDaemonHost = await startHostAsync(repoRoot, fixture);
    const client: DaemonRequestWireClient = await connectAsync(host);
    const envelope: IDaemonRequestEnvelope = phasedEnvelope(repoRoot, 'duplicate', OPERATION_A);
    try {
      await client.sendControlAsync({ kind: 'requestStart', payload: envelope });
      await started.promise;
      await client.sendControlAsync({ kind: 'requestStart', payload: envelope });
      const error: DaemonControlMessage = await readUntilControlKindAsync(client, 'error');
      expect(error).toMatchObject({
        kind: 'error',
        payload: { code: 'malformedControlMessage' }
      });
      release.resolve();
      await client.closed;
      expect(fixture.graph.abortController.signal.aborted).toBe(false);
    } finally {
      release.resolve();
      await host.closeAsync();
    }
  });
});

function readOperationIds(exchange: ITerminalExchange): ReadonlySet<string> {
  const operationIds: Set<string> = new Set();
  for (const frame of exchange.frames) {
    if (frame.kind === DaemonFrameType.logStdout || frame.kind === DaemonFrameType.logStderr) {
      operationIds.add(decodeDaemonLogChunk(frame.payload).operationId);
    } else if (frame.kind === DaemonFrameType.event) {
      const event = decodeDaemonEventFrame(frame.payload);
      const payload: unknown = event.payload;
      if (event.scope?.operationId) operationIds.add(event.scope.operationId);
      if (typeof payload === 'object' && payload !== null && 'operationId' in payload) {
        operationIds.add(String(payload.operationId));
      }
    }
  }
  return operationIds;
}

function readLogText(exchange: ITerminalExchange): string {
  return exchange.frames
    .filter((frame) => frame.kind === DaemonFrameType.logStdout || frame.kind === DaemonFrameType.logStderr)
    .map((frame) => new TextDecoder().decode(decodeDaemonLogChunk(frame.payload).chunk))
    .join('');
}

async function readUntilControlKindAsync(
  client: DaemonRequestWireClient,
  kind: DaemonControlMessage['kind']
): Promise<DaemonControlMessage> {
  for (;;) {
    const frame = await client.readFrameAsync();
    if (frame.kind !== DaemonFrameType.controlJson) continue;
    const message: DaemonControlMessage = decodeDaemonControlMessage(frame.payload);
    if (message.kind === kind) return message;
  }
}

async function settleAsync(): Promise<void> {
  for (let turn: number = 0; turn < 20; turn++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function sleepAsync(durationMs: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

/** Whether a batch would still wait for a connecting client after the daemon handled the frames it received. */
async function isWaitingAsync(tracker: ConnectingClientTracker): Promise<boolean> {
  return await Promise.race([tracker.waitAsync().then(() => false), settleAsync().then(() => true)]);
}
