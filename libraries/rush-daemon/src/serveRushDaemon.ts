// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushDaemonHost } from './RushDaemonHost';
import type { IRushDaemonHostOptions } from './RushDaemonHost';

/**
 * Options for the daemon serve lifecycle.
 *
 * @beta
 */
export interface IRushDaemonServeOptions extends IRushDaemonHostOptions {
  /** Called after the listener is bound and the lockfile is available. */
  readonly onReady?: (host: RushDaemonHost) => void | Promise<void>;
  /** Requests a clean shutdown. Process signals are used when omitted. */
  readonly shutdownSignal?: AbortSignal;
}

/**
 * Starts a daemon host, signals readiness, and serves until shutdown is requested.
 *
 * @beta
 */
export async function serveRushDaemonAsync(options: IRushDaemonServeOptions): Promise<void> {
  const signalRegistration: IShutdownSignalRegistration = options.shutdownSignal
    ? { signal: options.shutdownSignal, dispose: () => undefined }
    : createProcessShutdownSignal();
  let host: RushDaemonHost | undefined;
  try {
    host = await RushDaemonHost.startAsync(options);
    await options.onReady?.(host);
    await waitForAbortAsync(signalRegistration.signal);
  } finally {
    signalRegistration.dispose();
    await host?.closeAsync();
  }
}

interface IShutdownSignalRegistration {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
}

function createProcessShutdownSignal(): IShutdownSignalRegistration {
  const controller: AbortController = new AbortController();
  const onSignal: () => void = () => controller.abort();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  return {
    signal: controller.signal,
    dispose: () => {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    }
  };
}

function waitForAbortAsync(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve: () => void) => signal.addEventListener('abort', () => resolve(), { once: true }));
}
