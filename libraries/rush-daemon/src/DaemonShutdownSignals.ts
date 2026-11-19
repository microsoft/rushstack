// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonShutdownError } from './DaemonShutdownError';

/** The part of `process` that {@link listenForShutdownSignals} uses. */
export interface IShutdownSignalEmitter {
  on(event: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): unknown;
  off(event: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): unknown;
}

/** Options for {@link listenForShutdownSignals}. */
export interface IShutdownSignalsOptions {
  readonly emitter: IShutdownSignalEmitter;
  /** Called for each termination signal after the first one, such as a second Ctrl+C. */
  readonly onForce: (signal: NodeJS.Signals) => void;
  readonly getNowMs?: () => number;
}

/** The shutdown signal of a daemon that owns its process. */
export interface IShutdownSignals {
  /** Aborted by the first SIGINT or SIGTERM, with a {@link DaemonShutdownError}. */
  readonly signal: AbortSignal;
  readonly dispose: () => void;
}

const SHUTDOWN_SIGNALS: ReadonlyArray<NodeJS.Signals> = ['SIGINT', 'SIGTERM'];
// SubprocessTerminator's listener kills the tracked child processes, removes itself and sends the first signal to
// this process again, which arrives within a moment. That copy does not ask to force the shutdown.
const RELAY_WINDOW_MS: number = 1000;

/**
 * Listens for SIGINT and SIGTERM until disposed. The first one requests a clean shutdown. Each later one calls
 * `onForce`, so that the daemon can exit even when its shutdown does not finish, except for one copy of the first
 * signal that arrives within a second, which SubprocessTerminator sends.
 */
export function listenForShutdownSignals(options: IShutdownSignalsOptions): IShutdownSignals {
  const { emitter, onForce, getNowMs = Date.now } = options;
  const controller: AbortController = new AbortController();
  let relay: { readonly signal: NodeJS.Signals; readonly deadlineMs: number } | undefined;
  const onSignal: (signal: NodeJS.Signals) => void = (signal: NodeJS.Signals) => {
    if (!controller.signal.aborted) {
      relay = { signal, deadlineMs: getNowMs() + RELAY_WINDOW_MS };
      controller.abort(new DaemonShutdownError({ initiator: 'signal', signal }));
      return;
    }
    const isRelay: boolean = relay?.signal === signal && getNowMs() <= relay.deadlineMs;
    relay = undefined;
    if (!isRelay) onForce(signal);
  };
  for (const name of SHUTDOWN_SIGNALS) emitter.on(name, onSignal);
  return {
    signal: controller.signal,
    dispose: () => {
      for (const name of SHUTDOWN_SIGNALS) emitter.off(name, onSignal);
    }
  };
}
