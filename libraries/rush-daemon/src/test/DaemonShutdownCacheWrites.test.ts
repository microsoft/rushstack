// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DeferredCacheEntryWrites } from '@microsoft/rush-lib/lib/logic/buildCache/DeferredCacheEntryWrites';
import { readDaemonLockfile } from '@rushstack/rush-daemon-transport';

import { DaemonShutdownDeadlineError } from '../DaemonShutdownDeadlineError';
import { RushDaemonHost } from '../RushDaemonHost';
import type { IRushDaemonHostOptions } from '../RushDaemonHost';
import { CallbackDaemonRequestResolver, createDeferred } from './DaemonRequestWireTestUtilities';
import { captureTestDaemonListenerAsync } from './TestDaemonListener';
import { createTemporaryRepo, TemporaryRepoWorkspaceSession } from './TemporaryRepoWorkspaceSession';

describe('daemon shutdown with build cache entries that are written in the background', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-cache-writes-'));
    createTemporaryRepo(repoRoot);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(repoRoot, { force: true, recursive: true });
  });

  function createOptions(overrides: Partial<IRushDaemonHostOptions> = {}): IRushDaemonHostOptions {
    return {
      createWorkspaceSessionAsync: () => Promise.resolve(new TemporaryRepoWorkspaceSession(repoRoot)),
      daemonVersion: 'cache-writes-test',
      repoRoot,
      rushVersion: '5.178.1',
      requestResolver: new CallbackDaemonRequestResolver(() => new Promise(() => undefined)),
      ...overrides
    };
  }

  it('drops them after it disposes the workspace session and before it closes its listener', async () => {
    const events: string[] = [];
    class RecordingWorkspaceSession extends TemporaryRepoWorkspaceSession {
      public override async [Symbol.asyncDispose](): Promise<void> {
        events.push('workspace session disposed');
        await super[Symbol.asyncDispose]();
      }
    }
    const host: RushDaemonHost = await RushDaemonHost.startAsync(
      createOptions({
        createWorkspaceSessionAsync: () => Promise.resolve(new RecordingWorkspaceSession(repoRoot)),
        onLog: (message: string) => events.push(message)
      })
    );
    const isListening = (): boolean => readDaemonLockfile(host.paths.lockfilePath)?.pid === process.pid;
    const folderPath: string = fs.mkdtempSync(path.join(repoRoot, 'staging-'));
    const writeStarted = createDeferred<void>();
    DeferredCacheEntryWrites.instance.enqueue({
      cacheId: 'acme-wizard-1',
      operationName: 'acme-wizard (build)',
      sealedOutputs: { folderPath, fileCount: 1, byteCount: 1 },
      writeAsync: async (terminal, abortSignal: AbortSignal) => {
        writeStarted.resolve();
        // Like tar, which the abort signal kills
        await once(abortSignal, 'abort');
        events.push(`write aborted (listening: ${isListening()})`);
        return undefined;
      }
    });
    await writeStarted.promise;

    await host.closeAsync();
    events.push(`closed (listening: ${isListening()})`);

    expect(events).toEqual([
      expect.stringMatching(/^rushd \(PID \d+\) shutting down: /),
      'workspace session disposed',
      'write aborted (listening: true)',
      'Dropped the build cache entry acme-wizard-1 for acme-wizard (build), which was being written.',
      'closed (listening: false)'
    ]);
    expect(fs.existsSync(folderPath)).toBe(false);
  });

  it('reports a failure to drop them and still closes its listener', async () => {
    const failure: Error = new Error('Could not delete the staging folder');
    jest.spyOn(DeferredCacheEntryWrites.instance, 'abortAsync').mockRejectedValue(failure);
    const onError: jest.Mock = jest.fn();
    const host: RushDaemonHost = await RushDaemonHost.startAsync(createOptions({ onError }));

    await host.closeAsync();

    expect(onError.mock.calls).toEqual([[failure]]);
    expect(readDaemonLockfile(host.paths.lockfilePath)).toBeUndefined();
  });

  it('is cut short at its deadline while it drops them', async () => {
    jest.spyOn(DeferredCacheEntryWrites.instance, 'abortAsync').mockReturnValue(new Promise(() => undefined));
    const { value: host, listener } = await captureTestDaemonListenerAsync(() =>
      RushDaemonHost.startAsync(createOptions({ shutdownDeadlineMs: 300 }))
    );
    try {
      const error: unknown = await host.closeAsync().catch((closeError: unknown) => closeError);

      expect(error).toBeInstanceOf(DaemonShutdownDeadlineError);
      expect(error).toMatchObject({ forcedBy: undefined, stage: 'cacheWrites' });
      expect((error as Error).message).toMatch(
        /^The Rush daemon's shutdown did not finish within \d+\.\d s, while stopping the build cache writes\.$/
      );
      // The daemon still owns its endpoint.
      expect(readDaemonLockfile(host.paths.lockfilePath)?.pid).toBe(process.pid);
    } finally {
      await listener.closeAsync();
    }
  });
});
