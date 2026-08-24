// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Splits text into bounded UTF-8 chunks without separating surrogate pairs.
 */
export function* chunkUtf8Text(text: string, maxChunkBytes: number): Iterable<string> {
  if (!Number.isSafeInteger(maxChunkBytes) || maxChunkBytes <= 0) {
    throw new RangeError('maxChunkBytes must be a positive safe integer.');
  }

  let chunkStart: number = 0;
  let chunkBytes: number = 0;
  let offset: number = 0;

  while (offset < text.length) {
    const codePoint: number = text.codePointAt(offset)!;
    const codeUnits: number = codePoint > 0xffff ? 2 : 1;
    const codePointBytes: number =
      codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;

    if (chunkBytes > 0 && chunkBytes + codePointBytes > maxChunkBytes) {
      yield text.slice(chunkStart, offset);
      chunkStart = offset;
      chunkBytes = 0;
    }

    chunkBytes += codePointBytes;
    offset += codeUnits;
  }

  if (chunkStart < text.length) {
    yield text.slice(chunkStart);
  }
}
