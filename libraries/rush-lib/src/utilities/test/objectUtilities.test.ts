// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { objectsAreDeepEqual, cloneDeep, merge } from '../objectUtilities';

describe('objectUtilities', () => {
  describe(objectsAreDeepEqual.name, () => {
    it('can compare primitives', () => {
      expect(objectsAreDeepEqual(1, 1)).toEqual(true);
      expect(objectsAreDeepEqual(1, undefined)).toEqual(false);
      expect(objectsAreDeepEqual(1, null)).toEqual(false);
      expect(objectsAreDeepEqual(undefined, 1)).toEqual(false);
      expect(objectsAreDeepEqual(null, 1)).toEqual(false);
      expect(objectsAreDeepEqual(1, 2)).toEqual(false);

      expect(objectsAreDeepEqual('a', 'a')).toEqual(true);
      expect(objectsAreDeepEqual('a', undefined)).toEqual(false);
      expect(objectsAreDeepEqual('a', null)).toEqual(false);
      expect(objectsAreDeepEqual(undefined, 'a')).toEqual(false);
      expect(objectsAreDeepEqual(null, 'a')).toEqual(false);
      expect(objectsAreDeepEqual('a', 'b')).toEqual(false);

      expect(objectsAreDeepEqual(true, true)).toEqual(true);
      expect(objectsAreDeepEqual(true, undefined)).toEqual(false);
      expect(objectsAreDeepEqual(true, null)).toEqual(false);
      expect(objectsAreDeepEqual(undefined, true)).toEqual(false);
      expect(objectsAreDeepEqual(null, true)).toEqual(false);
      expect(objectsAreDeepEqual(true, false)).toEqual(false);

      expect(objectsAreDeepEqual(undefined, undefined)).toEqual(true);
      expect(objectsAreDeepEqual(undefined, null)).toEqual(false);
      expect(objectsAreDeepEqual(null, null)).toEqual(true);
    });

    it('can compare arrays', () => {
      expect(objectsAreDeepEqual([], [])).toEqual(true);
      expect(objectsAreDeepEqual([], undefined)).toEqual(false);
      expect(objectsAreDeepEqual([], null)).toEqual(false);
      expect(objectsAreDeepEqual(undefined, [])).toEqual(false);
      expect(objectsAreDeepEqual(null, [])).toEqual(false);

      expect(objectsAreDeepEqual([1], [1])).toEqual(true);
      expect(objectsAreDeepEqual([1], [2])).toEqual(false);

      expect(objectsAreDeepEqual([1, 2], [1, 2])).toEqual(true);
      expect(objectsAreDeepEqual([1, 2], [2, 1])).toEqual(false);

      expect(objectsAreDeepEqual([1, 2, 3], [1, 2, 3])).toEqual(true);
      expect(objectsAreDeepEqual([1, 2, 3], [1, 2, 4])).toEqual(false);
    });

    it('can compare objects', () => {
      expect(objectsAreDeepEqual({}, {})).toEqual(true);
      expect(objectsAreDeepEqual({}, undefined)).toEqual(false);
      expect(objectsAreDeepEqual({}, null)).toEqual(false);
      expect(objectsAreDeepEqual(undefined, {})).toEqual(false);
      expect(objectsAreDeepEqual(null, {})).toEqual(false);

      expect(objectsAreDeepEqual({ a: 1 }, { a: 1 })).toEqual(true);
      expect(objectsAreDeepEqual({ a: 1 }, { a: 2 })).toEqual(false);
      expect(objectsAreDeepEqual({ a: 1 }, {})).toEqual(false);
      expect(objectsAreDeepEqual({}, { a: 1 })).toEqual(false);
      expect(objectsAreDeepEqual({ a: 1 }, { b: 1 })).toEqual(false);

      expect(objectsAreDeepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toEqual(true);
      expect(objectsAreDeepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(false);
      expect(objectsAreDeepEqual({ a: 1, b: 2 }, { a: 1, c: 2 })).toEqual(false);
      expect(objectsAreDeepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual(true);
    });

    it('can compare nested objects', () => {
      expect(objectsAreDeepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toEqual(true);
      expect(objectsAreDeepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toEqual(false);
      expect(objectsAreDeepEqual({ a: { b: 1 } }, { a: { c: 1 } })).toEqual(false);
      expect(objectsAreDeepEqual({ a: { b: 1 } }, { a: { b: 1, c: 2 } })).toEqual(false);
      expect(objectsAreDeepEqual({ a: { b: 1 } }, { a: { b: 1 }, c: 2 })).toEqual(false);
    });
  });

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
});
