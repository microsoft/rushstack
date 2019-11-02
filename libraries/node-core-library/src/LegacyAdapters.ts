// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { sort as timsort } from 'timsort';
import * as semver from 'semver';

/**
 * Callback used by {@link LegacyAdapters}.
 * @public
 */
export type LegacyCallback<TResult, TError> = (error: TError, result: TResult) => void;

/**
 * Helper functions used when interacting with APIs that do not follow modern coding practices.
 * @public
 */
export class LegacyAdapters {
  private static _useTimsort: boolean | undefined = undefined;

  /**
   * This function wraps a function with a callback in a promise.
   */
  public static convertCallbackToPromise<TResult, TError>(
    fn: (cb: LegacyCallback<TResult, TError>) => void
  ): Promise<TResult>;
  public static convertCallbackToPromise<TResult, TError, TArg1>(
    fn: (arg1: TArg1, cb: LegacyCallback<TResult, TError>) => void,
    arg1: TArg1
  ): Promise<TResult>;
  public static convertCallbackToPromise<TResult, TError, TArg1, TArg2>(
    fn: (arg1: TArg1, arg2: TArg2, cb: LegacyCallback<TResult, TError>) => void,
    arg1: TArg1,
    arg2: TArg2
  ): Promise<TResult>;
  public static convertCallbackToPromise<TResult, TError, TArg1, TArg2, TArg3>(
    fn: (arg1: TArg1, arg2: TArg2, arg3: TArg3, cb: LegacyCallback<TResult, TError>) => void,
    arg1: TArg1,
    arg2: TArg2,
    arg3: TArg3
  ): Promise<TResult>;
  public static convertCallbackToPromise<TResult, TError, TArg1, TArg2, TArg3, TArg4>(
    fn: (arg1: TArg1, arg2: TArg2, arg3: TArg3, arg4: TArg4, cb: LegacyCallback<TResult, TError>) => void,
    arg1: TArg1,
    arg2: TArg2,
    arg3: TArg3,
    arg4: TArg4
  ): Promise<TResult>;
  public static convertCallbackToPromise<TResult, TError, TArg1, TArg2, TArg3, TArg4>(
    fn: (
      a: TArg1 | LegacyCallback<TResult, TError>,
      b?: TArg2 | LegacyCallback<TResult, TError>,
      c?: TArg3 | LegacyCallback<TResult, TError>,
      d?: TArg4 | LegacyCallback<TResult, TError>,
      e?: TArg4 | LegacyCallback<TResult, TError>
    ) => void,
    arg1?: TArg1,
    arg2?: TArg2,
    arg3?: TArg3,
    arg4?: TArg4
  ): Promise<TResult> {
    return new Promise((resolve: (result: TResult) => void, reject: (error: Error) => void) => {
      const cb: LegacyCallback<TResult, TError> = (error: TError, result: TResult) => {
        if (error) {
          reject(LegacyAdapters.scrubError(error));
        } else {
          resolve(result);
        }
      };

      try {
        if (arg1 !== undefined && arg2 !== undefined && arg3 !== undefined && arg4 !== undefined) {
          fn(arg1, arg2, arg3, arg4, cb);
        } else if (arg1 !== undefined && arg2 !== undefined && arg3 !== undefined) {
          fn(arg1, arg2, arg3, cb);
        } else if (arg1 !== undefined && arg2 !== undefined ) {
          fn(arg1, arg2, cb);
        } else if (arg1 !== undefined ) {
          fn(arg1, cb);
        } else {
          fn(cb);
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Normalizes an object into an `Error` object.
   */
  public static scrubError(error: Error | string | any): Error { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error instanceof Error) {
      return error;
    } else if (typeof error === 'string') {
      return new Error(error);
    } else {
      const errorObject: Error = new Error('An error occurred.');
      (errorObject as any).errorData = error; // eslint-disable-line @typescript-eslint/no-explicit-any
      return errorObject;
    }
  }

  /**
   * Prior to Node 11.x, the `Array.sort()` algorithm is not guaranteed to be stable.
   * If you need a stable sort, you can use the `sortStable()` as a workaround.
   *
   * @remarks
   * On NodeJS 11.x and later, this method simply calls the native `Array.sort()`.
   * For earlier versions, it uses an implementation of Timsort, which is the same algorithm used by modern NodeJS.
   */
  public static sortStable<T>(array: T[], compare?: (a: T, b: T) => number): void {
    if (LegacyAdapters._useTimsort === undefined) {
      LegacyAdapters._useTimsort = semver.major(process.versions.node) < 11;
    }
    if (LegacyAdapters._useTimsort) {
      timsort(array, compare);
    } else {
      Array.prototype.sort.call(array, compare);
    }
  }
}
