// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushDaemonHost } from '../RushDaemonHost';
import type { IRushDaemonHostOptions } from '../RushDaemonHost';
import { serveRushDaemonAsync, type IRushDaemonServeOptions } from '../serveRushDaemon';

// The host never starts, so these tests bind no socket, write no lockfile, and start or signal no process.
const START_ERROR: Error = new Error('The test stops the daemon before its host starts.');
const SHUTDOWN_SIGNALS: ReadonlyArray<NodeJS.Signals> = ['SIGINT', 'SIGTERM'];

// Both shipped entry points serve without a shutdown signal, so every daemon that they start owns its process.
describe('serveRushDaemonAsync for a daemon that owns its process', () => {
  let startAsyncSpy: jest.SpyInstance<Promise<RushDaemonHost>, [IRushDaemonHostOptions]>;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    // After the daemon stops, a timer exits the process; with fake timers it never fires.
    jest.useFakeTimers();
    startAsyncSpy = jest.spyOn(RushDaemonHost, 'startAsync').mockRejectedValue(START_ERROR);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function getHostOptionsAsync(
    options: Partial<IRushDaemonServeOptions> = {}
  ): Promise<IRushDaemonHostOptions> {
    await expect(
      serveRushDaemonAsync({
        checkInstallation: () => undefined,
        daemonVersion: 'serve-defaults-test',
        getSuccessorLaunchAsync: () => Promise.reject(new Error('This test starts no successor.')),
        repoRoot: 'serve-defaults-test',
        rushVersion: '5.178.1',
        ...options
      })
    ).rejects.toBe(START_ERROR);
    expect(startAsyncSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
    return startAsyncSpy.mock.calls[0][0];
  }

  // Literals, not the exported constants: the shutdownSignal option's documentation gives both as 10 seconds.
  it('gives the host a 10 s shutdown deadline and a 10 s idle garbage collection delay', async () => {
    const hostOptions: IRushDaemonHostOptions = await getHostOptionsAsync();
    expect(hostOptions.shutdownDeadlineMs).toBe(10_000);
    expect(hostOptions.idleGarbageCollectionDelayMs).toBe(10_000);
  });

  it('keeps a shutdown deadline and an idle garbage collection delay that it was given', async () => {
    const hostOptions: IRushDaemonHostOptions = await getHostOptionsAsync({
      shutdownDeadlineMs: 1_234,
      idleGarbageCollectionDelayMs: 5_678
    });
    expect(hostOptions.shutdownDeadlineMs).toBe(1_234);
    expect(hostOptions.idleGarbageCollectionDelayMs).toBe(5_678);
  });

  it('listens for SIGINT and SIGTERM only until it stops', async () => {
    const countListeners = (): number[] => SHUTDOWN_SIGNALS.map((signal) => process.listenerCount(signal));
    const before: number[] = countListeners();
    let whileStarting: number[] | undefined;
    startAsyncSpy.mockImplementation(() => {
      whileStarting = countListeners();
      return Promise.reject(START_ERROR);
    });
    await getHostOptionsAsync();
    expect(whileStarting).toEqual(before.map((count: number) => count + 1));
    expect(countListeners()).toEqual(before);
  });
});
