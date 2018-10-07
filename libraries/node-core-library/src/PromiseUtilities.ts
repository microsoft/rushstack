// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export type callback<TResult, TError> = (error: TError, result: TResult) => void;

/**
 * This is a set of utilities for constructing and interacting with promises.
 *
 * @beta
 */
export class PromiseUtilities {
  /**
   * This function wraps a function with a callback in a promise.
   */
  public static promiseify<TResult, TError>(
    fn: (cb: callback<TResult, TError>) => void
  ): Promise<TResult>;
  public static promiseify<TResult, TError, TArg1>(
    fn: (arg1: TArg1, cb: callback<TResult, TError>) => void,
    arg1: TArg1
  ): Promise<TResult>;
  public static promiseify<TResult, TError, TArg1, TArg2>(
    fn: (arg1: TArg1, arg2: TArg2, cb: callback<TResult, TError>) => void,
    arg1: TArg1,
    arg2: TArg2
  ): Promise<TResult>;
  public static promiseify<TResult, TError, TArg1, TArg2>(
    fn: (
      a: TArg1 | callback<TResult, TError>,
      b?: TArg2 | callback<TResult, TError>,
      c?: TArg2 | callback<TResult, TError>
    ) => void,
    arg1?: TArg1,
    arg2?: TArg2
  ): Promise<TResult> {
    return new Promise((resolve: (result: TResult) => void, reject: (error: TError) => void) => {
      const cb: callback<TResult, TError> = (error: TError, result: TResult) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      };

      try {
        if (arg1 && arg2) {
          fn(arg1, arg2, cb);
        } else if (arg1) {
          fn(arg1, cb);
        } else {
          fn(cb);
        }
      } catch (e) {
        reject(e);
      }
    });
  }
}
