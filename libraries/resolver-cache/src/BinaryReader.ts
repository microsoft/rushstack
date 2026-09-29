// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A forward-only cursor over a buffer produced by `BinaryWriter`.
 *
 * @internal
 */
export class BinaryReader {
  readonly #buffer: Uint8Array;
  #offset: number;

  public constructor(buffer: Uint8Array) {
    this.#buffer = buffer;
    this.#offset = 0;
  }

  /**
   * The current read position.
   */
  public get offset(): number {
    return this.#offset;
  }

  /**
   * True if every byte has been consumed.
   */
  public get atEnd(): boolean {
    return this.#offset >= this.#buffer.length;
  }

  #require(additionalBytes: number): void {
    if (this.#offset + additionalBytes > this.#buffer.length) {
      throw new Error(
        `Unexpected end of buffer: needed ${additionalBytes} byte(s) at offset ${this.#offset} ` +
          `but only ${this.#buffer.length - this.#offset} remain`
      );
    }
  }

  /**
   * Reads a varint that describes how many items follow, rejecting values that could not possibly
   * be satisfied by the remaining bytes.
   *
   * @remarks
   * Decoders frequently preallocate storage from a count, so an implausible count read from a
   * corrupt or hostile file would otherwise request an arbitrarily large allocation before the
   * first missing byte is noticed.
   *
   * @param minimumBytesPerItem - The smallest number of bytes any single item can occupy.
   */
  public readCount(minimumBytesPerItem: number): number {
    const count: number = this.readVarint();
    const maximumCount: number = Math.floor(
      (this.#buffer.length - this.#offset) / Math.max(minimumBytesPerItem, 1)
    );
    if (count > maximumCount) {
      throw new Error(
        `Declared item count ${count} exceeds the ${maximumCount} item(s) that the remaining ` +
          `${this.#buffer.length - this.#offset} byte(s) could contain`
      );
    }
    return count;
  }

  /**
   * Reads a single byte.
   */
  public readUint8(): number {
    this.#require(1);
    return this.#buffer[this.#offset++];
  }

  /**
   * Reads a 16-bit little-endian integer.
   */
  public readUint16(): number {
    this.#require(2);
    const value: number = this.#buffer[this.#offset] | (this.#buffer[this.#offset + 1] << 8);
    this.#offset += 2;
    return value;
  }

  /**
   * Reads an unsigned LEB128 variable-length integer.
   */
  public readVarint(): number {
    let result: number = 0;
    let scale: number = 1;
    for (;;) {
      const byte: number = this.readUint8();
      result += (byte & 0x7f) * scale;
      if ((byte & 0x80) === 0) {
        break;
      }
      scale *= 0x80;
      if (!Number.isSafeInteger(result + scale)) {
        throw new RangeError('Varint exceeds the safe integer range');
      }
    }
    return result;
  }

  /**
   * Reads a zigzag-encoded signed integer.
   */
  public readSignedVarint(): number {
    const raw: number = this.readVarint();
    return raw % 2 === 0 ? raw / 2 : -(raw + 1) / 2;
  }

  /**
   * Reads `byteLength` raw bytes. The result is a view over the original buffer, not a copy.
   */
  public readBytes(byteLength: number): Uint8Array {
    this.#require(byteLength);
    const bytes: Uint8Array = this.#buffer.subarray(this.#offset, this.#offset + byteLength);
    this.#offset += byteLength;
    return bytes;
  }

  /**
   * Reads a varint byte length followed by that many bytes.
   */
  public readLengthPrefixedBytes(): Uint8Array {
    return this.readBytes(this.readVarint());
  }
}
