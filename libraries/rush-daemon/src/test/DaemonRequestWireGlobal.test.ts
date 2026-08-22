// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DaemonFrameType, decodeDaemonLogChunk } from '@rushstack/rush-daemon-protocol';
import type {
  DaemonControlMessage,
  IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';

import type {
  GlobalCommandExecutor,
  IDaemonRequestResolver
} from '../index';
import { RushDaemonHost } from '../RushDaemonHost';
import type { IRushDaemonHostOptions } from '../RushDaemonHost';
import { TestWorkspaceSession } from './TestWorkspaceSession';
import {
  CallbackDaemonRequestResolver,
  DaemonRequestWireClient,
  createDeferred,
  createWireEnvelope
} from './DaemonRequestWireTestUtilities';
import type {
  IDeferred,
  ITerminalExchange
} from './DaemonRequestWireTestUtilities';

const DAEMON_VERSION: string = 'wire-test';
const RUSH_VERSION: string = '5.178.1';
const INPUT_BYTE: number = 0xff;
const WAIT_TIMEOUT_MS: number = 20;
const FAILURE_EXIT_CODE: number = 7;
const testRepoRoots: Set<string> = new Set();

afterEach(() => {
  for (const repoRoot of testRepoRoots) fs.rmSync(repoRoot, { force: true, recursive: true });
  testRepoRoots.clear();
});

function createRepoRoot(): string {
  const repoRoot: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-wire-global-'));
  testRepoRoots.add(repoRoot);
  return repoRoot;
}

function createHostOptions(
  repoRoot: string,
  resolver?: IDaemonRequestResolver,
  onDispose?: () => unknown
): IRushDaemonHostOptions {
  return {
    createWorkspaceSessionAsync: () =>
      Promise.resolve(new TestWorkspaceSession(repoRoot, onDispose)),
    daemonVersion: DAEMON_VERSION,
    repoRoot,
    requestResolver: resolver,
    rushVersion: RUSH_VERSION
  };
}

async function connectAsync(host: RushDaemonHost): Promise<DaemonRequestWireClient> {
  const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(
    host.paths.socketPath
  );
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

describe('daemon global request wire integration', () => {
  it('keeps standalone startup and ping available while rejecting unconfigured execution honestly', async () => {
    const repoRoot: string = createRepoRoot();
    const host: RushDaemonHost = await RushDaemonHost.startAsync(createHostOptions(repoRoot));
    const client: DaemonRequestWireClient = await connectAsync(host);
    try {
      const exchange: ITerminalExchange = await startAsync(
        client,
        createWireEnvelope('unsupported', 'build', repoRoot)
      );
      expect(exchange.terminal).toMatchObject({
        kind: 'requestRejected',
        payload: { code: 'unsupported', requestId: 'unsupported' }
      });
    } finally {
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('isolates global cwd and environment while preserving raw ordered output and exit codes', async () => {
    const repoRoot: string = createRepoRoot();
    const firstCwd: string = fs.mkdtempSync(path.join(repoRoot, 'first-'));
    const secondCwd: string = fs.mkdtempSync(path.join(repoRoot, 'second-'));
    const observed: string[] = [];
    const resolver: IDaemonRequestResolver = new CallbackDaemonRequestResolver(
      async ({ envelope }) => {
        const executorAsync: GlobalCommandExecutor = async (context) => {
          observed.push(`${envelope.requestId}:${context.cwd}:${context.environment.get('WIRE_VALUE')}`);
          context.terminal.write(`${envelope.requestId}-output`);
          return { exitCode: envelope.requestId === 'failure' ? FAILURE_EXIT_CODE : 0 };
        };
        return { executor: executorAsync, kind: 'global' };
      }
    );
    const host: RushDaemonHost = await RushDaemonHost.startAsync(createHostOptions(repoRoot, resolver));
    const clients: ReadonlyArray<DaemonRequestWireClient> = [
      await connectAsync(host),
      await connectAsync(host)
    ];
    const originalCwd: string = process.cwd();
    const originalEnvironmentValue: string | undefined = process.env.WIRE_VALUE;
    try {
      const exchanges: ReadonlyArray<ITerminalExchange> = await Promise.all([
        startAsync(
          clients[0],
          createWireEnvelope('success', 'custom-a', firstCwd, {
            environment: { WIRE_VALUE: 'one' }
          })
        ),
        startAsync(
          clients[1],
          createWireEnvelope('failure', 'custom-b', secondCwd, {
            environment: { WIRE_VALUE: 'two' }
          })
        )
      ]);
      expect(exchanges[0].terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      expect(exchanges[1].terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: FAILURE_EXIT_CODE, outcome: 'failure' }
      });
      expect(readLogText(exchanges[0])).toBe('success-output');
      expect(readLogText(exchanges[1])).toBe('failure-output');
      expect(observed).toEqual(
        expect.arrayContaining([
          `success:${await fs.promises.realpath(firstCwd)}:one`,
          `failure:${await fs.promises.realpath(secondCwd)}:two`
        ])
      );
      expect(process.cwd()).toBe(originalCwd);
      expect(process.env.WIRE_VALUE).toBe(originalEnvironmentValue);
    } finally {
      await Promise.all(clients.map((client: DaemonRequestWireClient) => client.closeAsync()));
      await host.closeAsync();
    }
  });

  it('routes stdin bytes and acknowledged raw-mode transitions through the real connection', async () => {
    const repoRoot: string = createRepoRoot();
    const receivedInput: IDeferred<Uint8Array> = createDeferred<Uint8Array>();
    const executor: GlobalCommandExecutor = async (context) => {
      const registration: Disposable = context.interactiveInput!.attachInputSink({
        writeInputAsync: (chunk: Uint8Array): Promise<void> => {
          receivedInput.resolve(chunk);
          return Promise.resolve();
        }
      });
      try {
        await context.interactiveInput!.setRawModeAsync(true);
        await receivedInput.promise;
        return { exitCode: 0 };
      } finally {
        registration[Symbol.dispose]();
      }
    };
    const resolver: IDaemonRequestResolver = new CallbackDaemonRequestResolver(async () => ({
      executor,
      kind: 'global'
    }));
    const host: RushDaemonHost = await RushDaemonHost.startAsync(createHostOptions(repoRoot, resolver));
    const client: DaemonRequestWireClient = await connectAsync(host);
    const requestId: string = 'interactive';
    try {
      await client.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope(requestId, 'custom', repoRoot, {
          terminal: {
            acceptsStdin: true,
            isTTY: true,
            supportsColor: true,
            terminalRequirement: 'interactiveInput'
          }
        })
      });
      const enableRaw: DaemonControlMessage = await client.readControlAsync();
      expect(enableRaw).toMatchObject({ kind: 'setRawMode', payload: { enabled: true, requestId } });
      await client.sendControlAsync({
        kind: 'rawModeChanged',
        payload: { enabled: true, requestId }
      });
      await client.sendStdinAsync(requestId, Uint8Array.of(INPUT_BYTE));
      await expect(receivedInput.promise).resolves.toEqual(Uint8Array.of(INPUT_BYTE));
      const disableRaw: DaemonControlMessage = await client.readControlAsync();
      expect(disableRaw).toMatchObject({ kind: 'setRawMode', payload: { enabled: false, requestId } });
      await client.sendControlAsync({
        kind: 'rawModeChanged',
        payload: { enabled: false, requestId }
      });
      expect((await client.readTerminalAsync(requestId)).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { outcome: 'success' }
      });
    } finally {
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('shares admission across connections for no-wait, timeout, queue progress, and cancellation', async () => {
    const repoRoot: string = createRepoRoot();
    const holderStarted: IDeferred<void> = createDeferred<void>();
    const releaseHolder: IDeferred<void> = createDeferred<void>();
    const resolver: IDaemonRequestResolver = new CallbackDaemonRequestResolver(
      async ({ envelope }) => {
        const executorAsync: GlobalCommandExecutor = async () => {
          if (envelope.requestId === 'holder') {
            holderStarted.resolve();
            await releaseHolder.promise;
          }
          return { exitCode: 0 };
        };
        return { executor: executorAsync, kind: 'global' };
      }
    );
    const host: RushDaemonHost = await RushDaemonHost.startAsync(createHostOptions(repoRoot, resolver));
    const clients: DaemonRequestWireClient[] = await Promise.all(
      Array.from({ length: 4 }, () => connectAsync(host))
    );
    try {
      await clients[0].sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('holder', 'custom', repoRoot)
      });
      await holderStarted.promise;
      const noWait: Promise<ITerminalExchange> = startAsync(
        clients[1],
        createWireEnvelope('no-wait', 'custom', repoRoot, { admission: { noWait: true } })
      );
      const timeout: Promise<ITerminalExchange> = startAsync(
        clients[2],
        createWireEnvelope('timeout', 'custom', repoRoot, {
          admission: { waitTimeoutMs: WAIT_TIMEOUT_MS }
        })
      );
      await clients[3].sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('cancelled', 'custom', repoRoot)
      });
      expect(await clients[3].readControlAsync()).toMatchObject({
        kind: 'queuePosition',
        payload: { requestId: 'cancelled' }
      });
      await clients[3].sendControlAsync({
        kind: 'requestCancel',
        payload: { requestId: 'cancelled' }
      });
      expect((await noWait).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { admissionErrorCode: 'no-wait' }
      });
      expect((await timeout).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { admissionErrorCode: 'wait-timeout' }
      });
      expect((await clients[3].readTerminalAsync('cancelled')).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { aborted: true, admissionErrorCode: 'aborted' }
      });
      releaseHolder.resolve();
      expect((await clients[0].readTerminalAsync('holder')).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { outcome: 'success' }
      });
    } finally {
      releaseHolder.resolve();
      await Promise.all(clients.map((client: DaemonRequestWireClient) => client.closeAsync()));
      await host.closeAsync();
    }
  });

  it('rejects a second active request on one connection without cancelling the first', async () => {
    const repoRoot: string = createRepoRoot();
    const started: IDeferred<void> = createDeferred<void>();
    const release: IDeferred<void> = createDeferred<void>();
    const executor: GlobalCommandExecutor = async () => {
      started.resolve();
      await release.promise;
      return { exitCode: 0 };
    };
    const resolver: IDaemonRequestResolver = new CallbackDaemonRequestResolver(async () => ({
      executor,
      kind: 'global'
    }));
    const host: RushDaemonHost = await RushDaemonHost.startAsync(createHostOptions(repoRoot, resolver));
    const client: DaemonRequestWireClient = await connectAsync(host);
    try {
      await client.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('first', 'custom', repoRoot)
      });
      await started.promise;
      const second: ITerminalExchange = await startAsync(
        client,
        createWireEnvelope('second', 'custom', repoRoot)
      );
      expect(second.terminal).toMatchObject({
        kind: 'requestRejected',
        payload: { code: 'invalidRequest', requestId: 'second' }
      });
      release.resolve();
      expect((await client.readTerminalAsync('first')).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { outcome: 'success', requestId: 'first' }
      });
    } finally {
      release.resolve();
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('cancels active work before closing clients and disposing the warm workspace', async () => {
    const repoRoot: string = createRepoRoot();
    const events: string[] = [];
    const executionStarted: IDeferred<void> = createDeferred<void>();
    const resolver: IDaemonRequestResolver = new CallbackDaemonRequestResolver(
      async () => {
        const executorAsync: GlobalCommandExecutor = async (context) => {
          executionStarted.resolve();
          await new Promise<void>((resolve) => {
            const finish = (): void => {
              events.push('executor-aborted');
              resolve();
            };
            if (context.abortSignal.aborted) finish();
            else context.abortSignal.addEventListener('abort', finish, { once: true });
          });
          return { exitCode: 0 };
        };
        return { executor: executorAsync, kind: 'global' };
      },
      () => {
        events.push('resolver-disposed');
        return Promise.resolve();
      }
    );
    const host: RushDaemonHost = await RushDaemonHost.startAsync(
      createHostOptions(repoRoot, resolver, () => events.push('workspace-disposed'))
    );
    const client: DaemonRequestWireClient = await connectAsync(host);
    await client.sendControlAsync({
      kind: 'requestStart',
      payload: createWireEnvelope('shutdown', 'custom', repoRoot)
    });
    await executionStarted.promise;

    await host.closeAsync();
    await client.closed;

    expect(events).toEqual(['executor-aborted', 'resolver-disposed', 'workspace-disposed']);
  });
});

function readLogText(exchange: ITerminalExchange): string {
  return exchange.frames
    .filter(
      (frame) =>
        frame.kind === DaemonFrameType.logStdout || frame.kind === DaemonFrameType.logStderr
    )
    .map((frame) => new TextDecoder().decode(decodeDaemonLogChunk(frame.payload).chunk))
    .join('');
}
