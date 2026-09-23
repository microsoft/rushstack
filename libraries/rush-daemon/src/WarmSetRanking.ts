// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** Inputs to the single retention/eviction order. Missing measurements are not estimates. */
export interface IWarmSetRank {
  readonly key: string;
  readonly lastUsed: number;
  readonly frequency: number;
  readonly timeSavedMs: number | undefined;
  readonly residentMemoryBytes: number | undefined;
}

export function getWarmSetScore(entry: IWarmSetRank): number | undefined {
  const { timeSavedMs, frequency, residentMemoryBytes } = entry;
  if (
    timeSavedMs === undefined ||
    !Number.isFinite(timeSavedMs) ||
    timeSavedMs < 0 ||
    !Number.isFinite(frequency) ||
    frequency <= 0 ||
    residentMemoryBytes === undefined ||
    !Number.isFinite(residentMemoryBytes) ||
    residentMemoryBytes <= 0
  )
    return undefined;
  const score: number = (timeSavedMs * frequency) / residentMemoryBytes;
  return Number.isFinite(score) ? score : undefined;
}

/** Best to retain first; eviction consumes this same order from the end. */
export function compareWarmSetRanks(a: IWarmSetRank, b: IWarmSetRank, telemetry: boolean): number {
  if (telemetry) {
    const aScore: number | undefined = getWarmSetScore(a);
    const bScore: number | undefined = getWarmSetScore(b);
    // A fixed missing-data bucket is essential: pairwise LRU fallback would not be transitive.
    if (aScore !== undefined && bScore === undefined) return -1;
    if (aScore === undefined && bScore !== undefined) return 1;
    if (aScore !== undefined && bScore !== undefined && aScore !== bScore) return bScore - aScore;
  }
  if (a.lastUsed !== b.lastUsed) return b.lastUsed - a.lastUsed;
  return a.key === b.key ? 0 : a.key < b.key ? -1 : 1;
}
