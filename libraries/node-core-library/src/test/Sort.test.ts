// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Sort } from '../Sort';

test('Sort.compareByValue', () => {
  const array: number[] = [3, 6, 2];
  array.sort(Sort.compareByValue);  // [2, 3, 6]
});

test('Sort.compareByValue cases', () => {
  const values: unknown[] = [undefined, null, -1, 1]; // tslint:disable-line:no-null-keyword
  const results: string[] = [];
  for (let i: number = 0; i < values.length; ++i) {
    for (let j: number = 0; j < values.length; ++j) {
      const x: unknown = values[i];
      const y: unknown = values[j];
      let relation: string = '?';
      switch (Sort.compareByValue(x, y)) {
        case -1: relation = '<'; break;
        case 0: relation = '='; break;
        case 1: relation = '>'; break;
      }
      results.push(`${x} ${relation} ${y}`);
    }
  }
  expect(results).toMatchSnapshot();
});

test('Sort.sortBy', () => {
  const array: string[] = [ 'aaa', 'bb', 'c' ];
  Sort.sortBy(array, x => x.length);  // [ 'c', 'bb', 'aaa' ]
});

test('Sort.isSortedBy', () => {
  const array: string[] = [ 'a', 'bb', 'ccc' ];
  Sort.isSortedBy(array, x => x.length); // true
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
  Sort.sortSetBy(set, x => x.length);
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
