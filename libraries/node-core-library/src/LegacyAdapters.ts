// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Callback used by {@link LegacyAdapters}.
 */
export type LegacyCallback<TResult, TError> = (error: TError, result: TResult) => void;

/**
 * Helper functions used when interacting with APIs that do not follow modern coding practices.
 */
export class LegacyAdapters {
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
