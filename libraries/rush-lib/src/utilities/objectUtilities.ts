// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Objects } from '@rushstack/node-core-library';

/**
 * Determines if two objects are deeply equal.
 */
export const objectsAreDeepEqual: typeof Objects.areDeepEqual = Objects.areDeepEqual;

export function cloneDeep<TObject>(obj: TObject): TObject {
  return cloneDeepInner(obj, new Set());
}

export function merge<TBase extends object, TOther>(base: TBase, other: TOther): (TBase & TOther) | TOther {
  if (typeof other === 'object' && other !== null && !Array.isArray(other)) {
    for (const [key, value] of Object.entries(other)) {
      if (key in base) {
        const baseValue: unknown = (base as Record<string, unknown>)[key];
        if (typeof baseValue === 'object' && baseValue !== null && !Array.isArray(baseValue)) {
          (base as Record<string, unknown>)[key] = merge(baseValue, value);
        } else {
          (base as Record<string, unknown>)[key] = value;
        }
      } else {
        (base as Record<string, unknown>)[key] = value;
      }
    }

    return base as TBase & TOther;
  } else {
    return other;
  }
}

function cloneDeepInner<TObject>(obj: TObject, seenObjects: Set<unknown>): TObject {
  if (seenObjects.has(obj)) {
    throw new Error('Circular reference detected');
  } else if (typeof obj === 'object') {
    if (obj === null) {
      return null as TObject;
    } else {
      seenObjects.add(obj);
      if (Array.isArray(obj)) {
        const result: unknown[] = [];
        for (const item of obj) {
          result.push(cloneDeepInner(item, new Set(seenObjects)));
        }

        return result as TObject;
      } else {
        const result: Record<string, unknown> = {};
        for (const key of Object.getOwnPropertyNames(obj)) {
          const value: unknown = (obj as Record<string, unknown>)[key];
          result[key] = cloneDeepInner(value, new Set(seenObjects));
        }

        return result as TObject;
      }
    }
  } else {
    return obj;
  }
}

/**
 * Performs a partial deep comparison between `obj` and `source` to
 * determine if `obj` contains equivalent property values.
 */
export function isMatch<TObject>(obj: TObject, source: TObject): boolean {
  return obj === source || (typeof obj === typeof source && isMatchInner(obj, source));
}

function isMatchInner<TObject>(obj: TObject, source: TObject): boolean {
  if (obj === null || obj === undefined) {
    return false;
  }

  for (const k of Object.keys(source as object)) {
    const key: keyof TObject = k as keyof TObject;
    const sourceValue: unknown = source[key];
    if (isStrictComparable(sourceValue)) {
      if (obj[key] !== sourceValue) {
        return false;
      }
    } else if (!isMatchInner(obj[key], sourceValue)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if `value` is suitable for strict equality comparisons, i.e. `===`.
 */
function isStrictComparable<T>(value: T): boolean {
  const type: string = typeof value;
  return (
    // eslint-disable-next-line no-self-compare
    value === value && !(value !== null && value !== undefined && (type === 'object' || type === 'function'))
  );
}

/**
 * Removes `undefined` and `null` direct properties from an object.
 *
 * @remarks
 * Note that this does not recurse through sub-objects.
 */
export function removeNullishProps<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (obj[key] !== undefined && obj[key] !== null) {
        result[key] = obj[key];
      }
    }
  }
  return result;
}
