// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A growable buffer that supports appending LEB128 variable-length integers.
 *
 * @remarks
 * The resolver cache format is designed for a single linear pass in both directions, so this
 * writer deliberately offers no seek or patch operations.
 *
 * @internal
 */
export class BinaryWriter {
  #buffer: Uint8Array;
  #length: number;

  public constructor(initialCapacity: number = 1024) {
    this.#buffer = new Uint8Array(initialCapacity);
    this.#length = 0;
  }

  /**
   * The number of bytes written so far.
   */
  public get length(): number {
    return this.#length;
  }

  #ensure(additionalBytes: number): void {
    const required: number = this.#length + additionalBytes;
    if (required <= this.#buffer.length) {
      return;
    }

    let capacity: number = this.#buffer.length * 2;
    while (capacity < required) {
      capacity *= 2;
    }

    const replacement: Uint8Array = new Uint8Array(capacity);
    replacement.set(this.#buffer.subarray(0, this.#length));
    this.#buffer = replacement;
  }

  /**
   * Appends a single byte.
   */
  public writeUint8(value: number): void {
    this.#ensure(1);
    this.#buffer[this.#length++] = value & 0xff;
  }

  /**
   * Appends a 16-bit little-endian integer.
   */
  public writeUint16(value: number): void {
    this.#ensure(2);
    this.#buffer[this.#length++] = value & 0xff;
    this.#buffer[this.#length++] = (value >>> 8) & 0xff;
  }

  /**
   * Appends an unsigned LEB128 variable-length integer.
   */
  public writeVarint(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
      throw new RangeError(`Cannot encode ${value} as an unsigned varint`);
    }

    let remaining: number = value;
    // Values above 2^31 cannot use bitwise operators, so fall back to arithmetic.
    while (remaining >= 0x80) {
      this.writeUint8((remaining % 0x80) + 0x80);
      remaining = Math.floor(remaining / 0x80);
    }
    this.writeUint8(remaining);
  }

  /**
   * Appends a signed integer using zigzag encoding, so that small magnitudes of either sign
   * occupy a single byte.
   */
  public writeSignedVarint(value: number): void {
    if (!Number.isInteger(value)) {
      throw new RangeError(`Cannot encode ${value} as a signed varint`);
    }
    this.writeVarint(value < 0 ? -2 * value - 1 : 2 * value);
  }

  /**
   * Appends raw bytes without a length prefix.
   */
  public writeBytes(bytes: Uint8Array): void {
    this.#ensure(bytes.length);
    this.#buffer.set(bytes, this.#length);
    this.#length += bytes.length;
  }

  /**
   * Appends a varint byte length followed by the bytes themselves.
   */
  public writeLengthPrefixedBytes(bytes: Uint8Array): void {
    this.writeVarint(bytes.length);
    this.writeBytes(bytes);
  }

  /**
   * Returns a copy of the bytes written so far.
   */
  public toUint8Array(): Uint8Array {
    return this.#buffer.slice(0, this.#length);
  }
}
