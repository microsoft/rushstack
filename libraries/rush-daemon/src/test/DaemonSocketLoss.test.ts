// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { readDaemonLockfile } from '@rushstack/rush-daemon-transport';

import type { DaemonShutdownError } from '../DaemonShutdownError';
import { DAEMON_SOCKET_CHECK_INTERVAL_MS } from '../DaemonSocketWatch';
import type { GlobalCommandExecutor } from '../GlobalCommandRequestRouter';
import { RushDaemonHost } from '../RushDaemonHost';
import type { IRushDaemonHostOptions } from '../RushDaemonHost';
import { serveRushDaemonAsync } from '../serveRushDaemon';
import {
  CallbackDaemonRequestResolver,
  createDeferred,
  createWireEnvelope,
  DaemonRequestWireClient
} from './DaemonRequestWireTestUtilities';
import { TestWorkspaceSession } from './TestWorkspaceSession';

// A named pipe has no file identity, and it can't be deleted while its server runs.
const posixDescribe: jest.Describe = process.platform === 'win32' ? describe.skip : describe;
const SUCCESSOR: string = 'a successor';

posixDescribe('daemon whose socket was deleted or replaced', () => {
  let repoRoot: string;
  let logs: string[];

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-socket-loss-'));
    logs = [];
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    fs.rmSync(repoRoot, { force: true, recursive: true });
  });

  // The first check finds the change. Fake timers delay a zero-delay timeout set by a timer by 1 ms, so the idle
  // timer's expiry fires only when the clock advances again.
  async function advancePastSocketLossAsync(): Promise<void> {
    await jest.advanceTimersByTimeAsync(DAEMON_SOCKET_CHECK_INTERVAL_MS);
    expect(logs).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
  }

  // No idle timeout, so only the lost socket can end the daemon.
  function createOptions(): IRushDaemonHostOptions {
    return {
      createWorkspaceSessionAsync: () => Promise.resolve(new TestWorkspaceSession(repoRoot)),
      daemonVersion: 'socket-loss-test',
      onLog: (message: string) => logs.push(message),
      repoRoot,
      rushVersion: '5.178.1'
    };
  }

  it('stops serving once idle after its socket was deleted, and removes its lockfile', async () => {
    const ready = createDeferred<RushDaemonHost>();
    const serving: Promise<void> = serveRushDaemonAsync({
      ...createOptions(),
      onReady: (startedHost: RushDaemonHost) => ready.resolve(startedHost),
      shutdownSignal: new AbortController().signal
    });
    const host: RushDaemonHost = await ready.promise;
    const closeSpy: jest.SpyInstance = jest.spyOn(host, 'closeAsync');
    try {
      fs.rmSync(host.paths.socketPath);
      await advancePastSocketLossAsync();
      await serving;
      expect(readDaemonLockfile(host.paths.lockfilePath)).toBeUndefined();
      expect(logs).toEqual([
        `rushd: the socket ${host.paths.socketPath} was removed, so no client can connect to this daemon; ` +
          'exiting once running requests finish, so that the next client starts a new daemon',
        `rushd (PID ${process.pid}) shutting down: its socket file was deleted or replaced, so the next client ` +
          'starts a new daemon'
      ]);
      const reason: DaemonShutdownError | undefined = closeSpy.mock.calls[0][0];
      expect(reason?.initiator).toBe('socketLost');
      expect(reason?.message).toContain('(its socket file was deleted or replaced, so no new client could');
    } finally {
      await host.closeAsync();
    }
  });

  it('closes once idle after another file took its socket name, and leaves that file', async () => {
    const host: RushDaemonHost = await RushDaemonHost.startAsync(createOptions());
    try {
      fs.rmSync(host.paths.socketPath);
      fs.writeFileSync(host.paths.socketPath, SUCCESSOR);
      await advancePastSocketLossAsync();
      await host.closed;
      expect(readDaemonLockfile(host.paths.lockfilePath)).toBeUndefined();
      expect(fs.readFileSync(host.paths.socketPath, 'utf8')).toBe(SUCCESSOR);
      expect(logs).toEqual([
        expect.stringContaining(' was replaced, so no client can connect'),
        expect.stringContaining(' shutting down: its socket file was deleted or replaced')
      ]);
    } finally {
      await host.closeAsync();
      fs.rmSync(host.paths.socketPath, { force: true });
    }
  });

  it('finishes a running request before it closes', async () => {
    const executing = createDeferred<void>();
    const executed = createDeferred<void>();
    const executorAsync: GlobalCommandExecutor = async () => {
      executing.resolve();
      await executed.promise;
      return { exitCode: 0 };
    };
    const host: RushDaemonHost = await RushDaemonHost.startAsync({
      ...createOptions(),
      requestResolver: new CallbackDaemonRequestResolver(async () => ({
        kind: 'global',
        executor: executorAsync
      }))
    });
    let closed: boolean = false;
    void host.closed.then(() => (closed = true));
    const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(host.paths.socketPath);
    try {
      await client.handshakeAsync();
      await client.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('running', 'custom', repoRoot)
      });
      await executing.promise;
      fs.rmSync(host.paths.socketPath);
      await jest.advanceTimersByTimeAsync(DAEMON_SOCKET_CHECK_INTERVAL_MS * 3);
      expect(logs).toHaveLength(1);
      expect(closed).toBe(false);
      expect(readDaemonLockfile(host.paths.lockfilePath)?.pid).toBe(process.pid);
      executed.resolve();
      expect((await client.readTerminalAsync('running')).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 0 }
      });
      await jest.advanceTimersByTimeAsync(0);
      await host.closed;
      expect(readDaemonLockfile(host.paths.lockfilePath)).toBeUndefined();
    } finally {
      executed.resolve();
      await client.closeAsync();
      await host.closeAsync();
    }
  });

  it('keeps serving while its socket has its name, and stops checking when it closes', async () => {
    const host: RushDaemonHost = await RushDaemonHost.startAsync(createOptions());
    try {
      await jest.advanceTimersByTimeAsync(DAEMON_SOCKET_CHECK_INTERVAL_MS * 3);
      const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(
        host.paths.socketPath
      );
      await client.handshakeAsync();
      await client.closeAsync();
      expect(readDaemonLockfile(host.paths.lockfilePath)?.pid).toBe(process.pid);
      expect(logs).toEqual([]);
    } finally {
      await host.closeAsync();
    }
    expect(jest.getTimerCount()).toBe(0);
  });
});
