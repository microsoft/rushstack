// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { mergeWith } from '../mergeWith';

describe(mergeWith.name, () => {
  describe('default behavior (no customizer)', () => {
    it('returns the target object', () => {
      const target: { a: number } = { a: 1 };
      const result: { a: number } = mergeWith(target, { a: 2 });
      expect(result).toBe(target);
    });

    it('copies source properties onto target', () => {
      const target: Record<string, unknown> = { a: 1 };
      mergeWith(target, { b: 2 });
      expect(target).toEqual({ a: 1, b: 2 });
    });

    it('overwrites target primitive with source primitive', () => {
      const target: Record<string, unknown> = { a: 1 };
      mergeWith(target, { a: 2 });
      expect(target.a).toBe(2);
    });

    it('recursively merges nested plain objects', () => {
      const target: Record<string, unknown> = { nested: { a: 1, b: 2 } };
      mergeWith(target, { nested: { b: 99, c: 3 } });
      expect(target).toEqual({ nested: { a: 1, b: 99, c: 3 } });
    });

    it('overwrites target array with source array (does not merge by index)', () => {
      const target: Record<string, unknown> = { arr: [1, 2, 3] };
      mergeWith(target, { arr: [10, 20] });
      expect(target.arr).toEqual([10, 20]);
    });

    it('overwrites nested array with source array', () => {
      const target: Record<string, unknown> = { nested: { arr: ['a', 'b', 'c'] } };
      mergeWith(target, { nested: { arr: ['x'] } });
      expect((target.nested as Record<string, unknown>).arr).toEqual(['x']);
    });

    it('overwrites target object with source null', () => {
      const target: Record<string, unknown> = { a: { b: 1 } };
      mergeWith(target, { a: null });
      expect(target.a).toBeNull();
    });

    it('overwrites target null with source object', () => {
      const target: Record<string, unknown> = { a: null };
      mergeWith(target, { a: { b: 1 } });
      expect(target.a).toEqual({ b: 1 });
    });

    it('mutates the target object in place', () => {
      const nested: Record<string, unknown> = { x: 1 };
      const target: Record<string, unknown> = { nested };
      mergeWith(target, { nested: { y: 2 } });
      expect(target.nested).toBe(nested);
      expect(nested).toEqual({ x: 1, y: 2 });
    });

    it('handles empty source', () => {
      const target: Record<string, unknown> = { a: 1 };
      mergeWith(target, {});
      expect(target).toEqual({ a: 1 });
    });

    it('handles empty target', () => {
      const target: Record<string, unknown> = {};
      mergeWith(target, { a: 1 });
      expect(target).toEqual({ a: 1 });
    });
  });

  describe('customizer behavior', () => {
    it('uses customizer return value when it is not undefined', () => {
      const target: Record<string, unknown> = { a: 1 };
      mergeWith(target, { a: 2 }, () => 'custom');
      expect(target.a).toBe('custom');
    });

    it('falls back to default merge when customizer returns undefined', () => {
      const target: Record<string, unknown> = { a: 1 };
      mergeWith(target, { a: 2 }, () => undefined);
      expect(target.a).toBe(2);
    });

    it('customizer receives (targetValue, sourceValue, key)', () => {
      const calls: [unknown, unknown, string][] = [];
      const target: Record<string, unknown> = { a: 1, b: 2 };
      mergeWith(target, { a: 10, b: 20 }, (obj, src, key) => {
        calls.push([obj, src, key]);
        return undefined;
      });
      expect(calls).toEqual([
        [1, 10, 'a'],
        [2, 20, 'b']
      ]);
    });

    it('customizer can overwrite arrays instead of concatenating', () => {
      const target: Record<string, unknown> = { arr: [1, 2] };
      mergeWith(target, { arr: [3, 4] }, (currentValue, srcValue) => {
        void currentValue;
        if (Array.isArray(srcValue)) return srcValue;
        return undefined;
      });
      expect(target.arr).toEqual([3, 4]);
    });

    it('customizer can concatenate arrays', () => {
      const target: Record<string, unknown> = { arr: [1, 2] };
      mergeWith(target, { arr: [3, 4] }, (objValue, srcValue) => {
        if (Array.isArray(objValue) && Array.isArray(srcValue)) return [...objValue, ...srcValue];
        return undefined;
      });
      expect(target.arr).toEqual([1, 2, 3, 4]);
    });

    it('customizer is not called for keys not in source', () => {
      const calls: string[] = [];
      const target: Record<string, unknown> = { a: 1, b: 2 };
      mergeWith(target, { a: 10 }, (objValue, srcValue, key) => {
        void objValue;
        void srcValue;
        calls.push(key);
        return undefined;
      });
      expect(calls).toEqual(['a']);
      expect(target.b).toBe(2);
    });

    it('customizer receives undefined targetValue for keys only in source', () => {
      let receivedObjValue: unknown = 'sentinel';
      const target: Record<string, unknown> = {};
      mergeWith(target, { newKey: 42 }, (objValue) => {
        receivedObjValue = objValue;
        return undefined;
      });
      expect(receivedObjValue).toBeUndefined();
      expect(target.newKey).toBe(42);
    });

    it('deep merge falls back to default when customizer returns undefined for nested objects', () => {
      const target: Record<string, unknown> = { nested: { a: 1, b: 2 } };
      mergeWith(target, { nested: { b: 99, c: 3 } }, (objValue, srcValue) => {
        void objValue;
        // Only intercept arrays, let objects deep-merge
        if (Array.isArray(srcValue)) return srcValue;
        return undefined;
      });
      expect(target).toEqual({ nested: { a: 1, b: 99, c: 3 } });
    });
  });
});
