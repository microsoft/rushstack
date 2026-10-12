// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushDaemonHost } from '../RushDaemonHost';
import { stopSuccessorAsync } from './WorkspaceLifecycleTestProcess';

/** Longer than a host's close, a successor's startup (15 s by default) and the successor's stop (15 s) together. */
const STOP_TIMEOUT_MS: number = 60_000;

const hosts: Set<RushDaemonHost> = new Set();
let fileEnded: boolean = false;

/**
 * Closes `host` once the running test ends, and stops any successor daemon that the host started.
 *
 * @remarks
 * A test that times out never reaches its own `finally`. Jest goes on to the next test while that test keeps running,
 * so its host can still start a real successor, which would run for its whole idle timeout (900 s) with its socket,
 * lockfile and log in the shared runtime directory. Jest does run `afterEach` after a timed-out test: that closes the
 * host, waits for a restart that it began, and stops the successor. A host that starts after its test file's last
 * hook is closed at once, and this rejects.
 */
export async function trackTestDaemonHostAsync(host: RushDaemonHost): Promise<void> {
  if (!fileEnded) {
    hosts.add(host);
    return;
  }
  await stopHostAsync(host);
  throw new Error('A daemon host started after its test file ended, so it was closed.');
}

async function stopHostAsync(host: RushDaemonHost): Promise<void> {
  // The test reports its own close and restart failures; this only makes sure that nothing keeps running.
  await host.closeAsync().catch(() => undefined);
  await host.restartCompleted.catch(() => undefined);
  await stopSuccessorAsync(host.paths);
}

async function stopTrackedHostsAsync(): Promise<void> {
  const stopping: Promise<void>[] = Array.from(hosts, stopHostAsync);
  hosts.clear();
  const failures: unknown[] = (await Promise.allSettled(stopping)).flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Failed to stop the daemons that a test left running.');
  }
}

afterEach(stopTrackedHostsAsync, STOP_TIMEOUT_MS);

afterAll(async () => {
  fileEnded = true;
  await stopTrackedHostsAsync();
}, STOP_TIMEOUT_MS);
