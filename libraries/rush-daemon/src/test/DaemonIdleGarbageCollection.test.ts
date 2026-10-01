// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../ReducingGarbageCollection', () => ({ getReducingGarbageCollection: jest.fn() }));

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { OperationStatus, type IOperationGraph } from '@microsoft/rush-lib';

import type { GlobalCommandExecutor } from '../GlobalCommandRequestRouter';
import { getReducingGarbageCollection } from '../ReducingGarbageCollection';
import { RushDaemonHost } from '../RushDaemonHost';
import type { IRushDaemonHostOptions } from '../RushDaemonHost';
import { serveRushDaemonAsync } from '../serveRushDaemon';
import {
  CallbackDaemonRequestResolver,
  createDeferred,
  createWireEnvelope,
  DaemonRequestWireClient,
  type IDeferred
} from './DaemonRequestWireTestUtilities';
import { TestWorkspaceSession } from './TestWorkspaceSession';

const DELAY_MS: number = 10000;
const COLLECTION_LOG: RegExp =
  /^rushd: idle garbage collection: resident memory \d+ MB -> \d+ MB, heap \d+ MB -> \d+ MB, paused \d+ ms$/;

class GraphWorkspaceSession extends TestWorkspaceSession {
  public override operationGraph: IOperationGraph | undefined = undefined;
}

interface IBusyGraph {
  hasScheduledIteration: boolean;
  readonly status: OperationStatus;
  readonly abortController: AbortController;
}

/** Lets the daemon finish a request that its client has already seen end, with real I/O and immediates. */
async function settleAsync(): Promise<void> {
  for (let i: number = 0; i < 20; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe('daemon idle garbage collection', () => {
  let repoRoot: string;
  let collect: jest.Mock;
  let logs: string[];

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-idle-gc-'));
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    collect = jest.fn();
    jest.mocked(getReducingGarbageCollection).mockReset().mockReturnValue(collect);
    logs = [];
  });

  afterEach(() => {
    jest.useRealTimers();
    fs.rmSync(repoRoot, { force: true, recursive: true });
  });

  function createOptions(
    executorAsync: GlobalCommandExecutor = () => Promise.resolve({ exitCode: 0 }),
    session: TestWorkspaceSession = new TestWorkspaceSession(repoRoot)
  ): IRushDaemonHostOptions {
    return {
      createWorkspaceSessionAsync: () => Promise.resolve(session),
      daemonVersion: 'idle-gc-test',
      idleGarbageCollectionDelayMs: DELAY_MS,
      onLog: (message: string) => logs.push(message),
      repoRoot,
      requestResolver: new CallbackDaemonRequestResolver(async () => ({
        kind: 'global',
        executor: executorAsync
      })),
      rushVersion: '5.178.1'
    };
  }

  async function connectAsync(host: RushDaemonHost): Promise<DaemonRequestWireClient> {
    const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(host.paths.socketPath);
    await client.handshakeAsync();
    return client;
  }

  async function startRequestAsync(client: DaemonRequestWireClient, requestId: string): Promise<void> {
    await client.sendControlAsync({
      kind: 'requestStart',
      payload: createWireEnvelope(requestId, 'custom', repoRoot)
    });
  }

  async function runRequestAsync(client: DaemonRequestWireClient, requestId: string): Promise<void> {
    await startRequestAsync(client, requestId);
    expect((await client.readTerminalAsync(requestId)).terminal).toMatchObject({
      kind: 'requestResult',
      payload: { exitCode: 0 }
    });
    await settleAsync();
  }

  it('collects once after a request, logs what it returned, and waits for the next request', async () => {
    const host: RushDaemonHost = await RushDaemonHost.startAsync(createOptions());
    const client: DaemonRequestWireClient = await connectAsync(host);
    try {
      await jest.advanceTimersByTimeAsync(10 * DELAY_MS);
      expect(collect).not.toHaveBeenCalled();
      await runRequestAsync(client, 'first');
      await jest.advanceTimersByTimeAsync(DELAY_MS);
      expect(collect).toHaveBeenCalledTimes(1);
      expect(logs.filter((message: string) => COLLECTION_LOG.test(message))).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(10 * DELAY_MS);
      expect(collect).toHaveBeenCalledTimes(1);
      await runRequestAsync(client, 'second');
      await jest.advanceTimersByTimeAsync(DELAY_MS);
      expect(collect).toHaveBeenCalledTimes(2);
      expect(getReducingGarbageCollection).toHaveBeenCalledTimes(1);
    } finally {
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('does not collect while a request is pending', async () => {
    const executing: IDeferred<void> = createDeferred<void>();
    const executed: IDeferred<void> = createDeferred<void>();
    const host: RushDaemonHost = await RushDaemonHost.startAsync(
      createOptions(async () => {
        executing.resolve();
        await executed.promise;
        return { exitCode: 0 };
      })
    );
    const client: DaemonRequestWireClient = await connectAsync(host);
    try {
      await startRequestAsync(client, 'pending');
      await executing.promise;
      await jest.advanceTimersByTimeAsync(10 * DELAY_MS);
      expect(collect).not.toHaveBeenCalled();
      executed.resolve();
      await client.readTerminalAsync('pending');
      await settleAsync();
      await jest.advanceTimersByTimeAsync(DELAY_MS);
      expect(collect).toHaveBeenCalledTimes(1);
    } finally {
      executed.resolve();
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('waits while the operation graph is busy after its requests ended', async () => {
    const session: GraphWorkspaceSession = new GraphWorkspaceSession(repoRoot);
    const host: RushDaemonHost = await RushDaemonHost.startAsync(createOptions(undefined, session));
    const client: DaemonRequestWireClient = await connectAsync(host);
    try {
      await runRequestAsync(client, 'left-iteration');
      const graph: IBusyGraph = {
        hasScheduledIteration: true,
        status: OperationStatus.Ready,
        abortController: new AbortController()
      };
      session.operationGraph = graph as unknown as IOperationGraph;
      await jest.advanceTimersByTimeAsync(10 * DELAY_MS);
      expect(collect).not.toHaveBeenCalled();
      graph.hasScheduledIteration = false;
      await jest.advanceTimersByTimeAsync(DELAY_MS);
      expect(collect).toHaveBeenCalledTimes(1);
    } finally {
      session.operationGraph = undefined;
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('logs a failed collection once and stops collecting', async () => {
    jest.mocked(getReducingGarbageCollection).mockImplementation(() => {
      throw new Error('no gc here');
    });
    const host: RushDaemonHost = await RushDaemonHost.startAsync(createOptions());
    const client: DaemonRequestWireClient = await connectAsync(host);
    try {
      await runRequestAsync(client, 'first');
      await jest.advanceTimersByTimeAsync(DELAY_MS);
      await runRequestAsync(client, 'second');
      await jest.advanceTimersByTimeAsync(10 * DELAY_MS);
      expect(getReducingGarbageCollection).toHaveBeenCalledTimes(1);
      expect(logs.filter((message: string) => message.startsWith('rushd: idle garbage collection'))).toEqual([
        'rushd: idle garbage collection failed and is now off: no gc here'
      ]);
    } finally {
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('does not collect once the host closes', async () => {
    const host: RushDaemonHost = await RushDaemonHost.startAsync(createOptions());
    const client: DaemonRequestWireClient = await connectAsync(host);
    try {
      await runRequestAsync(client, 'first');
    } finally {
      await client.closeAsync();
      await host.closeAsync();
    }
    await jest.advanceTimersByTimeAsync(10 * DELAY_MS);
    expect(collect).not.toHaveBeenCalled();
  });

  it('is off for a daemon that does not own its process unless the delay is set', async () => {
    const shutdown: AbortController = new AbortController();
    const ready: IDeferred<RushDaemonHost> = createDeferred<RushDaemonHost>();
    const serving: Promise<void> = serveRushDaemonAsync({
      ...createOptions(),
      idleGarbageCollectionDelayMs: undefined,
      onReady: (host: RushDaemonHost) => ready.resolve(host),
      shutdownSignal: shutdown.signal
    });
    const host: RushDaemonHost = await ready.promise;
    const client: DaemonRequestWireClient = await connectAsync(host);
    try {
      await runRequestAsync(client, 'first');
      await jest.advanceTimersByTimeAsync(10 * DELAY_MS);
      expect(getReducingGarbageCollection).not.toHaveBeenCalled();
      expect(collect).not.toHaveBeenCalled();
    } finally {
      await client.closeAsync();
      shutdown.abort();
      await serving;
      await host.closeAsync();
    }
  });
});
