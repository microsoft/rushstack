// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReadonlyPathTrieNode } from './LookupByPath.ts';

/**
 * Options for the getFirstDifferenceInCommonNodes function.
 * @beta
 */
export interface IGetFirstDifferenceInCommonNodesOptions<TItem extends {}> {
  /**
   * The first node to compare.
   */
  first: IReadonlyPathTrieNode<TItem>;
  /**
   * The second node to compare.
   */
  second: IReadonlyPathTrieNode<TItem>;
  /**
   * The path prefix to the current node.
   * @defaultValue ''
   */
  prefix?: string;
  /**
   * The delimiter used to join path segments.
   * @defaultValue '/'
   */
  delimiter?: string;
  /**
   * A function to compare the values of the nodes.
   * If not provided, strict equality (===) is used.
   */
  equals?: (a: TItem, b: TItem) => boolean;
}

/**
 * Recursively compares two path tries to find the first shared node with a different value.
 *
 * @param options - The options for the comparison
 * @returns The path to the first differing node, or undefined if they are identical
 *
 * @remarks
 * Ignores any nodes that are not shared between the two tries.
 *
 * @beta
 */
export function getFirstDifferenceInCommonNodes<TItem extends {}>(
  options: IGetFirstDifferenceInCommonNodesOptions<TItem>
): string | undefined {
  const { first, second, prefix = '', delimiter = '/', equals = defaultEquals } = options;

  return getFirstDifferenceInCommonNodesInternal({
    first,
    second,
    prefix,
    delimiter,
    equals
  });
}

/**
 * Recursively compares two path tries to find the first shared node with a different value.
 *
 * @param options - The options for the comparison
 * @returns The path to the first differing node, or undefined if they are identical
 *
 * @remarks
 * Ignores any nodes that are not shared between the two tries.
 * Separated out to avoid redundant parameter defaulting in the recursive calls.
 */
function getFirstDifferenceInCommonNodesInternal<TItem extends {}>(
  options: Required<IGetFirstDifferenceInCommonNodesOptions<TItem>>
): string | undefined {
  const { first, second, prefix, delimiter, equals } = options;

  const firstItem: TItem | undefined = first.value;
  const secondItem: TItem | undefined = second.value;

  if (firstItem !== undefined && secondItem !== undefined && !equals(firstItem, secondItem)) {
    // If this value was present in both tries with different values, return the prefix for this node.
    return prefix;
  }

  const { children: firstChildren } = first;
  const { children: secondChildren } = second;

  if (firstChildren && secondChildren) {
    for (const [key, firstChild] of firstChildren) {
      const secondChild: IReadonlyPathTrieNode<TItem> | undefined = secondChildren.get(key);
      if (!secondChild) {
        continue;
      }
      const result: string | undefined = getFirstDifferenceInCommonNodesInternal({
        first: firstChild,
        second: secondChild,
        prefix: key,
        delimiter,
        equals
      });

      if (result !== undefined) {
        return prefix ? `${prefix}${delimiter}${result}` : result;
      }
    }
  }

  return;
}

/**
 * Default equality function for comparing two items, using strict equality.
 * @param a - The first item to compare
 * @param b - The second item to compare
 * @returns True if the items are reference equal, false otherwise
 */
function defaultEquals<TItem>(a: TItem, b: TItem): boolean {
  return a === b;
}
