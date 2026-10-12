// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationGraph } from '@microsoft/rush-lib';
import { formatNativeLockHolder } from '@rushstack/rush-client-core';
import {
  DaemonFrameType,
  decodeDaemonControlMessage,
  type DaemonControlMessage,
  type IDaemonFrame,
  type IDaemonNativeLockHolder,
  type IDaemonRequestQueuePositionMessage
} from '@rushstack/rush-daemon-protocol';

import {
  createNativeScriptGateAsync,
  startNativeCommand,
  type INativeCommand,
  type INativeScriptGate
} from './NativeEngineTestCommands';
import {
  createWireEnvelope,
  DaemonRequestWireClient,
  type ITerminalExchange
} from './DaemonRequestWireTestUtilities';
import {
  createFixtureAsync,
  requestEnvironment,
  runAsync,
  runs,
  type IFixture
} from './NativeEngineTestFixture';

jest.setTimeout(30_000);

interface IGatedNativeCommand {
  readonly native: INativeCommand;
  readonly gate: INativeScriptGate;
}

describe('native production daemon engine, while a native Rush action holds the repository lock', () => {
  it('waits at preparation and at iteration time, naming the action, and then runs', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const commands: IGatedNativeCommand[] = [];
    try {
      const first: IGatedNativeCommand = await startGatedNativeRebuildAsync(fixture.repoRoot);
      commands.push(first);
      await sendRequestAsync(fixture, 'busy-initialization', ['build', '--only', 'b']);
      expect(await readNativeLockHolderAsync(fixture.client, 'busy-initialization')).toEqual(
        getExpectedHolder(first.native)
      );
      expect(fixture.session.operationGraph).toBeUndefined();
      await first.gate.releaseAsync();
      expect(await first.native.result).toMatchObject({ exitCode: 0 });
      expect((await fixture.client.readTerminalAsync('busy-initialization')).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      const graph: IOperationGraph | undefined = fixture.session.operationGraph;
      expect(graph).toBeDefined();

      const second: IGatedNativeCommand = await startGatedNativeRebuildAsync(fixture.repoRoot);
      commands.push(second);
      await sendRequestAsync(fixture, 'busy-iteration', ['build', '--only', 'b']);
      expect(await readNativeLockHolderAsync(fixture.client, 'busy-iteration')).toEqual(
        getExpectedHolder(second.native)
      );
      await second.gate.releaseAsync();
      expect(await second.native.result).toMatchObject({ exitCode: 0 });
      expect((await fixture.client.readTerminalAsync('busy-iteration')).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      // The request waited to run an iteration of the graph that it had loaded, not to load a new one. The native
      // rebuild of a left b up to date.
      expect(fixture.session.operationGraph).toBe(graph);
      expect(runs(fixture)).toEqual(['a:one:', 'b:one:', 'a:one:']);
    } finally {
      await releaseAllAsync(commands);
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('fails at once or on timeout, naming the action, when a request may not wait for the lock', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const commands: IGatedNativeCommand[] = [];
    try {
      const first: IGatedNativeCommand = await startGatedNativeRebuildAsync(fixture.repoRoot);
      commands.push(first);
      await expectAdmissionFailuresAsync(fixture, 'initialization', first.native);
      expect(fixture.session.operationGraph).toBeUndefined();
      await first.gate.releaseAsync();
      expect(await first.native.result).toMatchObject({ exitCode: 0 });
      expect((await runAsync(fixture, 'retry', ['build', '--only', 'b'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      const graph: IOperationGraph | undefined = fixture.session.operationGraph;

      const second: IGatedNativeCommand = await startGatedNativeRebuildAsync(fixture.repoRoot);
      commands.push(second);
      await expectAdmissionFailuresAsync(fixture, 'iteration', second.native);
      await second.gate.releaseAsync();
      expect(await second.native.result).toMatchObject({ exitCode: 0 });
      expect((await runAsync(fixture, 'retry-iteration', ['build', '--only', 'b'])).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      expect(fixture.session.operationGraph).toBe(graph);
      expect(runs(fixture)).toEqual(['a:one:', 'b:one:', 'a:one:']);
    } finally {
      await releaseAllAsync(commands);
      await fixture[Symbol.asyncDispose]();
    }
  });

  it('has requests behind the graph load spend their wait timeouts while the load waits for the lock', async () => {
    const fixture: IFixture = await createFixtureAsync();
    const commands: IGatedNativeCommand[] = [];
    let behind: DaemonRequestWireClient | undefined;
    try {
      const first: IGatedNativeCommand = await startGatedNativeRebuildAsync(fixture.repoRoot);
      commands.push(first);
      await sendRequestAsync(fixture, 'loading', ['build', '--only', 'b']);
      await readNativeLockHolderAsync(fixture.client, 'loading');

      // Waiting for another Rush process is contention, not progress that pauses the followers' wait timeouts. The
      // followers wait for that process too, and are told which it is.
      behind = await DaemonRequestWireClient.connectAsync(fixture.host.paths.socketPath);
      await behind.handshakeAsync();
      await behind.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('behind', 'build', fixture.repoRoot, {
          admission: { waitTimeoutMs: 1000 },
          argv: ['build', '--only', 'b'],
          environment: requestEnvironment(),
          commandOrigin: 'built-in'
        })
      });
      const nativeLockHolder: IDaemonNativeLockHolder = getExpectedHolder(first.native);
      const exchange: ITerminalExchange = await behind.readTerminalAsync('behind');
      expect(exchange.terminal).toMatchObject({
        kind: 'requestResult',
        payload: {
          exitCode: 1,
          admissionErrorCode: 'wait-timeout',
          errorMessage:
            "The request was not admitted within its 1000ms wait timeout while waiting for another request's load " +
            `or reload of the workspace graph, which waits for ${formatNativeLockHolder(nativeLockHolder)} to ` +
            "release this repository's lock. Use --wait-timeout <seconds> to wait longer."
        }
      });
      expect(getQueuePositionPayloads(exchange)).toEqual([
        { position: 1, requestId: 'behind', nativeLockHolder }
      ]);

      await first.gate.releaseAsync();
      expect(await first.native.result).toMatchObject({ exitCode: 0 });
      expect((await fixture.client.readTerminalAsync('loading')).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
    } finally {
      await behind?.closeAsync();
      await releaseAllAsync(commands);
      await fixture[Symbol.asyncDispose]();
    }
  });
});

/** Starts a native rebuild of project `a` that holds Rush's repository lock until its gate is released. */
async function startGatedNativeRebuildAsync(repoRoot: string): Promise<IGatedNativeCommand> {
  const gate: INativeScriptGate = await createNativeScriptGateAsync(repoRoot, 'a');
  const native: INativeCommand = startNativeCommand(repoRoot, [
    'rebuild',
    '--only',
    'a',
    '--parallelism',
    '3'
  ]);
  try {
    await Promise.race([
      gate.entered,
      native.result.then((result) => {
        throw new Error(`Native action did not enter its script gate: ${JSON.stringify(result)}`);
      })
    ]);
  } catch (error) {
    await releaseAllAsync([{ native, gate }]);
    throw error;
  }
  return { native, gate };
}

async function releaseAllAsync(commands: ReadonlyArray<IGatedNativeCommand>): Promise<void> {
  for (const { native, gate } of commands) {
    await gate.releaseAsync();
    await native.result.catch(() => undefined);
  }
}

/** Only Linux can tell which process holds the lock. The command line of `node -e` names no program. */
function getExpectedHolder(native: INativeCommand): IDaemonNativeLockHolder {
  return process.platform === 'linux' ? { pid: native.pid } : {};
}

async function expectAdmissionFailuresAsync(
  fixture: IFixture,
  stage: string,
  native: INativeCommand
): Promise<void> {
  const holder: string = formatNativeLockHolder(getExpectedHolder(native));
  const argv: string[] = ['build', '--only', 'b'];
  expect(
    (await runAsync(fixture, `${stage}-zero`, argv, { admission: { waitTimeoutMs: 0 } })).terminal
  ).toMatchObject({
    kind: 'requestResult',
    payload: {
      exitCode: 1,
      admissionErrorCode: 'wait-timeout',
      errorMessage:
        `The request cannot be admitted immediately because ${holder} holds this repository's lock. ` +
        'Use --wait-timeout <seconds> to wait for it.'
    }
  });
  expect(
    (await runAsync(fixture, `${stage}-no-wait`, argv, { admission: { noWait: true } })).terminal
  ).toMatchObject({
    kind: 'requestResult',
    payload: {
      exitCode: 1,
      admissionErrorCode: 'no-wait',
      errorMessage:
        `The request cannot be admitted immediately because ${holder} holds this repository's lock, and ` +
        '--no-wait was specified.'
    }
  });
  expect(
    (await runAsync(fixture, `${stage}-timeout`, argv, { admission: { waitTimeoutMs: 300 } })).terminal
  ).toMatchObject({
    kind: 'requestResult',
    payload: {
      exitCode: 1,
      admissionErrorCode: 'wait-timeout',
      errorMessage:
        `The request was not admitted within its 300ms wait timeout while waiting for ${holder} to release ` +
        "this repository's lock. Use --wait-timeout <seconds> to wait longer."
    }
  });
}

async function sendRequestAsync(fixture: IFixture, requestId: string, argv: string[]): Promise<void> {
  await fixture.client.sendControlAsync({
    kind: 'requestStart',
    payload: createWireEnvelope(requestId, argv[0], fixture.repoRoot, {
      argv,
      environment: requestEnvironment(),
      commandOrigin: 'built-in'
    })
  });
}

function getQueuePositionPayloads(
  exchange: ITerminalExchange
): IDaemonRequestQueuePositionMessage['payload'][] {
  return exchange.frames
    .filter((frame: IDaemonFrame) => frame.kind === DaemonFrameType.controlJson)
    .map((frame: IDaemonFrame) => decodeDaemonControlMessage(frame.payload))
    .flatMap((message: DaemonControlMessage) => (message.kind === 'queuePosition' ? [message.payload] : []));
}

/** Reads frames until the daemon says that the request waits for native Rush's repository lock. */
async function readNativeLockHolderAsync(
  client: DaemonRequestWireClient,
  requestId: string
): Promise<IDaemonNativeLockHolder> {
  for (;;) {
    const frame: IDaemonFrame = await client.readFrameAsync();
    if (frame.kind !== DaemonFrameType.controlJson) continue;
    const message: DaemonControlMessage = decodeDaemonControlMessage(frame.payload);
    if (message.kind === 'queuePosition' && message.payload.requestId === requestId) {
      if (message.payload.nativeLockHolder) return message.payload.nativeLockHolder;
    } else if (
      (message.kind === 'requestResult' || message.kind === 'requestRejected') &&
      message.payload.requestId === requestId
    ) {
      throw new Error(`The request ended without waiting for the lock: ${JSON.stringify(message)}`);
    }
  }
}
