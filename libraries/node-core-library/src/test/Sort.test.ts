// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Sort } from '../Sort.ts';

test('Sort.compareByValue', () => {
  const array: number[] = [3, 6, 2];
  array.sort(Sort.compareByValue); // [2, 3, 6]
});

test('Sort.compareByValue cases', () => {
  const values: unknown[] = [undefined, null, -1, 1];
  const results: string[] = [];
  for (let i: number = 0; i < values.length; ++i) {
    for (let j: number = 0; j < values.length; ++j) {
      const x: unknown = values[i];
      const y: unknown = values[j];
      let relation: string = '?';
      switch (Sort.compareByValue(x, y)) {
        case -1:
          relation = '<';
          break;
        case 0:
          relation = '=';
          break;
        case 1:
          relation = '>';
          break;
      }
      results.push(`${x} ${relation} ${y}`);
    }
  }
  expect(results).toMatchSnapshot();
});

test('Sort.sortBy', () => {
  const array: string[] = ['aaa', 'bb', 'c'];
  Sort.sortBy(array, (x) => x.length); // [ 'c', 'bb', 'aaa' ]
});

test('Sort.isSortedBy', () => {
  const array: string[] = ['a', 'bb', 'ccc'];
  Sort.isSortedBy(array, (x) => x.length); // true
});

test('Sort.sortMapKeys', () => {
  const map: Map<string, number> = new Map<string, number>();
  map.set('zebra', 1);
  map.set('goose', 2);
  map.set('aardvark', 3);
  Sort.sortMapKeys(map);
  expect(Array.from(map.keys())).toEqual(['aardvark', 'goose', 'zebra']);
});

test('Sort.sortSetBy', () => {
  const set: Set<string> = new Set<string>();
  set.add('aaa');
  set.add('bb');
  set.add('c');
  Sort.sortSetBy(set, (x) => x.length);
  expect(Array.from(set)).toEqual(['c', 'bb', 'aaa']);
});

test('Sort.sortSet', () => {
  const set: Set<string> = new Set<string>();
  set.add('zebra');
  set.add('goose');
  set.add('aardvark');
  Sort.sortSet(set);
  expect(Array.from(set)).toEqual(['aardvark', 'goose', 'zebra']);
});

describe('Sort.sortKeys', () => {
  test('Simple object', () => {
    const unsortedObj = { q: 0, p: 0, r: 0 };
    const sortedObj = Sort.sortKeys(unsortedObj);

    // Assert that it's not sorted in-place
    expect(sortedObj).not.toBe(unsortedObj);

    expect(Object.keys(unsortedObj)).toEqual(['q', 'p', 'r']);
    expect(Object.keys(sortedObj)).toEqual(['p', 'q', 'r']);
  });
  test('Simple array with objects', () => {
    const unsortedArr = [
      { b: 1, a: 0 },
      { y: 0, z: 1, x: 2 }
    ];
    const sortedArr = Sort.sortKeys(unsortedArr);

    // Assert that it's not sorted in-place
    expect(sortedArr).not.toBe(unsortedArr);

    expect(Object.keys(unsortedArr[0])).toEqual(['b', 'a']);
    expect(Object.keys(sortedArr[0])).toEqual(['a', 'b']);

    expect(Object.keys(unsortedArr[1])).toEqual(['y', 'z', 'x']);
    expect(Object.keys(sortedArr[1])).toEqual(['x', 'y', 'z']);
  });
  test('Nested objects', () => {
    const unsortedDeepObj = { c: { q: 0, r: { a: 42 }, p: 2 }, b: { y: 0, z: 1, x: 2 }, a: 2 };
    const sortedDeepObj = Sort.sortKeys(unsortedDeepObj);

    expect(sortedDeepObj).not.toBe(unsortedDeepObj);

    expect(Object.keys(unsortedDeepObj)).toEqual(['c', 'b', 'a']);
    expect(Object.keys(sortedDeepObj)).toEqual(['a', 'b', 'c']);

    expect(Object.keys(unsortedDeepObj.b)).toEqual(['y', 'z', 'x']);
    expect(Object.keys(sortedDeepObj.b)).toEqual(['x', 'y', 'z']);

    expect(Object.keys(unsortedDeepObj.c)).toEqual(['q', 'r', 'p']);
    expect(Object.keys(sortedDeepObj.c)).toEqual(['p', 'q', 'r']);

    expect(Object.keys(unsortedDeepObj.c.r)).toEqual(['a']);
    expect(Object.keys(sortedDeepObj.c.r)).toEqual(['a']);
  });
});
