// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const MARKS: WeakMap<object, boolean> = new WeakMap();

/**
 * Marks a webpack entity as containing or not containing localized resources.
 */
export function markEntity(entity: object, value: boolean): void {
  MARKS.set(entity, value);
}

/**
 * Read the cache marker for whether or not the entity contains localized resources.
 */
export function getMark(entity: object): boolean | undefined {
  return MARKS.get(entity);
}
