// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

interface ICapture<TValue> {
  readonly running: Promise<TValue>;
  next: Promise<TValue> | undefined;
}

function ignore(): void {}

/**
 * Shares workspace input captures between concurrent requests, without ever giving a caller a capture that
 * began before the caller asked for one.
 *
 * @remarks
 * A capture reads the workspace while it runs, so a capture that is already running can miss a change made just
 * before a later caller arrived. A caller that finds a capture running therefore waits for the next capture,
 * which starts when the running one settles and is shared by every caller that arrived in the meantime.
 * Concurrent callers cost at most two captures instead of one each, and every caller receives a result that is
 * at least as fresh as a capture it started itself. Nothing is retained once a capture settles.
 *
 * Callers that pass the same scope and key must request the same capture.
 */
export class FreshCaptureCoalescer<TScope extends object, TValue> {
  readonly #captures: WeakMap<TScope, Map<string, ICapture<TValue>>> = new WeakMap();

  public captureAsync(scope: TScope, key: string, captureAsync: () => Promise<TValue>): Promise<TValue> {
    const capture: ICapture<TValue> | undefined = this.#captures.get(scope)?.get(key);
    if (!capture) return this.#start(scope, key, captureAsync);
    capture.next ??= capture.running.then(ignore, ignore).then(() => this.#start(scope, key, captureAsync));
    return capture.next;
  }

  #start(scope: TScope, key: string, captureAsync: () => Promise<TValue>): Promise<TValue> {
    let captures: Map<string, ICapture<TValue>> | undefined = this.#captures.get(scope);
    if (!captures) {
      captures = new Map();
      this.#captures.set(scope, captures);
    }
    const running: Promise<TValue> = new Promise<TValue>((resolve) => resolve(captureAsync()));
    const capture: ICapture<TValue> = { running, next: undefined };
    captures.set(key, capture);
    const forget: () => void = () => {
      if (captures.get(key) === capture) captures.delete(key);
    };
    running.then(forget, forget);
    return running;
  }
}
