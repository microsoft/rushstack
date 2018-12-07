// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * An `Error` subclass that should be thrown to report an unexpected state that may indicate a software defect.
 * An application may handle this error by instructing the end user to report an issue to the application maintainers.
 *
 * @remarks
 * Do not use this class unless you intend to solicit bug reports from end users.
 *
 * @public
 */
export class InternalError extends Error {
  /**
   * The underlying error message, without the additional boilerplate for an `InternalError`.
   */
  public readonly unformattedMessage: string;

  private static _formatMessage(unformattedMessage: string): string {
    return `Internal Error: ${unformattedMessage}\n\nYou have encountered a software defect. Please consider`
      + `reporting the issue to the maintainers of this application.`;
  }

  /**
   * Constructs a new instance of the {@link InternalError} class.
   *
   * @param message - A message describing the error.  This will be assigned to
   * {@link InternalError.unformattedMessage}.  The `Error.message` field will have additional boilerplate
   * explaining that the user has encountered a software defect.
   */
  constructor(message: string) {
    super(InternalError._formatMessage(message));

    // Manually set the prototype, as we can no longer extend built-in classes like Error, Array, Map, etc.
    // tslint:disable-next-line:max-line-length
    // https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    //
    // Note: the prototype must also be set on any classes which extend this one
    (this as any).__proto__ = InternalError.prototype; // tslint:disable-line:no-any

    this.unformattedMessage = message;
  }

  /** @override */
  public toString(): string {
    return this.message; // Avoid adding the "Error:" prefix
  }
}
