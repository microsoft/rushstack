// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { readDaemonLockfile } from '@rushstack/rush-daemon-transport';

import { RushDaemonHost } from '../RushDaemonHost';
import type { IRushDaemonHostOptions } from '../RushDaemonHost';
import type { GlobalCommandExecutor } from '../GlobalCommandRequestRouter';
import { serveRushDaemonAsync } from '../serveRushDaemon';
import {
  CallbackDaemonRequestResolver,
  createDeferred,
  createWireEnvelope,
  DaemonRequestWireClient
} from './DaemonRequestWireTestUtilities';
import { TestWorkspaceSession } from './TestWorkspaceSession';

const IDLE_TIMEOUT_SECONDS: number = 10;
const IDLE_TIMEOUT_MS: number = 10000;

describe('daemon idle shutdown', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-idle-'));
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  });

  afterEach(() => {
    jest.useRealTimers();
    fs.rmSync(repoRoot, { force: true, recursive: true });
  });

  function createOptions(): IRushDaemonHostOptions {
    return {
      createWorkspaceSessionAsync: () => Promise.resolve(new TestWorkspaceSession(repoRoot)),
      daemonVersion: 'idle-test',
      idleTimeoutSeconds: IDLE_TIMEOUT_SECONDS,
      repoRoot,
      rushVersion: '5.178.1'
    };
  }

  it('finishes serving and removes transport artifacts after idle shutdown', async () => {
    const ready = createDeferred<RushDaemonHost>();
    const serving: Promise<void> = serveRushDaemonAsync({
      ...createOptions(),
      onReady: (host) => ready.resolve(host),
      shutdownSignal: new AbortController().signal
    });
    const host: RushDaemonHost = await ready.promise;
    try {
      await jest.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
      await serving;
      expect(readDaemonLockfile(host.paths.lockfilePath)).toBeUndefined();
      await expect(host.closed).resolves.toBeUndefined();
    } finally {
      await host.closeAsync();
    }
  });

  it('protects pending resolution and execution, then expires an idle connected client', async () => {
    const resolving = createDeferred<void>();
    const resolved = createDeferred<void>();
    const executing = createDeferred<void>();
    const executed = createDeferred<void>();
    const host: RushDaemonHost = await RushDaemonHost.startAsync({
      ...createOptions(),
      requestResolver: new CallbackDaemonRequestResolver(async () => {
        resolving.resolve();
        await resolved.promise;
        const executorAsync: GlobalCommandExecutor = async () => {
          executing.resolve();
          await executed.promise;
          return { exitCode: 0 };
        };
        return {
          kind: 'global',
          executor: executorAsync
        };
      })
    });
    const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(host.paths.socketPath);
    try {
      await client.handshakeAsync();
      await client.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('idle-request', 'custom', repoRoot)
      });
      await resolving.promise;
      await jest.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
      expect(readDaemonLockfile(host.paths.lockfilePath)).toBeDefined();
      resolved.resolve();
      await executing.promise;
      await jest.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
      expect(readDaemonLockfile(host.paths.lockfilePath)).toBeDefined();
      executed.resolve();
      expect((await client.readTerminalAsync('idle-request')).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      await jest.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
      await host.closed;
      expect(readDaemonLockfile(host.paths.lockfilePath)).toBeUndefined();
    } finally {
      resolved.resolve();
      executed.resolve();
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('releases activity after an unsupported request instead of pinning the daemon forever', async () => {
    const host: RushDaemonHost = await RushDaemonHost.startAsync(createOptions());
    const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(host.paths.socketPath);
    try {
      await client.handshakeAsync();
      await client.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('unsupported', 'build', repoRoot)
      });
      expect((await client.readTerminalAsync('unsupported')).terminal.kind).toBe('requestRejected');
      await jest.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
      await host.closed;
      expect(readDaemonLockfile(host.paths.lockfilePath)).toBeUndefined();
    } finally {
      await client.closeAsync();
      await host.closeAsync();
    }
  });
});
