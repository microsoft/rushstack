// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

interface ICapture<TValue> {
  readonly startTimeMs: number;
  readonly running: Promise<TValue>;
  next: Promise<TValue> | undefined;
}

/**
 * Options for {@link FreshCaptureCoalescer}.
 */
export interface IFreshCaptureCoalescerOptions {
  /**
   * Returns the current time on the clock that callers use for `notBeforeMs`. Defaults to `performance.now()`.
   */
  readonly now?: () => number;
}

function ignore(): void {}

/**
 * Shares workspace input captures between concurrent requests, without ever giving a caller a capture that
 * began before the caller asked for one, or before the time that the caller passes as `notBeforeMs`.
 *
 * @remarks
 * A capture reads the workspace while it runs, so a capture that is already running can miss a change made just
 * before a later caller arrived. A caller that finds a capture running therefore waits for the next capture,
 * which starts when the running one settles and is shared by every caller that arrived in the meantime.
 * Concurrent callers cost at most two captures instead of one each, and every caller receives a result that is
 * at least as fresh as a capture it started itself. Nothing is retained once a capture settles.
 *
 * A caller that knows an earlier time after which every change it depends on was made, such as the time at which
 * the daemon received its request, can pass that time as `notBeforeMs`. It then shares a running capture that
 * started at or after that time instead of waiting for the next one.
 *
 * Callers that pass the same scope and key must request the same capture.
 */
export class FreshCaptureCoalescer<TScope extends object, TValue> {
  readonly #captures: WeakMap<TScope, Map<string, ICapture<TValue>>> = new WeakMap();
  readonly #now: () => number;

  public constructor(options: IFreshCaptureCoalescerOptions = {}) {
    this.#now = options.now ?? (() => performance.now());
  }

  /**
   * Returns a capture that started after this call, or at or after `notBeforeMs` if it is specified.
   *
   * @param scope - Captures are shared only within a scope.
   * @param key - Identifies the capture within the scope.
   * @param captureAsync - Starts a capture when the caller cannot share one.
   * @param notBeforeMs - A time on this coalescer's clock. A running capture that started at or after this time is
   * shared with the caller. If it is not specified, the caller shares only a capture that starts after this call.
   */
  public captureAsync(
    scope: TScope,
    key: string,
    captureAsync: () => Promise<TValue>,
    notBeforeMs?: number
  ): Promise<TValue> {
    const capture: ICapture<TValue> | undefined = this.#captures.get(scope)?.get(key);
    if (!capture) return this.#start(scope, key, captureAsync);
    if (notBeforeMs !== undefined && capture.startTimeMs >= notBeforeMs) return capture.running;
    capture.next ??= capture.running.then(ignore, ignore).then(() => this.#start(scope, key, captureAsync));
    return capture.next;
  }

  #start(scope: TScope, key: string, captureAsync: () => Promise<TValue>): Promise<TValue> {
    let captures: Map<string, ICapture<TValue>> | undefined = this.#captures.get(scope);
    if (!captures) {
      captures = new Map();
      this.#captures.set(scope, captures);
    }
    const startTimeMs: number = this.#now();
    const running: Promise<TValue> = new Promise<TValue>((resolve) => resolve(captureAsync()));
    const capture: ICapture<TValue> = { startTimeMs, running, next: undefined };
    captures.set(key, capture);
    const forget: () => void = () => {
      if (captures.get(key) === capture) captures.delete(key);
    };
    running.then(forget, forget);
    return running;
  }
}
