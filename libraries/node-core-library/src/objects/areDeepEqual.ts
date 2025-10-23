// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Determines if two objects are deeply equal.
 * @public
 */
export function areDeepEqual<TObject>(a: TObject, b: TObject): boolean {
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
              if (!areDeepEqual(a[i], b[i])) {
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
                  !areDeepEqual(
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
