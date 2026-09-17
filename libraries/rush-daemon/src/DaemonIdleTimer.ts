// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const MILLISECONDS_PER_SECOND: number = 1000;
const MAX_TIMER_DELAY_MS: number = 0x7fffffff;

/** Tracks request lifetimes, including resolution, queueing, output drain, and cleanup. */
export class DaemonIdleTimer implements Disposable {
  readonly #delayMs: number | undefined;
  #activeRequests: number = 0;
  #onIdle: (() => void) | undefined;
  #timer: NodeJS.Timeout | undefined;

  public constructor(idleTimeoutSeconds: number | undefined) {
    if (
      idleTimeoutSeconds !== undefined &&
      (!Number.isFinite(idleTimeoutSeconds) ||
        idleTimeoutSeconds <= 0 ||
        idleTimeoutSeconds > MAX_TIMER_DELAY_MS / MILLISECONDS_PER_SECOND)
    ) {
      throw new RangeError(
        `idleTimeoutSeconds must be greater than zero and at most ${MAX_TIMER_DELAY_MS / MILLISECONDS_PER_SECOND}.`
      );
    }
    this.#delayMs =
      idleTimeoutSeconds === undefined ? undefined : idleTimeoutSeconds * MILLISECONDS_PER_SECOND;
  }

  public start(onIdle: () => void): void {
    this.#onIdle = onIdle;
    this.#schedule();
  }

  public acquire(): () => void {
    this.#activeRequests++;
    clearTimeout(this.#timer);
    let released: boolean = false;
    return () => {
      if (released) return;
      released = true;
      this.#activeRequests--;
      this.#schedule();
    };
  }

  public [Symbol.dispose](): void {
    this.#onIdle = undefined;
    clearTimeout(this.#timer);
  }

  #schedule(): void {
    clearTimeout(this.#timer);
    if (this.#activeRequests !== 0 || !this.#onIdle || this.#delayMs === undefined) return;
    this.#timer = setTimeout(this.#onIdle, this.#delayMs);
    this.#timer.unref();
  }
}
