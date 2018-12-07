// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * An `Error` subclass that should be thrown to report an unexpected state, which may indicate a software bug.
 * The application may handle this error by instructing the user to report the problem to the application maintainers.
 *
 * @public
 */
export class InternalError extends Error {
  constructor(message: string) {
    super('Internal Error: ' + message);

    // Manually set the prototype, as we can no longer extend built-in classes like Error, Array, Map, etc.
    // tslint:disable-next-line:max-line-length
    // https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    //
    // Note: the prototype must also be set on any classes which extend this one
    (this as any).__proto__ = InternalError.prototype; // tslint:disable-line:no-any
  }
}
