// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { compareWarmSetRanks, getWarmSetScore, type IWarmSetRank } from '../WarmSetRanking';

function entry(key: string, overrides: Partial<IWarmSetRank> = {}): IWarmSetRank {
  return { key, lastUsed: 0, frequency: 2, timeSavedMs: 100, residentMemoryBytes: 50, ...overrides };
}

describe('warm retention and eviction ranking', () => {
  it('uses the exact timeSaved * frequency / residentMemory score', () => {
    expect(getWarmSetScore(entry('a'))).toBe(4);
    expect(getWarmSetScore(entry('a', { timeSavedMs: 0 }))).toBe(0);
    expect(getWarmSetScore(entry('a', { frequency: 3, residentMemoryBytes: 20 }))).toBe(15);
  });

  it.each([
    { timeSavedMs: undefined },
    { residentMemoryBytes: undefined },
    { frequency: 0 },
    { residentMemoryBytes: 0 },
    { timeSavedMs: -1 },
    { timeSavedMs: NaN },
    { residentMemoryBytes: Infinity },
    { frequency: Infinity }
  ])('does not synthesize a score from missing or invalid telemetry: %p', (overrides) => {
    expect(getWarmSetScore(entry('a', overrides))).toBeUndefined();
  });

  it('uses score, recency, then ordinal key ties; disabling telemetry is pure LRU', () => {
    const entries: IWarmSetRank[] = [
      entry('z', { lastUsed: 2 }),
      entry('A', { lastUsed: 2 }),
      entry('a', { lastUsed: 2 }),
      entry('valuable', { timeSavedMs: 200 }),
      entry('missing-new', { lastUsed: 100, timeSavedMs: undefined }),
      entry('missing-old', { lastUsed: 1, residentMemoryBytes: undefined })
    ];
    const rank = (telemetry: boolean): string[] =>
      [...entries].sort((a, b) => compareWarmSetRanks(a, b, telemetry)).map((item) => item.key);
    expect(rank(true)).toEqual(['valuable', 'A', 'a', 'z', 'missing-new', 'missing-old']);
    expect(rank(false)).toEqual(['missing-new', 'A', 'a', 'z', 'missing-old', 'valuable']);
    expect(compareWarmSetRanks(entries[0], entries[0], true)).toBe(0);
    expect(
      [...entries]
        .reverse()
        .sort((a, b) => compareWarmSetRanks(a, b, true))
        .map((item) => item.key)
    ).toEqual(rank(true));
  });

  it('has a transitive missing-data order rather than a pair-dependent score/LRU comparison', () => {
    const entries = [
      entry('high-old', { timeSavedMs: 400, lastUsed: 1 }),
      entry('missing-middle', { residentMemoryBytes: undefined, lastUsed: 2 }),
      entry('low-new', { timeSavedMs: 1, lastUsed: 3 })
    ];
    for (const a of entries)
      for (const b of entries)
        for (const c of entries) {
          if (compareWarmSetRanks(a, b, true) <= 0 && compareWarmSetRanks(b, c, true) <= 0) {
            expect(compareWarmSetRanks(a, c, true)).toBeLessThanOrEqual(0);
          }
        }
  });
});
