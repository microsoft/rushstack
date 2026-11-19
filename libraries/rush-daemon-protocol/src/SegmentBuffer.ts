// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const EMPTY_LENGTH: number = 0;
const FIRST_SEGMENT: number = 0;

/**
 * An append-only byte accumulator that avoids repeated concatenation.
 *
 * @remarks
 * Incoming chunks are stored as a list of segments; bytes are copied only when
 * a complete region is consumed, never on append. Used by the frame decoder so
 * that receiving a chunk costs O(1) rather than O(pending).
 *
 * @internal
 */
export class SegmentBuffer {
  #segments: Uint8Array[] = [];
  #bytes: number = EMPTY_LENGTH;

  /** The total buffered byte count. */
  public get byteLength(): number {
    return this.#bytes;
  }

  /** Appends a chunk (retained by reference; do not mutate after pushing). */
  public push(chunk: Uint8Array): void {
    if (chunk.length === EMPTY_LENGTH) {
      return;
    }
    this.#segments.push(chunk);
    this.#bytes += chunk.length;
  }

  /** Discards all buffered bytes. */
  public clear(): void {
    this.#segments = [];
    this.#bytes = EMPTY_LENGTH;
  }

  /** Copies `length` bytes starting at `offset` into a fresh array. */
  public readBytes(offset: number, length: number): Uint8Array {
    const result: Uint8Array = new Uint8Array(length);
    let written: number = EMPTY_LENGTH;
    let skipped: number = EMPTY_LENGTH;
    for (const segment of this.#segments) {
      written += this.#readFromSegment(segment, offset - skipped, result, written);
      skipped += segment.length;
      if (written === length) {
        break;
      }
    }
    return result;
  }

  /** Drops `count` bytes from the front of the buffer. */
  public consume(count: number): void {
    let remaining: number = count;
    while (remaining > EMPTY_LENGTH && this.#segments.length > EMPTY_LENGTH) {
      remaining -= this.#consumeFromFirstSegment(remaining);
    }
    this.#bytes -= count;
  }

  /** Consumes up to `count` bytes from the first segment, returning how many. */
  #consumeFromFirstSegment(count: number): number {
    const first: Uint8Array = this.#segments[FIRST_SEGMENT];
    if (first.length > count) {
      this.#segments[FIRST_SEGMENT] = first.subarray(count);
      return count;
    }
    this.#segments.shift();
    return first.length;
  }

  /** Copies what this segment can contribute, returning the byte count copied. */
  #readFromSegment(
    segment: Uint8Array,
    startBefore: number,
    target: Uint8Array,
    targetOffset: number
  ): number {
    const start: number = Math.max(EMPTY_LENGTH, startBefore);
    const available: number = segment.length - start;
    const wanted: number = target.length - targetOffset;
    if (available <= EMPTY_LENGTH || wanted <= EMPTY_LENGTH) {
      return EMPTY_LENGTH;
    }
    const amount: number = Math.min(available, wanted);
    target.set(segment.subarray(start, start + amount), targetOffset);
    return amount;
  }
}
