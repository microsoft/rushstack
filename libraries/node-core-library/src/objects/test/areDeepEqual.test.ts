// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { areDeepEqual } from '../areDeepEqual.ts';

describe(areDeepEqual.name, () => {
  it('can compare primitives', () => {
    expect(areDeepEqual(1, 1)).toEqual(true);
    expect(areDeepEqual(1, undefined)).toEqual(false);
    expect(areDeepEqual(1, null)).toEqual(false);
    expect(areDeepEqual(undefined, 1)).toEqual(false);
    expect(areDeepEqual(null, 1)).toEqual(false);
    expect(areDeepEqual(1, 2)).toEqual(false);

    expect(areDeepEqual('a', 'a')).toEqual(true);
    expect(areDeepEqual('a', undefined)).toEqual(false);
    expect(areDeepEqual('a', null)).toEqual(false);
    expect(areDeepEqual(undefined, 'a')).toEqual(false);
    expect(areDeepEqual(null, 'a')).toEqual(false);
    expect(areDeepEqual('a', 'b')).toEqual(false);

    expect(areDeepEqual(true, true)).toEqual(true);
    expect(areDeepEqual(true, undefined)).toEqual(false);
    expect(areDeepEqual(true, null)).toEqual(false);
    expect(areDeepEqual(undefined, true)).toEqual(false);
    expect(areDeepEqual(null, true)).toEqual(false);
    expect(areDeepEqual(true, false)).toEqual(false);

    expect(areDeepEqual(undefined, undefined)).toEqual(true);
    expect(areDeepEqual(undefined, null)).toEqual(false);
    expect(areDeepEqual(null, null)).toEqual(true);
  });

  it('can compare arrays', () => {
    expect(areDeepEqual([], [])).toEqual(true);
    expect(areDeepEqual([], undefined)).toEqual(false);
    expect(areDeepEqual([], null)).toEqual(false);
    expect(areDeepEqual(undefined, [])).toEqual(false);
    expect(areDeepEqual(null, [])).toEqual(false);

    expect(areDeepEqual([1], [1])).toEqual(true);
    expect(areDeepEqual([1], [2])).toEqual(false);

    expect(areDeepEqual([1, 2], [1, 2])).toEqual(true);
    expect(areDeepEqual([1, 2], [2, 1])).toEqual(false);

    expect(areDeepEqual([1, 2, 3], [1, 2, 3])).toEqual(true);
    expect(areDeepEqual([1, 2, 3], [1, 2, 4])).toEqual(false);
  });

  it('can compare objects', () => {
    expect(areDeepEqual({}, {})).toEqual(true);
    expect(areDeepEqual({}, undefined)).toEqual(false);
    expect(areDeepEqual({}, null)).toEqual(false);
    expect(areDeepEqual(undefined, {})).toEqual(false);
    expect(areDeepEqual(null, {})).toEqual(false);

    expect(areDeepEqual({ a: 1 }, { a: 1 })).toEqual(true);
    expect(areDeepEqual({ a: 1 }, { a: 2 })).toEqual(false);
    expect(areDeepEqual({ a: 1 }, {})).toEqual(false);
    expect(areDeepEqual({}, { a: 1 })).toEqual(false);
    expect(areDeepEqual({ a: 1 }, { b: 1 })).toEqual(false);

    expect(areDeepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toEqual(true);
    expect(areDeepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(false);
    expect(areDeepEqual({ a: 1, b: 2 }, { a: 1, c: 2 })).toEqual(false);
    expect(areDeepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual(true);
  });

  it('can compare nested objects', () => {
    expect(areDeepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toEqual(true);
    expect(areDeepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toEqual(false);
    expect(areDeepEqual({ a: { b: 1 } }, { a: { c: 1 } })).toEqual(false);
    expect(areDeepEqual({ a: { b: 1 } }, { a: { b: 1, c: 2 } })).toEqual(false);
    expect(areDeepEqual({ a: { b: 1 } }, { a: { b: 1 }, c: 2 })).toEqual(false);
  });
});
