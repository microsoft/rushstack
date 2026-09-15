// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { readDaemonLockfile } from '@rushstack/rush-daemon-transport';

import { RushDaemonHost } from '../RushDaemonHost';
import type { IRushDaemonHostOptions } from '../RushDaemonHost';
import {
  CallbackDaemonRequestResolver,
  createDeferred,
  createWireEnvelope,
  DaemonRequestWireClient
} from './DaemonRequestWireTestUtilities';
import { TestWorkspaceSession } from './TestWorkspaceSession';
import { captureTestDaemonListenerAsync } from './TestDaemonListener';
import { WorkspaceRequestResourceCleanupError } from '../WorkspaceRequestResources';
import type { GlobalCommandExecutor } from '../GlobalCommandRequestRouter';

describe('daemon shutdown ownership', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-ownership-'));
  });
  afterEach(() => fs.rmSync(repoRoot, { force: true, recursive: true }));

  function createOptions(onDispose?: () => Promise<void>): IRushDaemonHostOptions {
    return {
      createWorkspaceSessionAsync: () => Promise.resolve(new TestWorkspaceSession(repoRoot, onDispose)),
      daemonVersion: 'ownership-test',
      repoRoot,
      rushVersion: '5.178.1'
    };
  }

  it('prevents a successor from starting before the old workspace has disposed', async () => {
    const disposing = createDeferred<void>();
    const disposed = createDeferred<void>();
    const host: RushDaemonHost = await RushDaemonHost.startAsync(createOptions(async () => {
      disposing.resolve();
      await disposed.promise;
    }));
    const closing: Promise<void> = host.closeAsync();
    try {
      await disposing.promise;
      expect(readDaemonLockfile(host.paths.lockfilePath)?.pid).toBe(process.pid);
      await expect(RushDaemonHost.startAsync(createOptions())).rejects.toMatchObject({
        code: 'daemonAlreadyRunning'
      });
    } finally {
      disposed.resolve();
      await closing;
    }
    const successor: RushDaemonHost = await RushDaemonHost.startAsync(createOptions());
    await successor.closeAsync();
  });

  it('fails closed when workspace cleanup cannot complete successfully', async () => {
    const { value: host, listener } = await captureTestDaemonListenerAsync(() =>
      RushDaemonHost.startAsync(createOptions(async () => {
        throw new Error('workspace cleanup failed');
      }))
    );
    try {
      await expect(host.closeAsync()).rejects.toThrow('workspace cleanup failed');
      await host.closed;
      expect(readDaemonLockfile(host.paths.lockfilePath)?.pid).toBe(process.pid);
      if (process.platform !== 'win32') expect(fs.existsSync(host.paths.socketPath)).toBe(true);
      await expect(RushDaemonHost.startAsync(createOptions())).rejects.toMatchObject({
        code: 'daemonAlreadyRunning'
      });
    } finally {
      await listener.closeAsync();
    }
  });

  it('retains failed global-request ownership even without a native lifecycle or session failure hook', async () => {
    const { value: host, listener } = await captureTestDaemonListenerAsync(() =>
      RushDaemonHost.startAsync({
        ...createOptions(),
        requestResolver: new CallbackDaemonRequestResolver(async () => {
          const executorAsync: GlobalCommandExecutor = async (context) => {
            context.registerDisposable({
              [Symbol.asyncDispose]: async () => {
                throw new Error('global resource did not close');
              }
            });
            return { exitCode: 0 };
          };
          return { kind: 'global', executor: executorAsync };
        })
      })
    );
    const client = await DaemonRequestWireClient.connectAsync(host.paths.socketPath);
    try {
      await client.handshakeAsync();
      await client.sendControlAsync({
        kind: 'requestStart',
        payload: createWireEnvelope('global-resource-failure', 'custom', repoRoot)
      });
      expect((await client.readTerminalAsync('global-resource-failure')).terminal).toMatchObject({
        kind: 'requestResult',
        payload: { exitCode: 1, errorMessage: expect.stringContaining('global resource did not close') }
      });
      await expect(host.closeAsync()).rejects.toBeInstanceOf(WorkspaceRequestResourceCleanupError);
      await expect(host.closeAsync()).rejects.toBeInstanceOf(WorkspaceRequestResourceCleanupError);
      expect(readDaemonLockfile(host.paths.lockfilePath)?.pid).toBe(process.pid);
      await expect(RushDaemonHost.startAsync(createOptions())).rejects.toMatchObject({
        code: 'daemonAlreadyRunning'
      });
    } finally {
      await client.closeAsync();
      await listener.closeAsync();
    }
  });
});
