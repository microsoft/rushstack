// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A node in the path trie used in LookupByPath
 */
interface IPathTrieNode<TItem> {
  /**
   * The value that exactly matches the current relative path
   */
  value: TItem | undefined;
  /**
   * Child nodes by subfolder
   */
  children: Map<string, IPathTrieNode<TItem>> | undefined;
}

interface IPrefixEntry {
  /**
   * The prefix that was matched
   */
  prefix: string;
  /**
   * The index of the first character after the matched prefix
   */
  index: number;
}

/**
 * Object containing both the matched item and the start index of the remainder of the query.
 *
 * @beta
 */
export interface IPrefixMatch<TItem> {
  /**
   * The item that matched the prefix
   */
  value: TItem;
  /**
   * The index of the first character after the matched prefix
   */
  index: number;
  /**
   * The last match found (with a shorter prefix), if any
   */
  lastMatch?: IPrefixMatch<TItem>;
}

/**
 * This class is used to associate path-like-strings, such as those returned by `git` commands,
 * with entities that correspond with ancestor folders, such as Rush Projects or npm packages.
 *
 * It is optimized for efficiently locating the nearest ancestor path with an associated value.
 *
 * It is implemented as a Trie (https://en.wikipedia.org/wiki/Trie) data structure, with each edge
 * being a path segment.
 *
 * @example
 * ```ts
 * const trie = new LookupByPath([['foo', 1], ['bar', 2], ['foo/bar', 3]]);
 * trie.findChildPath('foo'); // returns 1
 * trie.findChildPath('foo/baz'); // returns 1
 * trie.findChildPath('baz'); // returns undefined
 * trie.findChildPath('foo/bar/baz'); returns 3
 * trie.findChildPath('bar/foo/bar'); returns 2
 * ```
 * @beta
 */
export class LookupByPath<TItem> {
  /**
   * The delimiter used to split paths
   */
  public readonly delimiter: string;
  /**
   * The root node of the trie, corresponding to the path ''
   */
  private readonly _root: IPathTrieNode<TItem>;

  /**
   * Constructs a new `LookupByPath`
   *
   * @param entries - Initial path-value pairs to populate the trie.
   */
  public constructor(entries?: Iterable<[string, TItem]>, delimiter?: string) {
    this._root = {
      value: undefined,
      children: undefined
    };

    this.delimiter = delimiter ?? '/';

    if (entries) {
      for (const [path, item] of entries) {
        this.setItem(path, item);
      }
    }
  }

  /**
   * Iterates over the segments of a serialized path.
   *
   * @example
   *
   * `LookupByPath.iteratePathSegments('foo/bar/baz')` yields 'foo', 'bar', 'baz'
   *
   * `LookupByPath.iteratePathSegments('foo\\bar\\baz', '\\')` yields 'foo', 'bar', 'baz'
   */
  public static *iteratePathSegments(serializedPath: string, delimiter: string = '/'): Iterable<string> {
    for (const prefixMatch of this._iteratePrefixes(serializedPath, delimiter)) {
      yield prefixMatch.prefix;
    }
  }

  private static *_iteratePrefixes(input: string, delimiter: string = '/'): Iterable<IPrefixEntry> {
    if (!input) {
      return;
    }

    let previousIndex: number = 0;
    let nextIndex: number = input.indexOf(delimiter);

    // Leading segments
    while (nextIndex >= 0) {
      yield {
        prefix: input.slice(previousIndex, nextIndex),
        index: nextIndex
      };
      previousIndex = nextIndex + 1;
      nextIndex = input.indexOf(delimiter, previousIndex);
    }

    // Last segment
    if (previousIndex < input.length) {
      yield {
        prefix: input.slice(previousIndex, input.length),
        index: input.length
      };
    }
  }

  /**
   * Associates the value with the specified serialized path.
   * If a value is already associated, will overwrite.
   *
   * @returns this, for chained calls
   */
  public setItem(serializedPath: string, value: TItem): this {
    return this.setItemFromSegments(LookupByPath.iteratePathSegments(serializedPath, this.delimiter), value);
  }

  /**
   * Associates the value with the specified path.
   * If a value is already associated, will overwrite.
   *
   * @returns this, for chained calls
   */
  public setItemFromSegments(pathSegments: Iterable<string>, value: TItem): this {
    let node: IPathTrieNode<TItem> = this._root;
    for (const segment of pathSegments) {
      if (!node.children) {
        node.children = new Map();
      }
      let child: IPathTrieNode<TItem> | undefined = node.children.get(segment);
      if (!child) {
        node.children.set(
          segment,
          (child = {
            value: undefined,
            children: undefined
          })
        );
      }
      node = child;
    }
    node.value = value;

    return this;
  }

  /**
   * Searches for the item associated with `childPath`, or the nearest ancestor of that path that
   * has an associated item.
   *
   * @returns the found item, or `undefined` if no item was found
   *
   * @example
   * ```ts
   * const trie = new LookupByPath([['foo', 1], ['foo/bar', 2]]);
   * trie.findChildPath('foo/baz'); // returns 1
   * trie.findChildPath('foo/bar/baz'); // returns 2
   * ```
   */
  public findChildPath(childPath: string): TItem | undefined {
    return this.findChildPathFromSegments(LookupByPath.iteratePathSegments(childPath, this.delimiter));
  }

  /**
   * Searches for the item for which the recorded prefix is the longest matching prefix of `query`.
   * Obtains both the item and the length of the matched prefix, so that the remainder of the path can be
   * extracted.
   *
   * @returns the found item and the length of the matched prefix, or `undefined` if no item was found
   *
   * @example
   * ```ts
   * const trie = new LookupByPath([['foo', 1], ['foo/bar', 2]]);
   * trie.findLongestPrefixMatch('foo/baz'); // returns { item: 1, index: 3 }
   * trie.findLongestPrefixMatch('foo/bar/baz'); // returns { item: 2, index: 7 }
   * ```
   */
  public findLongestPrefixMatch(query: string): IPrefixMatch<TItem> | undefined {
    return this._findLongestPrefixMatch(LookupByPath._iteratePrefixes(query, this.delimiter));
  }

  /**
   * Searches for the item associated with `childPathSegments`, or the nearest ancestor of that path that
   * has an associated item.
   *
   * @returns the found item, or `undefined` if no item was found
   *
   * @example
   * ```ts
   * const trie = new LookupByPath([['foo', 1], ['foo/bar', 2]]);
   * trie.findChildPathFromSegments(['foo', 'baz']); // returns 1
   * trie.findChildPathFromSegments(['foo','bar', 'baz']); // returns 2
   * ```
   */
  public findChildPathFromSegments(childPathSegments: Iterable<string>): TItem | undefined {
    let node: IPathTrieNode<TItem> = this._root;
    let best: TItem | undefined = node.value;
    // Trivial cases
    if (node.children) {
      for (const segment of childPathSegments) {
        const child: IPathTrieNode<TItem> | undefined = node.children.get(segment);
        if (!child) {
          break;
        }
        node = child;
        best = node.value ?? best;
        if (!node.children) {
          break;
        }
      }
    }

    return best;
  }

  /**
   * Groups the provided map of info by the nearest entry in the trie that contains the path. If the path
   * is not found in the trie, the info is ignored.
   *
   * @returns The grouped info, grouped by the nearest entry in the trie that contains the path
   *
   * @param infoByPath - The info to be grouped, keyed by path
   */
  public groupByChild<TInfo>(infoByPath: Map<string, TInfo>): Map<TItem, Map<string, TInfo>> {
    const groupedInfoByChild: Map<TItem, Map<string, TInfo>> = new Map();

    for (const [path, info] of infoByPath) {
      const child: TItem | undefined = this.findChildPath(path);
      if (child === undefined) {
        continue;
      }
      let groupedInfo: Map<string, TInfo> | undefined = groupedInfoByChild.get(child);
      if (!groupedInfo) {
        groupedInfo = new Map();
        groupedInfoByChild.set(child, groupedInfo);
      }
      groupedInfo.set(path, info);
    }

    return groupedInfoByChild;
  }

  /**
   * Iterates through progressively longer prefixes of a given string and returns as soon
   * as the number of candidate items that match the prefix are 1 or 0.
   *
   * If a match is present, returns the matched itme and the length of the matched prefix.
   *
   * @returns the found item, or `undefined` if no item was found
   */
  private _findLongestPrefixMatch(prefixes: Iterable<IPrefixEntry>): IPrefixMatch<TItem> | undefined {
    let node: IPathTrieNode<TItem> = this._root;
    let best: IPrefixMatch<TItem> | undefined = node.value
      ? {
          value: node.value,
          index: 0,
          lastMatch: undefined
        }
      : undefined;
    // Trivial cases
    if (node.children) {
      for (const { prefix: hash, index } of prefixes) {
        const child: IPathTrieNode<TItem> | undefined = node.children.get(hash);
        if (!child) {
          break;
        }
        node = child;
        if (node.value !== undefined) {
          best = {
            value: node.value,
            index,
            lastMatch: best
          };
        }
        if (!node.children) {
          break;
        }
      }
    }

    return best;
  }
}
