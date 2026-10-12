// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as fs from 'node:fs';

import { getTimeNs, revealsWriteAfter } from '../FileStamp';

const NANOSECONDS_PER_MILLISECOND: bigint = BigInt(1e6);

function getStats(ctimeNs: bigint): fs.BigIntStats {
  return { ctimeNs } as fs.BigIntStats;
}

function afterMs(timeNs: bigint, milliseconds: number, nanoseconds: number = 0): bigint {
  return timeNs + BigInt(milliseconds) * NANOSECONDS_PER_MILLISECOND + BigInt(nanoseconds);
}

describe(revealsWriteAfter.name, () => {
  it('reveals a write made more than 100 ms after the last change of a file with fine timestamps', () => {
    const ctimeNs: bigint = BigInt('1790000000123456789');
    const stats: fs.BigIntStats = getStats(ctimeNs);
    expect(revealsWriteAfter(stats, afterMs(ctimeNs, 100, 1))).toBe(true);
    expect(revealsWriteAfter(stats, afterMs(ctimeNs, 3000))).toBe(true);
    expect(revealsWriteAfter(stats, afterMs(ctimeNs, 100))).toBe(false);
    expect(revealsWriteAfter(stats, afterMs(ctimeNs, 50))).toBe(false);
    expect(revealsWriteAfter(stats, ctimeNs)).toBe(false);
  });

  it('reveals a write made more than 3 s after the last change of a file whose timestamps may be coarse', () => {
    // Whole seconds, as on a filesystem that records seconds, and whole multiples of 10 ms
    for (const ctimeNs of [BigInt('1790000000000000000'), BigInt('1790000000120000000')]) {
      const stats: fs.BigIntStats = getStats(ctimeNs);
      expect(revealsWriteAfter(stats, afterMs(ctimeNs, 3000, 1))).toBe(true);
      expect(revealsWriteAfter(stats, afterMs(ctimeNs, 3000))).toBe(false);
      expect(revealsWriteAfter(stats, afterMs(ctimeNs, 100, 1))).toBe(false);
    }
  });
});

describe(getTimeNs.name, () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the current time in nanoseconds', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1790000000123);
    expect(getTimeNs()).toBe(BigInt('1790000000123000000'));
  });
});
