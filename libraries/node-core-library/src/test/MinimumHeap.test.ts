// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { MinimumHeap } from '../MinimumHeap.ts';

describe(MinimumHeap.name, () => {
  it('iterates in sorted order', () => {
    const comparator: (a: number, b: number) => number = (a: number, b: number) => a - b;

    const inputs: number[] = [];
    for (let heapSize: number = 1; heapSize < 100; heapSize++) {
      const heap: MinimumHeap<number> = new MinimumHeap<number>(comparator);
      inputs.length = 0;
      for (let i = 0; i < heapSize; i++) {
        const x: number = Math.random();
        inputs.push(x);
        heap.push(x);
      }

      const iterationResults: number[] = [];
      while (heap.size > 0) {
        iterationResults.push(heap.poll()!);
      }

      expect(iterationResults).toEqual(inputs.sort(comparator));
    }
  });

  it('returns all input objects', () => {
    const comparator: (a: {}, b: {}) => number = (a: {}, b: {}) => 0;

    const heap: MinimumHeap<{}> = new MinimumHeap<{}>(comparator);
    const inputs: Set<{}> = new Set([{}, {}, {}, {}, {}, {}]);
    for (const x of inputs) {
      heap.push(x);
    }

    const iterationResults: Set<{}> = new Set();
    while (heap.size > 0) {
      iterationResults.add(heap.poll()!);
    }

    expect(iterationResults.size).toEqual(inputs.size);
  });

  it('handles interleaved push and poll', () => {
    const comparator: (a: {}, b: {}) => number = (a: {}, b: {}) => 0;

    const heap: MinimumHeap<{}> = new MinimumHeap<{}>(comparator);
    const input1: Set<{}> = new Set();
    const input2: Set<{}> = new Set();
    for (let heapSize: number = 1; heapSize < 100; heapSize++) {
      input1.add({});
      input2.add({});

      const iterationResults: Set<{}> = new Set();

      for (const x of input1) {
        heap.push(x);
      }

      for (const x of input2) {
        iterationResults.add(heap.poll()!);
        heap.push(x);
      }

      while (heap.size > 0) {
        iterationResults.add(heap.poll()!);
      }

      expect(iterationResults.size).toEqual(input1.size + input2.size);
    }
  });
});
