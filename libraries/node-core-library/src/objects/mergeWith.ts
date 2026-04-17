// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isRecord } from './isRecord';

/**
 * Customizer function for use with `mergeWith`.
 * Return `undefined` to fall back to the default deep-merge behavior for that property.
 * @public
 */
export type MergeWithCustomizer = (objValue: unknown, srcValue: unknown, key: string) => unknown;

/**
 * Recursively merges own enumerable string-keyed properties of `source` into `target`, invoking
 * `customizer` for each property. Mutates and returns `target`.
 *
 * @remarks
 * For each property in `source`, `customizer` is called with `(targetValue, sourceValue, key)`.
 * If the customizer returns a value other than `undefined`, that value is assigned directly.
 * Otherwise the default behavior applies: plain objects are merged recursively; all other values
 * (arrays, primitives, `null`) overwrite the corresponding target property.
 *
 * @public
 */
export function mergeWith<TTarget extends object, TSource extends object>(
  target: TTarget,
  source: TSource,
  customizer?: MergeWithCustomizer
): TTarget {
  const targetRecord: Record<string, unknown> = target as unknown as Record<string, unknown>;
  const sourceRecord: Record<string, unknown> = source as unknown as Record<string, unknown>;
  for (const [key, srcValue] of Object.entries(sourceRecord)) {
    const objValue: unknown = targetRecord[key];
    const customized: unknown = customizer?.(objValue, srcValue, key);
    if (customized !== undefined) {
      targetRecord[key] = customized;
    } else if (isRecord(srcValue) && isRecord(objValue)) {
      mergeWith(objValue, srcValue, customizer);
    } else {
      targetRecord[key] = srcValue;
    }
  }

  return target;
}
