// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { OperationStatus } from '@microsoft/rush-lib';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import { RushDaemonHost } from '../RushDaemonHost';
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
const testRepoRoots: Set<string> = new Set();

afterEach(() => {
  for (const repoRoot of testRepoRoots) fs.rmSync(repoRoot, { force: true, recursive: true });
  testRepoRoots.clear();
});

interface IEarlyFailureHost {
  readonly abortSpy: jest.SpyInstance;
  readonly fixture: ITestRoutingFixture;
  readonly host: RushDaemonHost;
  readonly releaseC: IDeferred<void>;
  readonly repoRoot: string;
}

/** A consumes B and C. B fails once C runs, and C runs until `releaseC` resolves. */
async function startEarlyFailureHostAsync(): Promise<IEarlyFailureHost> {
  const repoRoot: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-wire-early-failure-'));
  testRepoRoots.add(repoRoot);
  const startedC: IDeferred<void> = createDeferred<void>();
  const releaseC: IDeferred<void> = createDeferred<void>();
  const fixture: ITestRoutingFixture = createRoutingFixture(
    new Map([
      [OPERATION_A, new TestOperationRunner(OPERATION_A)],
      [OPERATION_B, new TestOperationRunner(OPERATION_B, OperationStatus.Failure, () => startedC.promise)],
      [
        OPERATION_C,
        new TestOperationRunner(OPERATION_C, OperationStatus.Success, async (): Promise<void> => {
          startedC.resolve();
          await releaseC.promise;
        })
      ]
    ]),
    [
      [OPERATION_A, OPERATION_B],
      [OPERATION_A, OPERATION_C]
    ],
    { parallelism: 2 }
  );
  const abortSpy: jest.SpyInstance = jest.spyOn(fixture.graph, 'abortCurrentIterationAsync');
  const host: RushDaemonHost = await RushDaemonHost.startAsync({
    createWorkspaceSessionAsync: () => Promise.resolve(fixture.session),
    daemonVersion: 'wire-test',
    repoRoot,
    requestResolver: new CallbackDaemonRequestResolver(async ({ envelope }) => ({
      kind: 'phased',
      request: {
        commandName: envelope.commandName,
        commandOrigin: envelope.commandOrigin,
        engineShape: TEST_ENGINE_SHAPE,
        environment: envelope.environment,
        operationSelection: envelope.argv
          .slice(1)
          .map((operationId: string) => ({ enabledState: true, operationId })),
        requestId: envelope.requestId,
        returnEarlyOnFailure: envelope.returnEarlyOnFailure
      }
    })),
    rushVersion: '5.178.1'
  });
  return { abortSpy, fixture, host, releaseC, repoRoot };
}

/** Counts the aborts that the router requested; every iteration's start also calls the spy without options. */
function countTerminatingAborts(abortSpy: jest.SpyInstance): number {
  return abortSpy.mock.calls.filter(
    ([options]: ReadonlyArray<{ terminateRunning?: boolean } | undefined>) =>
      options?.terminateRunning === true
  ).length;
}

async function settleAsync(): Promise<void> {
  for (let turn: number = 0; turn < 20; turn++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function buildAndDisconnectAsync({ host, repoRoot }: IEarlyFailureHost): Promise<ITerminalExchange> {
  const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(host.paths.socketPath);
  await client.handshakeAsync();
  const envelope: IDaemonRequestEnvelope = createWireEnvelope('agent', 'build', repoRoot, {
    argv: ['build', OPERATION_A],
    commandOrigin: 'built-in',
    returnEarlyOnFailure: true
  });
  await client.sendControlAsync({ kind: 'requestStart', payload: envelope });
  const exchange: ITerminalExchange = await client.readTerminalAsync('agent');
  await client.closeAsync();
  await client.closed;
  return exchange;
}

describe('daemon requests that return early on failure', () => {
  it('keeps the work that continues after the result when the client disconnects, until the daemon closes', async () => {
    const setup: IEarlyFailureHost = await startEarlyFailureHostAsync();
    try {
      const exchange: ITerminalExchange = await buildAndDisconnectAsync(setup);
      expect(exchange.terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, outcome: 'failure', requestId: 'agent' }
      });
      await settleAsync();
      expect(setup.fixture.graph.status).toBe(OperationStatus.Executing);
      expect(countTerminatingAborts(setup.abortSpy)).toBe(0);

      const closed: Promise<void> = setup.host.closeAsync();
      await settleAsync();
      expect(countTerminatingAborts(setup.abortSpy)).toBe(1);
      setup.releaseC.resolve();
      await closed;
    } finally {
      setup.releaseC.resolve();
      await setup.host.closeAsync();
    }
  });

  it('lets the work that continues finish after the client disconnects', async () => {
    const setup: IEarlyFailureHost = await startEarlyFailureHostAsync();
    try {
      await buildAndDisconnectAsync(setup);
      setup.releaseC.resolve();
      while (setup.fixture.graph.status === OperationStatus.Executing) {
        await settleAsync();
      }
      await settleAsync();
      await setup.host.closeAsync();

      expect(countTerminatingAborts(setup.abortSpy)).toBe(0);
      const retainedC: OperationStatus | undefined = [...setup.fixture.graph.resultByOperation.values()].find(
        ({ operation }) => operation.name === OPERATION_C
      )?.status;
      expect(retainedC).toBe(OperationStatus.Success);
    } finally {
      setup.releaseC.resolve();
      await setup.host.closeAsync();
    }
  });
});
