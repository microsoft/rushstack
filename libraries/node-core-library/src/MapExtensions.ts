// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Helper functions for working with the `Map<K, V>` data type.
 *
 * @public
 */
export class MapExtensions {
  /**
   * Adds all the (key, value) pairs from the source map into the target map.
   * @remarks
   * This function modifies targetMap.  Any existing keys will be overwritten.
   * @param targetMap - The map that entries will be added to
   * @param sourceMap - The map containing the entries to be added
   */
  public static mergeFromMap<K, V>(targetMap: Map<K, V>, sourceMap: ReadonlyMap<K, V>): void {
    for (const pair of sourceMap.entries()) {
      targetMap.set(pair[0], pair[1]);
    }
  }

  /**
   * Converts a string-keyed map to an object.
   * @remarks
   * This function has the same effect as Object.fromEntries(map.entries())
   * in supported versions of Node (\>= 12.0.0).
   * @param map - The map that the object properties will be sourced from
   */
  public static toObject<TValue>(map: Map<string, TValue>): { [key: string]: TValue } {
    return Array.from(map.entries()).reduce<{ [key: string]: TValue }>(
      (previous: { [key: string]: TValue }, current: [ string, TValue ]) => {
        previous[current[0]] = current[1];
        return previous;
      },
      {}
    );
  }
}
