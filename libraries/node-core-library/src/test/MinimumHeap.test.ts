// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { MinimumHeap } from '../MinimumHeap';

describe(MinimumHeap.name, () => {
  it('iterates in sorted order', () => {
    const comparator: (a: number, b: number) => number = (a: number, b: number) => a - b;

    const heap: MinimumHeap<number> = new MinimumHeap<number>(comparator);
    for (const x of [1, 3, -2, 9, 6, 12, 11, 0, -5, 2, 3, 1, -21]) {
      heap.push(x);
    }

    const iterationResults: number[] = [];
    while (heap.size > 0) {
      iterationResults.push(heap.poll()!);
    }

    expect(iterationResults).toEqual(iterationResults.slice().sort(comparator));
  });
});
