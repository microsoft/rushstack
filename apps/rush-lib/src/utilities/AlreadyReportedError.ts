// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This exception is thrown to indicate that the operation failed, but an
 * appropriate error message was already printed to the console.  The catch
 * block should not print any error.
 */
export class AlreadyReportedError extends Error {

  public constructor() {
    super('An error occurred.');

    // Manually set the prototype, as we can no longer extend built-in classes like Error, Array, Map, etc
    // tslint:disable-next-line:max-line-length
    // [https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work](https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work)
    //
    // Note: the prototype must also be set on any classes which extend this one
    (this as any).__proto__ = AlreadyReportedError.prototype; // tslint:disable-line:no-any
  }
}
