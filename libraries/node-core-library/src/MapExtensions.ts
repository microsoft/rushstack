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
}
