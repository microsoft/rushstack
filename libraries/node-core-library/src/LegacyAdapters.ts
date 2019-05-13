// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Callback used by {@link LegacyAdapters}.
 * @beta
 */
export type callback<TResult, TError> = (error: TError | null, result: TResult) => void;

/**
 * Helper functions used when interacting with APIs that do not follow modern coding practices.
 *
 * @beta
 */
export class LegacyAdapters {
  /**
   * This function wraps a function with a callback in a promise.
   */
  public static convertCallbackToPromise<TResult, TError>(
    fn: (cb: callback<TResult, TError>) => void
  ): Promise<TResult>;
  public static convertCallbackToPromise<TResult, TError, TArg1>(
    fn: (arg1: TArg1, cb: callback<TResult, TError>) => void,
    arg1: TArg1
  ): Promise<TResult>;
  public static convertCallbackToPromise<TResult, TError, TArg1, TArg2>(
    fn: (arg1: TArg1, arg2: TArg2, cb: callback<TResult, TError>) => void,
    arg1: TArg1,
    arg2: TArg2
  ): Promise<TResult>;
  public static convertCallbackToPromise<TResult, TError, TArg1, TArg2>(
    fn: (
      a: TArg1 | callback<TResult, TError>,
      b?: TArg2 | callback<TResult, TError>,
      c?: TArg2 | callback<TResult, TError>
    ) => void,
    arg1?: TArg1,
    arg2?: TArg2
  ): Promise<TResult> {
    return new Promise((resolve: (result: TResult) => void, reject: (error: Error) => void) => {
      const cb: callback<TResult, TError> = (error: TError, result: TResult) => {
        if (error) {
          reject(LegacyAdapters.scrubError(error));
        } else {
          resolve(result);
        }
      };

      try {
        if (arg1 !== undefined && arg2 !== undefined ) {
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
  public static scrubError(error: Error | string | any): Error { // tslint:disable-line:no-any
    if (error instanceof Error) {
      return error;
    } else if (typeof error === 'string') {
      return new Error(error);
    } else {
      const errorObject: Error = new Error('An error occurred.');
      (errorObject as any).errorData = error; // tslint:disable-line:no-any
      return errorObject;
    }
  }
}
