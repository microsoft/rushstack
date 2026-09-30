// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { constants, PerformanceObserver, type PerformanceEntry } from 'node:perf_hooks';
import * as vm from 'node:vm';

import { getReducingGarbageCollection } from '../ReducingGarbageCollection';

interface IGarbageCollectionDetail {
  readonly kind: number;
}

async function countMajorCollectionsAsync(action: () => void): Promise<number> {
  const entries: PerformanceEntry[] = [];
  const observer: PerformanceObserver = new PerformanceObserver((list) => entries.push(...list.getEntries()));
  observer.observe({ entryTypes: ['gc'] });
  try {
    action();
    // Node.js reports collections to observers asynchronously.
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  } finally {
    observer.disconnect();
  }
  return entries.filter(
    (entry: PerformanceEntry) =>
      (entry.detail as IGarbageCollectionDetail | undefined)?.kind === constants.NODE_PERFORMANCE_GC_MAJOR
  ).length;
}

// From V8 12 (Node.js 22) on, `gc` can run the memory-reducing collection.
const HAS_REDUCING_COLLECTION: boolean = Number.parseInt(process.versions.v8, 10) >= 12;

describe(getReducingGarbageCollection.name, () => {
  it('runs a full collection', async () => {
    const collect: () => void = getReducingGarbageCollection();
    expect(await countMajorCollectionsAsync(collect)).toBeGreaterThanOrEqual(1);
  });

  (HAS_REDUCING_COLLECTION ? it : it.skip)('runs full collections until nothing more is freed', async () => {
    const collect: () => void = getReducingGarbageCollection();
    // A regular full collection runs once; the memory-reducing one repeats at least once more.
    expect(await countMajorCollectionsAsync(collect)).toBeGreaterThanOrEqual(2);
  });

  it('does not expose gc to scripts', () => {
    getReducingGarbageCollection()();
    expect((globalThis as { gc?: unknown }).gc).toBeUndefined();
    expect(vm.runInNewContext('typeof gc')).toBe('undefined');
  });
});
