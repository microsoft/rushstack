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
   * If true, CancellationToken.isCancellationRequested will always return true. Otherwise,
   * CancellationToken.isCancellationRequested will always return false.
   *
   * @internal
   */
  isCancelled?: boolean;
}

/**
 * Options for the cancellation token source.
 *
 * @public
 */
export interface ICancellationTokenSourceOptions {
  /**
   * Amount of time in milliseconds to wait before cancelling the token.
   *
   * @public
   */
  delayMs?: number;
}

/**
 * A cancellation token. Can be used to signal that an ongoing process has either been cancelled
 * or timed out.
 *
 * @public
 */
export class CancellationToken {
  private readonly _isCancellationRequested: boolean | undefined;
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
    this._isCancellationRequested = options.isCancelled;
  }

  /**
   * {@inheritdoc CancellationTokenSource.isCancellationRequested}
   */
  public get isCancellationRequested(): boolean {
    // Returns the cancellation state if it's explicitly set, otherwise returns the cancellation
    // state from the source. If that too is not provided, the token is not cancellable.
    return this._isCancellationRequested ?? this._cancellationTokenSource?.isCancellationRequested ?? false;
  }

  /**
   * Obtain a promise that resolves when the token is cancelled.
   *
   * @public
   */
  public get promise(): Promise<void> {
    if (this._isCancellationRequested !== undefined) {
      // If the token is explicitly set to cancelled, return a resolved promise.
      // If the token is explicitly set to not cancelled, return a promise that never resolves.
      return this._isCancellationRequested ? Promise.resolve() : new Promise(() => {});
    } else if (this._cancellationTokenSource) {
      // Return the promise sourced from the cancellation token source
      return this._cancellationTokenSource._promise;
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
 * @public
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
   *
   * @public
   */
  public get isCancellationRequested(): boolean {
    return this._isCancelled;
  }

  /**
   * Obtain the cancellation token produced by this source.
   *
   * @public
   */
  public get token(): CancellationToken {
    return this._cancellationToken;
  }

  /** @internal */
  public get _promise(): Promise<void> {
    return this._cancellationPromise;
  }

  /**
   * Cancel the token provided by the source.
   *
   * @public
   */
  public cancel(): void {
    this._isCancelled = true;
    this._resolveCancellationPromise();
  }
}
