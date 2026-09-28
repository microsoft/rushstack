// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { BinaryReader } from './BinaryReader';
import type { BinaryWriter } from './BinaryWriter';

const TEXT_ENCODER: TextEncoder = new TextEncoder();
const TEXT_DECODER: TextDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * A lexicographically sorted, front-coded table of strings.
 *
 * @remarks
 * Each entry is stored as a `[prefixIndexDelta, suffixLengthInCharacters]` pair. The prefix is the
 * complete value of the entry `prefixIndexDelta` positions earlier in the table; a delta of `0`
 * means the entry has no prefix. All suffixes are concatenated into a single UTF-8 blob so that a
 * decoder performs exactly one (SIMD-accelerated) UTF-8 decode and then indexes into the resulting
 * string with `substring`.
 *
 * Suffix lengths are measured in UTF-16 code units (JavaScript `String.prototype.length`), NOT in
 * bytes and NOT in Unicode code points. Byte lengths would force a separate decode per entry, and
 * code points would disagree with `substring`. Encoders written in other languages must match this
 * definition.
 *
 * @beta
 */
export interface IStringTable {
  /**
   * The decoded strings, in table order.
   */
  readonly strings: readonly string[];
}

/**
 * Returns the number of leading UTF-16 code units shared by `a` and `b`, never splitting a
 * surrogate pair.
 */
function getCommonPrefixLength(a: string, b: string): number {
  const limit: number = Math.min(a.length, b.length);
  let length: number = 0;
  while (length < limit && a.charCodeAt(length) === b.charCodeAt(length)) {
    ++length;
  }

  // Never end a prefix on a lone high surrogate; the suffix must independently be valid UTF-8.
  if (length > 0) {
    const lastCharCode: number = a.charCodeAt(length - 1);
    if (lastCharCode >= 0xd800 && lastCharCode <= 0xdbff) {
      --length;
    }
  }

  return length;
}

/**
 * Accumulates the set of strings that a resolver cache file needs, then assigns table indices.
 *
 * @beta
 */
export class StringTableBuilder {
  readonly #strings: Set<string> = new Set();
  #indices: Map<string, number> | undefined = undefined;

  /**
   * Records that `value` must appear in the table.
   */
  public add(value: string): void {
    if (this.#indices) {
      throw new Error('Cannot add strings after the table has been finalized');
    }
    this.#strings.add(value);
  }

  /**
   * Sorts the recorded strings, inserts the synthetic branch-point prefixes that front coding
   * needs, and assigns indices. Subsequent calls return the same result.
   */
  public finalize(): readonly string[] {
    if (!this.#indices) {
      const sorted: string[] = Array.from(this.#strings).sort();

      // Front coding can only reference a complete earlier entry, so materialize the branch points
      // of the implied trie. Without these, sibling paths that share a long directory prefix would
      // each have to store that prefix in full.
      const augmented: Set<string> = new Set(sorted);
      for (let i: number = 1; i < sorted.length; ++i) {
        const commonLength: number = getCommonPrefixLength(sorted[i - 1], sorted[i]);
        if (commonLength > 0) {
          augmented.add(sorted[i - 1].slice(0, commonLength));
        }
      }

      const finalOrder: string[] = Array.from(augmented).sort();
      const indices: Map<string, number> = new Map();
      for (let i: number = 0; i < finalOrder.length; ++i) {
        indices.set(finalOrder[i], i);
      }
      this.#indices = indices;
    }

    return Array.from(this.#indices.keys());
  }

  /**
   * Returns the table index of a previously added string.
   */
  public getIndex(value: string): number {
    if (!this.#indices) {
      throw new Error('The table must be finalized before indices can be read');
    }
    const index: number | undefined = this.#indices.get(value);
    if (index === undefined) {
      throw new Error(`The string ${JSON.stringify(value)} was not added to the string table`);
    }
    return index;
  }
}

/**
 * Writes a finalized string table to `writer`.
 *
 * @beta
 */
export function writeStringTable(writer: BinaryWriter, strings: readonly string[]): void {
  writer.writeVarint(strings.length);

  // A stack of table indices whose values are all prefixes of the string being encoded. Because the
  // table is sorted and closed under branch-point prefixes, the top of the stack is always the
  // longest available prefix.
  const prefixStack: number[] = [];
  const suffixes: Uint8Array[] = [];
  let blobByteLength: number = 0;

  for (let i: number = 0; i < strings.length; ++i) {
    const value: string = strings[i];

    while (prefixStack.length > 0 && !value.startsWith(strings[prefixStack[prefixStack.length - 1]])) {
      prefixStack.pop();
    }

    let prefixIndexDelta: number = 0;
    let prefixLength: number = 0;
    if (prefixStack.length > 0) {
      const prefixIndex: number = prefixStack[prefixStack.length - 1];
      prefixIndexDelta = i - prefixIndex;
      prefixLength = strings[prefixIndex].length;
    }

    const suffix: string = value.slice(prefixLength);
    writer.writeVarint(prefixIndexDelta);
    writer.writeVarint(suffix.length);

    const encodedSuffix: Uint8Array = TEXT_ENCODER.encode(suffix);
    suffixes.push(encodedSuffix);
    blobByteLength += encodedSuffix.length;

    prefixStack.push(i);
  }

  writer.writeVarint(blobByteLength);
  for (const suffix of suffixes) {
    writer.writeBytes(suffix);
  }
}

/**
 * Reads a string table written by {@link writeStringTable}.
 *
 * @beta
 */
export function readStringTable(reader: BinaryReader): string[] {
  const count: number = reader.readVarint();
  const prefixIndexDeltas: Uint32Array = new Uint32Array(count);
  const suffixLengths: Uint32Array = new Uint32Array(count);

  for (let i: number = 0; i < count; ++i) {
    prefixIndexDeltas[i] = reader.readVarint();
    suffixLengths[i] = reader.readVarint();
  }

  const blobByteLength: number = reader.readVarint();
  // A single decode of the whole blob; every entry below is a `substring` of the result.
  const blob: string = TEXT_DECODER.decode(reader.readBytes(blobByteLength));

  const strings: string[] = new Array(count);
  let offset: number = 0;
  for (let i: number = 0; i < count; ++i) {
    const suffixLength: number = suffixLengths[i];
    const suffix: string = blob.substring(offset, offset + suffixLength);
    offset += suffixLength;

    const prefixIndexDelta: number = prefixIndexDeltas[i];
    strings[i] = prefixIndexDelta === 0 ? suffix : strings[i - prefixIndexDelta] + suffix;
  }

  if (offset !== blob.length) {
    throw new Error(
      `String table blob was not fully consumed: ${offset} of ${blob.length} characters were used`
    );
  }

  return strings;
}
