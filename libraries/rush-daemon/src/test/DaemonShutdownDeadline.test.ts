// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { LockFile } from '@rushstack/node-core-library';
import { readDaemonLockfile } from '@rushstack/rush-daemon-transport';

import { DaemonShutdownDeadline } from '../DaemonShutdownDeadline';
import { DaemonShutdownDeadlineError } from '../DaemonShutdownDeadlineError';
import { DaemonShutdownError } from '../DaemonShutdownError';
import { RushDaemonHost } from '../RushDaemonHost';
import type { IRushDaemonHostOptions } from '../RushDaemonHost';
import {
  CallbackDaemonRequestResolver,
  createDeferred,
  createWireEnvelope,
  DaemonRequestWireClient
} from './DaemonRequestWireTestUtilities';
import { captureTestDaemonListenerAsync } from './TestDaemonListener';
import { createTemporaryRepo, TemporaryRepoWorkspaceSession } from './TemporaryRepoWorkspaceSession';

const REQUEST_ID: string = 'waits-for-lock';
// The daemon records the process groups of its detached children on Linux only.
const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;

describe('daemon shutdown deadline', () => {
  let repoRoot: string;
  let commonTempFolder: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-deadline-'));
    commonTempFolder = createTemporaryRepo(repoRoot);
  });
  afterEach(() => fs.rmSync(repoRoot, { force: true, recursive: true }));

  function createOptions(overrides: Partial<IRushDaemonHostOptions> = {}): IRushDaemonHostOptions {
    return {
      createWorkspaceSessionAsync: () => Promise.resolve(new TemporaryRepoWorkspaceSession(repoRoot)),
      daemonVersion: 'deadline-test',
      repoRoot,
      rushVersion: '5.178.1',
      // Like a request that waits for a lock that another process holds, it ignores its abort signal.
      requestResolver: new CallbackDaemonRequestResolver(() => new Promise(() => undefined)),
      ...overrides
    };
  }

  async function startRequestAsync(host: RushDaemonHost): Promise<DaemonRequestWireClient> {
    const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(host.paths.socketPath);
    await client.handshakeAsync();
    await client.sendControlAsync({
      kind: 'requestStart',
      payload: createWireEnvelope(REQUEST_ID, 'build', repoRoot, { argv: ['build', '-t', 'mini-a'] })
    });
    // The daemon handles a connection's frames in order, so the request has started once the pong arrives.
    await client.sendControlAsync({ kind: 'ping', payload: {} });
    while ((await client.readControlAsync()).kind !== 'pong') {
      // Skip the request's own messages.
    }
    return client;
  }

  async function stopAsync(host: RushDaemonHost): Promise<void> {
    const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(host.paths.socketPath);
    await client.handshakeAsync();
    await client.sendControlAsync({ kind: 'shutdown', payload: {} });
    expect(await client.readControlAsync()).toEqual({ kind: 'shutdownAck', payload: { activeRequests: 1 } });
  }

  it('cuts a stopped daemon short, gives the request a typed result and releases on exit', async () => {
    const onError: jest.Mock = jest.fn();
    const { value: host, listener } = await captureTestDaemonListenerAsync(() =>
      RushDaemonHost.startAsync(createOptions({ onError, shutdownDeadlineMs: 300 }))
    );
    const client: DaemonRequestWireClient = await startRequestAsync(host);
    // The lock that the stuck request would hold.
    const repoLock: LockFile | undefined = LockFile.tryAcquire(commonTempFolder, 'rush');
    try {
      expect(repoLock).toBeDefined();
      await stopAsync(host);
      await host.closed;
      const error: unknown = await host.closeAsync().catch((closeError: unknown) => closeError);
      expect(error).toBeInstanceOf(DaemonShutdownDeadlineError);
      expect(error).toMatchObject({ forcedBy: undefined, stage: 'requests' });
      expect((error as DaemonShutdownDeadlineError).unfinishedRequests).toEqual([
        expect.stringMatching(/^"build -t mini-a" \(running for \d+\.\d s\)$/)
      ]);
      expect((error as Error).message).toMatch(
        /^The Rush daemon's shutdown did not finish within \d+\.\d s, while waiting for requests to finish\. Unfinished requests: "build -t mini-a" \(running for \d+\.\d s\)\.$/
      );
      expect(onError).not.toHaveBeenCalled();
      // The shutdown was cut short, so the daemon still owns its endpoint and the repository lock.
      expect(readDaemonLockfile(host.paths.lockfilePath)?.pid).toBe(process.pid);
      if (process.platform !== 'win32') expect(fs.existsSync(host.paths.socketPath)).toBe(true);

      // The request never finishes, so its connection's drain times out and the client gets a typed result.
      expect((await client.readTerminalAsync(REQUEST_ID)).terminal).toEqual({
        kind: 'requestResult',
        payload: {
          aborted: true,
          errorMessage:
            'The Rush daemon was shut down (requested by "rush-client daemon stop" or "daemon restart") ' +
            'while this request was running; re-run the command.',
          exitCode: 1,
          outcome: 'failure',
          requestId: REQUEST_ID
        }
      });
      await client.closed;

      expect(host.releaseForExit()).toBe(true);
      expect(readDaemonLockfile(host.paths.lockfilePath)).toBeUndefined();
      if (process.platform !== 'win32') {
        expect(fs.existsSync(host.paths.socketPath)).toBe(false);
        expect(fs.existsSync(LockFile.getLockFilePath(commonTempFolder, 'rush'))).toBe(false);
      }
    } finally {
      repoLock?.release();
      await client.closeAsync();
      await listener.closeAsync();
    }
  }, 20000);

  linuxIt(
    'keeps its files and the repository lock while a recorded child runs',
    async () => {
      const { value: host, listener } = await captureTestDaemonListenerAsync(() =>
        RushDaemonHost.startAsync(createOptions({ shutdownDeadlineMs: 300 }))
      );
      const client: DaemonRequestWireClient = await startRequestAsync(host);
      const repoLock: LockFile | undefined = LockFile.tryAcquire(commonTempFolder, 'rush');
      const repoLockPath: string = LockFile.getLockFilePath(commonTempFolder, 'rush');
      // Like an operation of the stuck request: detached, so the daemon records its group while it runs.
      const operation: ChildProcess = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
        detached: true,
        stdio: 'ignore'
      });
      try {
        await once(operation, 'spawn');
        expect(repoLock).toBeDefined();
        await stopAsync(host);
        await host.closed;
        await expect(host.closeAsync()).rejects.toBeInstanceOf(DaemonShutdownDeadlineError);

        // A successor must reap the child first, so everything stays, as after a crash.
        expect(host.releaseForExit()).toBe(false);
        expect(readDaemonLockfile(host.paths.lockfilePath)?.pid).toBe(process.pid);
        expect(fs.existsSync(host.paths.socketPath)).toBe(true);
        expect(fs.existsSync(repoLockPath)).toBe(true);

        operation.kill('SIGKILL');
        await once(operation, 'exit');
        expect(host.releaseForExit()).toBe(true);
        expect(readDaemonLockfile(host.paths.lockfilePath)).toBeUndefined();
        expect(fs.existsSync(host.paths.socketPath)).toBe(false);
        expect(fs.existsSync(repoLockPath)).toBe(false);
      } finally {
        if (operation.exitCode === null && operation.signalCode === null) operation.kill('SIGKILL');
        repoLock?.release();
        await client.closeAsync();
        await listener.closeAsync();
      }
    },
    20000
  );

  it('cuts a running shutdown short when it is expired, as a second signal does', async () => {
    const { value: host, listener } = await captureTestDaemonListenerAsync(() =>
      RushDaemonHost.startAsync(createOptions())
    );
    const client: DaemonRequestWireClient = await startRequestAsync(host);
    try {
      const closing: Promise<void> = host.closeAsync(
        new DaemonShutdownError({ initiator: 'signal', signal: 'SIGTERM' })
      );
      host.expireShutdownDeadline('a second SIGTERM');
      await expect(closing).rejects.toThrow(
        /^The Rush daemon's shutdown was cut short by a second SIGTERM after \d+\.\d s, while waiting for requests to finish\. Unfinished requests: "build -t mini-a"/
      );
      await expect(closing).rejects.toMatchObject({ forcedBy: 'a second SIGTERM', stage: 'requests' });
    } finally {
      await client.closeAsync();
      await listener.closeAsync();
    }
  });

  it('does not change a shutdown that finishes in time', async () => {
    const host: RushDaemonHost = await RushDaemonHost.startAsync(
      createOptions({ shutdownDeadlineMs: 10000 })
    );
    await host.closeAsync();
    await host.closed;
    expect(readDaemonLockfile(host.paths.lockfilePath)).toBeUndefined();
  });
});

describe(DaemonShutdownDeadline.name, () => {
  function createDeadline(
    timeoutMs: number | undefined,
    onLateFailure: jest.Mock = jest.fn()
  ): DaemonShutdownDeadline {
    return new DaemonShutdownDeadline({
      timeoutMs,
      getProgress: () => ({ stage: 'workspaceSession', unfinishedRequests: [] }),
      onLateFailure
    });
  }

  it('settles as the cleanup does when it finishes in time', async () => {
    await expect(createDeadline(10000).raceAsync(Promise.resolve())).resolves.toBeUndefined();
    const failure: Error = new Error('cleanup failed');
    await expect(createDeadline(10000).raceAsync(Promise.reject(failure))).rejects.toBe(failure);
  });

  it('rejects at the deadline and reports a cleanup that fails later', async () => {
    const onLateFailure: jest.Mock = jest.fn();
    const cleanup = createDeferred<void>();
    const failing: Promise<void> = cleanup.promise.then(() => {
      throw new Error('late failure');
    });
    await expect(createDeadline(10, onLateFailure).raceAsync(failing)).rejects.toMatchObject({
      forcedBy: undefined,
      stage: 'workspaceSession',
      message: expect.stringMatching(
        /^The Rush daemon's shutdown did not finish within \d+\.\d s, while disposing the workspace session\.$/
      )
    });
    cleanup.resolve();
    await failing.catch(() => undefined);
    expect(onLateFailure).toHaveBeenCalledWith(new Error('late failure'));
  });

  it('is cut short by expire(), also when that comes before the shutdown starts', async () => {
    const running: DaemonShutdownDeadline = createDeadline(undefined);
    const racing: Promise<void> = running.raceAsync(new Promise(() => undefined));
    running.expire('a second SIGINT');
    await expect(racing).rejects.toMatchObject({ forcedBy: 'a second SIGINT' });

    const early: DaemonShutdownDeadline = createDeadline(undefined);
    early.expire('a second SIGTERM');
    early.expire('a third SIGTERM');
    await expect(early.raceAsync(new Promise(() => undefined))).rejects.toMatchObject({
      forcedBy: 'a second SIGTERM'
    });
  });
});
