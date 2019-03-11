// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * An interface for a builder object that allows a large text string to be constructed incrementally by appending
 * small chunks.
 *
 * @remarks
 *
 * {@link StringBuilder} is the default implementation of this contract.
 *
 * @public
 */
export interface IStringBuilder {
  /**
   * Append the specified text to the buffer.
   */
  append(text: string): void;

  /**
   * Returns a single string containing all the text that was appended to the buffer so far.
   *
   * @remarks
   *
   * This is a potentially expensive operation.
   */
  toString(): string;
}

/**
 * This class allows a large text string to be constructed incrementally by appending small chunks.  The final
 * string can be obtained by calling StringBuilder.toString().
 *
 * @remarks
 * A naive approach might use the `+=` operator to append strings:  This would have the downside of copying
 * the entire string each time a chunk is appended, resulting in `O(n^2)` bytes of memory being allocated
 * (and later freed by the garbage  collector), and many of the allocations could be very large objects.
 * StringBuilder avoids this overhead by accumulating the chunks in an array, and efficiently joining them
 * when `getText()` is finally called.
 *
 * @public
 */
export class StringBuilder implements IStringBuilder {
  private _chunks: string[];

  constructor() {
    this._chunks = [];
  }

  /** {@inheritDoc IStringBuilder.append} */
  public append(text: string): void {
    this._chunks.push(text);
  }

  /** {@inheritDoc IStringBuilder.toString} */
  public toString(): string {
    if (this._chunks.length === 0) {
      return '';
    }

    if (this._chunks.length > 1) {
      const joined: string = this._chunks.join('');
      this._chunks.length = 1;
      this._chunks[0] = joined;
    }

    return this._chunks[0];
  }
}
