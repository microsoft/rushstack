// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** One connection that the daemon accepted, until it sends its first request or starts closing. */
export interface IConnectingClient {
  /** Records that the daemon read a frame from the connection or finished writing one to it. */
  touch(): void;
  /** Stops tracking the connection, because it sent its first request or is closing. */
  settle(): void;
}

/** Options for {@link ConnectingClientTracker}. */
export interface IConnectingClientTrackerOptions {
  /** How long after its latest activity a connection still counts as connecting. */
  readonly idleLimitMs?: number;
  /** The longest that one call to {@link ConnectingClientTracker.waitAsync} waits. */
  readonly waitLimitMs?: number;
}

// A client sends its next handshake frame as soon as it reads the daemon's reply, so a connection that neither sent
// a frame nor got one for this long is not about to send a request.
const DEFAULT_IDLE_LIMIT_MS: number = 100;
// What a batch of shared builds may spend waiting before its reconcile, so that a stalled client costs little.
const DEFAULT_WAIT_LIMIT_MS: number = 100;

/**
 * Tracks the connections that the daemon accepted and that have not sent a request yet, so that a batch of shared
 * builds can wait for their requests before its input reconcile starts.
 *
 * @remarks
 * A client exchanges hello, subscribe and ping with the daemon before it sends its request. Each exchange waits
 * while the daemon is busy, for example preparing another request, so a client that connected before a batch
 * closed can send its request after the batch's reconcile started. That request cannot join the batch; it waits for
 * the batch to finish, then reconciles again. Waiting for such clients first lets their requests join the batch.
 */
export class ConnectingClientTracker {
  readonly #idleLimitMs: number;
  readonly #waitLimitMs: number;
  readonly #lastActivityTimeMs: Map<IConnectingClient, number> = new Map();
  readonly #waiters: Set<() => void> = new Set();

  public constructor(options: IConnectingClientTrackerOptions = {}) {
    this.#idleLimitMs = options.idleLimitMs ?? DEFAULT_IDLE_LIMIT_MS;
    this.#waitLimitMs = options.waitLimitMs ?? DEFAULT_WAIT_LIMIT_MS;
  }

  /** Starts tracking a connection that the daemon has just accepted. */
  public add(): IConnectingClient {
    const client: IConnectingClient = {
      touch: () => {
        if (this.#lastActivityTimeMs.has(client)) {
          this.#lastActivityTimeMs.set(client, performance.now());
        }
      },
      settle: () => {
        if (this.#lastActivityTimeMs.delete(client)) {
          for (const wake of Array.from(this.#waiters)) wake();
        }
      }
    };
    this.#lastActivityTimeMs.set(client, performance.now());
    return client;
  }

  /**
   * Resolves once no tracked connection had activity within the idle limit, or once the wait limit has passed.
   *
   * @remarks
   * It first lets the event loop poll for I/O, which accepts the connections that wait in the listening socket's
   * backlog, so that they are tracked too. Before it decides that a connection is idle, it lets the event loop poll
   * again, so that frames that arrived while the daemon was busy are read first, and replies that waited for the
   * event loop finish writing first.
   */
  public async waitAsync(): Promise<void> {
    await waitForPollAsync();
    const deadlineMs: number = performance.now() + this.#waitLimitMs;
    for (;;) {
      const nowMs: number = performance.now();
      const idleTimeMs: number | undefined = this.#getIdleTimeMs();
      if (idleTimeMs === undefined || idleTimeMs <= nowMs || deadlineMs <= nowMs) {
        return;
      }
      await this.#waitForSettleAsync(Math.min(idleTimeMs, deadlineMs) - nowMs);
      if (this.#lastActivityTimeMs.size > 0) {
        await waitForPollAsync();
      }
    }
  }

  /** When the tracked connection with the latest frame becomes idle, or undefined if none is tracked. */
  #getIdleTimeMs(): number | undefined {
    let latestMs: number | undefined;
    for (const timeMs of this.#lastActivityTimeMs.values()) {
      if (latestMs === undefined || timeMs > latestMs) {
        latestMs = timeMs;
      }
    }
    return latestMs === undefined ? undefined : latestMs + this.#idleLimitMs;
  }

  /** Resolves when a tracked connection settles or after `timeoutMs`, whichever comes first. */
  async #waitForSettleAsync(timeoutMs: number): Promise<void> {
    let wake: () => void = () => undefined;
    const woken: Promise<void> = new Promise<void>((resolve) => {
      wake = resolve;
    });
    this.#waiters.add(wake);
    const timeout: ReturnType<typeof setTimeout> = setTimeout(wake, timeoutMs);
    try {
      await woken;
    } finally {
      clearTimeout(timeout);
      this.#waiters.delete(wake);
    }
  }
}

/** Resolves after the event loop has polled for I/O at least once since the call. */
async function waitForPollAsync(): Promise<void> {
  // Called while the event loop handles I/O, the first immediate runs before the loop polls again, so the poll that
  // it follows can have started before the call. The second immediate follows a poll that started after it.
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}
