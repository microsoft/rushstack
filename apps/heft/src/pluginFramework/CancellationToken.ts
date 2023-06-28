// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';

/**
 * Options for the cancellation token.
 *
 * @internal
 */
export interface ICancellationTokenOptions {
  /**
   * A cancellation token source to use for the token.
   *
   * @internal
   */
  cancellationTokenSource?: CancellationTokenSource;

  /**
   * A static cancellation state. Mutually exclusive with `cancellationTokenSource`.
   * If true, CancellationToken.isCancelled will always return true. Otherwise,
   * CancellationToken.isCancelled will always return false.
   *
   * @internal
   */
  isCancelled?: boolean;
}

/**
 * Options for the cancellation token source.
 *
 * @beta
 */
export interface ICancellationTokenSourceOptions {
  /**
   * Amount of time in milliseconds to wait before cancelling the token.
   */
  delayMs?: number;
}

/**
 * A cancellation token. Can be used to signal that an ongoing process has either been cancelled
 * or timed out.
 *
 * @remarks This class will eventually be removed once the `AbortSignal` API is available in
 * the lowest supported LTS version of Node.js. See here for more information:
 * https://nodejs.org/docs/latest-v16.x/api/globals.html#class-abortsignal
 *
 * @beta
 */
export class CancellationToken {
  private readonly _isCancelled: boolean | undefined;
  private readonly _cancellationTokenSource: CancellationTokenSource | undefined;

  /** @internal */
  public constructor(options: ICancellationTokenOptions = {}) {
    if (options.cancellationTokenSource && options.isCancelled !== undefined) {
      throw new InternalError(
        'CancellationTokenOptions.cancellationTokenSource and CancellationTokenOptions.isCancelled ' +
          'are mutually exclusive. Specify only one.'
      );
    }

    this._cancellationTokenSource = options.cancellationTokenSource;
    this._isCancelled = options.isCancelled;
  }

  /**
   * {@inheritdoc CancellationTokenSource.isCancelled}
   */
  public get isCancelled(): boolean {
    // Returns the cancellation state if it's explicitly set, otherwise returns the cancellation
    // state from the source. If that too is not provided, the token is not cancellable.
    return this._isCancelled ?? this._cancellationTokenSource?.isCancelled ?? false;
  }

  /**
   * Obtain a promise that resolves when the token is cancelled.
   */
  public get onCancelledPromise(): Promise<void> {
    if (this._isCancelled !== undefined) {
      // If the token is explicitly set to cancelled, return a resolved promise.
      // If the token is explicitly set to not cancelled, return a promise that never resolves.
      return this._isCancelled ? Promise.resolve() : new Promise(() => {});
    } else if (this._cancellationTokenSource) {
      // Return the promise sourced from the cancellation token source
      return this._cancellationTokenSource._onCancelledPromise;
    } else {
      // Neither provided, token can never be cancelled. Return a promise that never resovles.
      return new Promise(() => {});
    }
  }
}

/**
 * A cancellation token source. Produces cancellation tokens that can be used to signal that
 * an ongoing process has either been cancelled or timed out.
 *
 * @remarks This class will eventually be removed once the `AbortController` API is available
 * in the lowest supported LTS version of Node.js. See here for more information:
 * https://nodejs.org/docs/latest-v16.x/api/globals.html#class-abortcontroller
 *
 * @beta
 */
export class CancellationTokenSource {
  private readonly _cancellationToken: CancellationToken;
  private readonly _cancellationPromise: Promise<void>;
  private _resolveCancellationPromise!: () => void;
  private _isCancelled: boolean = false;

  public constructor(options: ICancellationTokenSourceOptions = {}) {
    const { delayMs } = options;
    this._cancellationToken = new CancellationToken({ cancellationTokenSource: this });
    this._cancellationPromise = new Promise<void>((resolve) => {
      this._resolveCancellationPromise = resolve;
    });
    if (delayMs !== undefined) {
      setTimeout(() => this.cancel(), delayMs);
    }
  }

  /**
   * Whether or not the token has been cancelled.
   */
  public get isCancelled(): boolean {
    return this._isCancelled;
  }

  /**
   * Obtain the cancellation token produced by this source.
   */
  public get token(): CancellationToken {
    return this._cancellationToken;
  }

  /** @internal */
  public get _onCancelledPromise(): Promise<void> {
    return this._cancellationPromise;
  }

  /**
   * Cancel the token provided by the source.
   */
  public cancel(): void {
    this._isCancelled = true;
    this._resolveCancellationPromise();
  }
}
