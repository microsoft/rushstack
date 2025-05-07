// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReadonlyPathTrieNode } from './LookupByPath';

/**
 * Recursively compares two path tries to find the first shared node with a different value.
 *
 * @param first - The first node to compare
 * @param second - The second node to compare
 * @param prefix - The path prefix to the current node
 * @param delimiter - The delimiter used to join path segments
 * @param equals - A function to compare the values of the nodes
 * @returns The path to the first differing node, or undefined if they are identical
 *
 * @remarks
 * Ignores any nodes that are not shared between the two tries.
 */
export function getFirstDifferenceInCommonNodes<TItem extends {}>(
  first: IReadonlyPathTrieNode<TItem>,
  second: IReadonlyPathTrieNode<TItem>,
  prefix: string = '',
  delimiter: string = '/',
  equals: (a: TItem, b: TItem) => boolean = (a, b) => a === b
): string | undefined {
  const firstItem: TItem | undefined = first.value;
  const secondItem: TItem | undefined = second.value;

  if (firstItem !== undefined && secondItem !== undefined && !equals(firstItem, secondItem)) {
    // If the value at this node changed, we only care if we were tracking it to begin with.
    return prefix;
  }

  const { children: firstChildren } = first;
  const { children: secondChildren } = second;

  if (firstChildren && secondChildren) {
    for (const [key, lastInputChild] of firstChildren) {
      const secondChild: IReadonlyPathTrieNode<TItem> | undefined = secondChildren.get(key);
      if (!secondChild) {
        continue;
      }
      const result: string | undefined = getFirstDifferenceInCommonNodes(
        lastInputChild,
        secondChild,
        key,
        delimiter,
        equals
      );
      if (result !== undefined) {
        return prefix ? `${prefix}${delimiter}${result}` : result;
      }
    }
  }

  return;
}
