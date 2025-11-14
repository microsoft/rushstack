// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { cloneDeep, merge, removeNullishProps } from '../objectUtilities';

describe('objectUtilities', () => {
  describe(cloneDeep.name, () => {
    function testClone(source: unknown): void {
      const clone: unknown = cloneDeep(source);
      expect(clone).toEqual(source);
      expect(clone).not.toBe(source);
    }

    it('can clone primitives', () => {
      expect(cloneDeep(1)).toEqual(1);
      expect(cloneDeep('a')).toEqual('a');
      expect(cloneDeep(true)).toEqual(true);
      expect(cloneDeep(undefined)).toEqual(undefined);
      expect(cloneDeep(null)).toEqual(null);
    });

    it('can clone arrays', () => {
      testClone([]);
      testClone([1]);
      testClone([1, 2]);
      testClone([1, 2, 3]);
    });

    it('can clone objects', () => {
      testClone({});
      testClone({ a: 1 });
      testClone({ a: 1, b: 1 });
      testClone({ a: 1, b: 2 });

      const a: Record<string, number> = { a: 1 };
      testClone({ a, b: a });
    });

    it('can clone nested objects', () => {
      testClone({ a: { b: 1 } });
    });

    it("can't clone objects with circular references", () => {
      const a: Record<string, unknown> = { a: 1 };
      a.b = a;
      expect(() => cloneDeep(a)).toThrowErrorMatchingInlineSnapshot(`"Circular reference detected"`);

      const b: unknown[] = [];
      b.push(b);
      expect(() => cloneDeep(b)).toThrowErrorMatchingInlineSnapshot(`"Circular reference detected"`);
    });
  });

  describe(merge.name, () => {
    it('will overwrite with primitives', () => {
      expect(merge({}, 2)).toEqual(2);
      expect(merge([], 2)).toEqual(2);
      expect(merge({}, null)).toEqual(null);
      expect(merge([], null)).toEqual(null);
      expect(merge({}, undefined)).toEqual(undefined);
      expect(merge([], undefined)).toEqual(undefined);
    });

    it('will overwrite with arrays', () => {
      expect(merge({}, [1])).toEqual([1]);
      expect(merge([], [1])).toEqual([1]);
      expect(merge({ a: { b: 1 } }, { a: [1] })).toEqual({ a: [1] });
    });

    it('will merge with objects', () => {
      expect(merge({}, { a: 1 })).toEqual({ a: 1 });
      expect(merge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
      expect(merge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
      expect(merge({ a: { b: 1 } }, { a: { c: 2 } })).toEqual({ a: { b: 1, c: 2 } });
    });
  });

  describe(removeNullishProps.name, () => {
    it('can remove undefined and null properties', () => {
      expect(removeNullishProps({ a: 1, b: undefined })).toEqual({ a: 1 });
      expect(removeNullishProps({ a: 1, b: null })).toEqual({ a: 1 });
      expect(removeNullishProps({ a: 1, b: undefined, c: null })).toEqual({ a: 1 });
    });
  });
});
