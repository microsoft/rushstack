// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See the @microsoft/rush package's LICENSE file for license information.

/**
 * Determines if two objects are deeply equal.
 */
export function objectsAreDeepEqual<TObject>(a: TObject, b: TObject): boolean {
  if (a === b) {
    return true;
  } else {
    const aType: string = typeof a;
    const bType: string = typeof b;
    if (aType !== bType) {
      return false;
    } else {
      if (aType === 'object') {
        if (a === null || b === null) {
          // We already handled the case where a === b, so if either is null, they are not equal
          return false;
        } else if (Array.isArray(a)) {
          if (!Array.isArray(b) || a.length !== b.length) {
            return false;
          } else {
            for (let i: number = 0; i < a.length; ++i) {
              if (!objectsAreDeepEqual(a[i], b[i])) {
                return false;
              }
            }

            return true;
          }
        } else {
          const aObjectProperties: Set<string> = new Set(Object.getOwnPropertyNames(a));
          const bObjectProperties: Set<string> = new Set(Object.getOwnPropertyNames(b));
          if (aObjectProperties.size !== bObjectProperties.size) {
            return false;
          } else {
            for (const property of aObjectProperties) {
              if (bObjectProperties.delete(property)) {
                if (
                  !objectsAreDeepEqual(
                    (a as Record<string, unknown>)[property],
                    (b as Record<string, unknown>)[property]
                  )
                ) {
                  return false;
                }
              } else {
                return false;
              }
            }

            return bObjectProperties.size === 0;
          }
        }
      } else {
        return false;
      }
    }
  }
}

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
