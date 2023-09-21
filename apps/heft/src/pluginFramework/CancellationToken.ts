// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A cancellation token. Can be used to signal that an ongoing process has either been cancelled
 * or timed out.
 *
 * @beta
 * @deprecated Use `AbortSignal` directly instead. https://nodejs.org/docs/latest-v16.x/api/globals.html#class-abortsignal
 */
export class CancellationToken {
  private readonly _signal: AbortSignal;

  /** @internal */
  public constructor(abortSignal: AbortSignal) {
    this._signal = abortSignal;
  }

  /**
   * Whether or not the token has been cancelled.
   */
  public get isCancelled(): boolean {
    // Returns the cancellation state if it's explicitly set, otherwise returns the cancellation
    // state from the source. If that too is not provided, the token is not cancellable.
    return this._signal.aborted;
  }

  /**
   * Obtain a promise that resolves when the token is cancelled.
   */
  public get onCancelledPromise(): Promise<void> {
    if (this.isCancelled) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this._signal.addEventListener('abort', () => resolve(), { once: true });
    });
  }
}
