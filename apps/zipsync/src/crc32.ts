// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as zlib from 'node:zlib';

let crcTable: Uint32Array | undefined;

function initCrcTable(): Uint32Array {
  if (crcTable) {
    return crcTable;
  }

  crcTable = new Uint32Array(256);
  for (let i: number = 0; i < 256; i++) {
    let crcEntry: number = i;
    for (let j: number = 0; j < 8; j++) {
      // eslint-disable-next-line no-bitwise
      crcEntry = crcEntry & 1 ? 0xedb88320 ^ (crcEntry >>> 1) : crcEntry >>> 1;
    }
    crcTable[i] = crcEntry;
  }
  return crcTable;
}

export function fallbackCrc32(data: Buffer<ArrayBufferLike>, value: number = 0): number {
  const table: Uint32Array = initCrcTable();
  value = (value ^ 0xffffffff) >>> 0;

  for (let i: number = 0; i < data.length; i++) {
    // eslint-disable-next-line no-bitwise
    value = table[(value ^ data[i]) & 0xff] ^ (value >>> 8);
  }

  value = (value ^ 0xffffffff) >>> 0;
  return value;
}

export const crc32Builder: (data: Buffer<ArrayBufferLike>, value?: number) => number =
  zlib.crc32 ?? fallbackCrc32;
