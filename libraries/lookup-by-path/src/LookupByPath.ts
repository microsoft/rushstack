// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A node in the path trie used in LookupByPath
 */
interface IPathTrieNode<TItem extends {}> {
  /**
   * The value that exactly matches the current relative path
   */
  value: TItem | undefined;

  /**
   * Child nodes by subfolder
   */
  children: Map<string, IPathTrieNode<TItem>> | undefined;
}

/**
 * Readonly view of a node in the path trie used in LookupByPath
 *
 * @remarks
 * This interface is used to facilitate parallel traversals for comparing two `LookupByPath` instances.
 *
 * @beta
 */
export interface IReadonlyPathTrieNode<TItem extends {}> {
  /**
   * The value that exactly matches the current relative path
   */
  readonly value: TItem | undefined;

  /**
   * Child nodes by subfolder
   */
  readonly children: ReadonlyMap<string, IReadonlyPathTrieNode<TItem>> | undefined;
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
export interface IPrefixMatch<TItem extends {}> {
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
 * The readonly component of `LookupByPath`, to simplify unit testing.
 *
 * @beta
 */
export interface IReadonlyLookupByPath<TItem extends {}> extends Iterable<[string, TItem]> {
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
  findChildPath(childPath: string, delimiter?: string): TItem | undefined;

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
  findLongestPrefixMatch(query: string, delimiter?: string): IPrefixMatch<TItem> | undefined;

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
  findChildPathFromSegments(childPathSegments: Iterable<string>): TItem | undefined;

  /**
   * Determines if an entry exists exactly at the specified path.
   *
   * @returns `true` if an entry exists at the specified path, `false` otherwise
   */
  has(query: string, delimiter?: string): boolean;

  /**
   * Retrieves the entry that exists exactly at the specified path, if any.
   *
   * @returns The entry that exists exactly at the specified path, or `undefined` if no entry exists.
   */
  get(query: string, delimiter?: string): TItem | undefined;

  /**
   * Gets the number of entries in this trie.
   *
   * @returns The number of entries in this trie.
   */
  get size(): number;

  /**
   * @returns The root node of the trie, corresponding to the path ''
   */
  get tree(): IReadonlyPathTrieNode<TItem>;

  /**
   * Iterates over the entries in this trie.
   *
   * @param query - An optional query. If specified only entries that start with the query will be returned.
   *
   * @returns An iterator over the entries under the specified query (or the root if no query is specified).
   * @remarks
   * Keys in the returned iterator use the provided delimiter to join segments.
   * Iteration order is not specified.
   * @example
   * ```ts
   * const trie = new LookupByPath([['foo', 1], ['foo/bar', 2]]);
   * [...trie.entries(undefined, ',')); // returns [['foo', 1], ['foo,bar', 2]]
   * ```
   */
  entries(query?: string, delimiter?: string): IterableIterator<[string, TItem]>;

  /**
   * Iterates over the entries in this trie.
   *
   * @param query - An optional query. If specified only entries that start with the query will be returned.
   *
   * @returns An iterator over the entries under the specified query (or the root if no query is specified).
   * @remarks
   * Keys in the returned iterator use the provided delimiter to join segments.
   * Iteration order is not specified.
   */
  [Symbol.iterator](query?: string, delimiter?: string): IterableIterator<[string, TItem]>;

  /**
   * Groups the provided map of info by the nearest entry in the trie that contains the path. If the path
   * is not found in the trie, the info is ignored.
   *
   * @returns The grouped info, grouped by the nearest entry in the trie that contains the path
   *
   * @param infoByPath - The info to be grouped, keyed by path
   */
  groupByChild<TInfo>(infoByPath: Map<string, TInfo>, delimiter?: string): Map<TItem, Map<string, TInfo>>;

  /**
   * Retrieves the trie node at the specified prefix, if it exists.
   *
   * @param query - The prefix to check for
   * @param delimiter - The path delimiter
   * @returns The trie node at the specified prefix, or `undefined` if no node was found
   */
  getNodeAtPrefix(query: string, delimiter?: string): IReadonlyPathTrieNode<TItem> | undefined;
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
export class LookupByPath<TItem extends {}> implements IReadonlyLookupByPath<TItem> {
  /**
   * The delimiter used to split paths
   */
  public readonly delimiter: string;

  /**
   * The root node of the trie, corresponding to the path ''
   */
  private readonly _root: IPathTrieNode<TItem>;

  /**
   * The number of entries in this trie.
   */
  private _size: number;

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
    this._size = 0;

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
   * {@inheritdoc IReadonlyLookupByPath.size}
   */
  public get size(): number {
    return this._size;
  }

  /**
   * {@inheritdoc IReadonlyLookupByPath.tree}
   */
  public get tree(): IReadonlyPathTrieNode<TItem> {
    return this._root;
  }

  /**
   * Deletes all entries from this `LookupByPath` instance.
   *
   * @returns this, for chained calls
   */
  public clear(): this {
    this._root.value = undefined;
    this._root.children = undefined;
    this._size = 0;
    return this;
  }

  /**
   * Associates the value with the specified serialized path.
   * If a value is already associated, will overwrite.
   *
   * @returns this, for chained calls
   */
  public setItem(serializedPath: string, value: TItem, delimiter: string = this.delimiter): this {
    return this.setItemFromSegments(LookupByPath.iteratePathSegments(serializedPath, delimiter), value);
  }

  /**
   * Deletes an item if it exists.
   * @param query - The path to the item to delete
   * @param delimeter - Optional override delimeter for parsing the query
   * @returns `true` if the item was found and deleted, `false` otherwise
   * @remarks
   * If the node has children with values, they will be retained.
   */
  public deleteItem(query: string, delimeter: string = this.delimiter): boolean {
    const node: IPathTrieNode<TItem> | undefined = this._findNodeAtPrefix(query, delimeter);
    if (node?.value !== undefined) {
      node.value = undefined;
      this._size--;
      return true;
    }

    return false;
  }

  /**
   * Deletes an item and all its children.
   * @param query - The path to the item to delete
   * @param delimeter - Optional override delimeter for parsing the query
   * @returns `true` if any nodes were deleted, `false` otherwise
   */
  public deleteSubtree(query: string, delimeter: string = this.delimiter): boolean {
    const queryNode: IPathTrieNode<TItem> | undefined = this._findNodeAtPrefix(query, delimeter);
    if (!queryNode) {
      return false;
    }

    const queue: IPathTrieNode<TItem>[] = [queryNode];
    let removed: number = 0;
    while (queue.length > 0) {
      const node: IPathTrieNode<TItem> = queue.pop()!;
      if (node.value !== undefined) {
        node.value = undefined;
        removed++;
      }
      if (node.children) {
        for (const child of node.children.values()) {
          queue.push(child);
        }
        node.children.clear();
      }
    }

    this._size -= removed;
    return removed > 0;
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
    if (node.value === undefined) {
      this._size++;
    }
    node.value = value;

    return this;
  }

  /**
   * {@inheritdoc IReadonlyLookupByPath}
   */
  public findChildPath(childPath: string, delimiter: string = this.delimiter): TItem | undefined {
    return this.findChildPathFromSegments(LookupByPath.iteratePathSegments(childPath, delimiter));
  }

  /**
   * {@inheritdoc IReadonlyLookupByPath}
   */
  public findLongestPrefixMatch(
    query: string,
    delimiter: string = this.delimiter
  ): IPrefixMatch<TItem> | undefined {
    return this._findLongestPrefixMatch(LookupByPath._iteratePrefixes(query, delimiter));
  }

  /**
   * {@inheritdoc IReadonlyLookupByPath}
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
   * {@inheritdoc IReadonlyLookupByPath}
   */
  public has(key: string, delimiter: string = this.delimiter): boolean {
    const match: IPrefixMatch<TItem> | undefined = this.findLongestPrefixMatch(key, delimiter);
    return match?.index === key.length;
  }

  /**
   * {@inheritdoc IReadonlyLookupByPath}
   */
  public get(key: string, delimiter: string = this.delimiter): TItem | undefined {
    const match: IPrefixMatch<TItem> | undefined = this.findLongestPrefixMatch(key, delimiter);
    return match?.index === key.length ? match.value : undefined;
  }

  /**
   * {@inheritdoc IReadonlyLookupByPath}
   */
  public groupByChild<TInfo>(
    infoByPath: Map<string, TInfo>,
    delimiter: string = this.delimiter
  ): Map<TItem, Map<string, TInfo>> {
    const groupedInfoByChild: Map<TItem, Map<string, TInfo>> = new Map();

    for (const [path, info] of infoByPath) {
      const child: TItem | undefined = this.findChildPath(path, delimiter);
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
   * {@inheritdoc IReadonlyLookupByPath}
   */
  public *entries(query?: string, delimiter: string = this.delimiter): IterableIterator<[string, TItem]> {
    let root: IPathTrieNode<TItem> | undefined;
    if (query) {
      root = this._findNodeAtPrefix(query, delimiter);
      if (!root) {
        return;
      }
    } else {
      root = this._root;
    }

    const stack: [string, IPathTrieNode<TItem>][] = [[query ?? '', root]];
    while (stack.length > 0) {
      const [prefix, node] = stack.pop()!;
      if (node.value !== undefined) {
        yield [prefix, node.value];
      }
      if (node.children) {
        for (const [segment, child] of node.children) {
          stack.push([prefix ? `${prefix}${delimiter}${segment}` : segment, child]);
        }
      }
    }
  }

  /**
   * {@inheritdoc IReadonlyLookupByPath}
   */
  public [Symbol.iterator](
    query?: string,
    delimiter: string = this.delimiter
  ): IterableIterator<[string, TItem]> {
    return this.entries(query, delimiter);
  }

  /**
   * {@inheritdoc IReadonlyLookupByPath}
   */
  public getNodeAtPrefix(
    query: string,
    delimiter: string = this.delimiter
  ): IReadonlyPathTrieNode<TItem> | undefined {
    return this._findNodeAtPrefix(query, delimiter);
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

  /**
   * Finds the node at the specified path, or `undefined` if no node was found.
   *
   * @param query - The path to the node to search for
   * @returns The trie node at the specified path, or `undefined` if no node was found
   */
  private _findNodeAtPrefix(
    query: string,
    delimiter: string = this.delimiter
  ): IPathTrieNode<TItem> | undefined {
    let node: IPathTrieNode<TItem> = this._root;
    for (const { prefix } of LookupByPath._iteratePrefixes(query, delimiter)) {
      if (!node.children) {
        return undefined;
      }
      const child: IPathTrieNode<TItem> | undefined = node.children.get(prefix);
      if (!child) {
        return undefined;
      }
      node = child;
    }
    return node;
  }
}
