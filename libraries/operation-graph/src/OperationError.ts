// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Encapsulates information about an error
 *
 * @beta
 */
export class OperationError extends Error {
  protected _type: string;

  public constructor(type: string, message: string) {
    super(message);

    // Manually set the prototype, as we can no longer extend built-in classes like Error, Array, Map, etc.
    // https://github.com/microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    //
    // Note: the prototype must also be set on any classes which extend this one
    Object.setPrototypeOf(this, OperationError.prototype);

    this._type = type;
  }

  public get message(): string {
    return `[${this._type}] '${super.message}'`;
  }

  public toString(): string {
    return this.message;
  }
}
