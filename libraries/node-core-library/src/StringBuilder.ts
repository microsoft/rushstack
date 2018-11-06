// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Allows a string to be built by appending parts.
 *
 * @beta
 */
export class StringBuilder {
  private _chunks: string[];

  public constructor() {
    this._chunks = [];
  }

  /**
   * Appends a chunk to the string.
   */
  public append(text: string): void {
    this._chunks.push(text);
  }

  /**
   * Collapses all of the appended chunks and returns the joined string.
   */
  public toString(): string {
    const joined: string = this._chunks.join('');
    this._chunks = [joined];
    return joined;
  }
}