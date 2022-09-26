// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A node in the path tree used in LookupByPath
 */
interface IPathTreeNode<TItem> {
  /**
   * The value that exactly matches the current relative path
   */
  value: TItem | undefined;
  /**
   * Child nodes by subfolder
   */
  children: Map<string, IPathTreeNode<TItem>> | undefined;
}

interface IPrefixEntry {
  prefix: string;
  index: number;
}

export interface IPrefixMatch<TItem> {
  value: TItem;
  index: number;
}

/**
 * This class is used to associate POSIX relative paths, such as those returned by `git` commands,
 * with entities that correspond with ancestor folders, such as Rush Projects.
 *
 * It is optimized for efficiently locating the nearest ancestor path with an associated value.
 *
 * @example
 * ```ts
 * const tree = new LookupByPath([['foo', 1], ['bar', 2], ['foo/bar', 3]]);
 * tree.getNearestAncestor('foo'); // returns 1
 * tree.getNearestAncestor('foo/baz'); // returns 1
 * tree.getNearestAncestor('baz'); // returns undefined
 * tree.getNearestAncestor('foo/bar/baz'); returns 3
 * tree.getNearestAncestor('bar/foo/bar'); returns 2
 * ```
 * @beta
 */
export class LookupByPath<TItem> {
  /**
   * The delimiter used to split paths
   */
  public readonly delimiter: string;
  /**
   * The root node of the tree, corresponding to the path ''
   */
  private readonly _root: IPathTreeNode<TItem>;

  /**
   * Constructs a new `LookupByPath`
   *
   * @param entries - Initial path-value pairs to populate the tree.
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
    if (previousIndex + 1 < input.length) {
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
    let node: IPathTreeNode<TItem> = this._root;
    for (const segment of pathSegments) {
      if (!node.children) {
        node.children = new Map();
      }
      let child: IPathTreeNode<TItem> | undefined = node.children.get(segment);
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
   * const tree = new LookupByPath([['foo', 1], ['foo/bar', 2]]);
   * tree.findChildPath('foo/baz'); // returns 1
   * tree.findChildPath('foo/bar/baz'); // returns 2
   * ```
   */
  public findChildPath(childPath: string): TItem | undefined {
    return this.findChildPathFromSegments(LookupByPath.iteratePathSegments(childPath, this.delimiter));
  }

  /**
   * Searches for the item associated with `childPath`, or the nearest ancestor of that path that
   * has an associated item.
   *
   * @returns the found item, or `undefined` if no item was found
   *
   * @example
   * ```ts
   * const tree = new LookupByPath([['foo', 1], ['foo/bar', 2]]);
   * tree.findChildPathAndIndex('foo/baz'); // returns { item: 1, index: 4 }
   * tree.findChildPathAndIndex('foo/bar/baz'); // returns { item: 2, index: 8 }
   * ```
   */
  public findChildPathAndIndex(childPath: string): IPrefixMatch<TItem> | undefined {
    return this._findChildPathFromPrefixes(LookupByPath._iteratePrefixes(childPath, this.delimiter));
  }

  /**
   * Searches for the item associated with `childPathSegments`, or the nearest ancestor of that path that
   * has an associated item.
   *
   * @returns the found item, or `undefined` if no item was found
   *
   * @example
   * ```ts
   * const tree = new LookupByPath([['foo', 1], ['foo/bar', 2]]);
   * tree.findChildPathFromSegments(['foo', 'baz']); // returns 1
   * tree.findChildPathFromSegments(['foo','bar', 'baz']); // returns 2
   * ```
   */
  public findChildPathFromSegments(childPathSegments: Iterable<string>): TItem | undefined {
    let node: IPathTreeNode<TItem> = this._root;
    let best: TItem | undefined = node.value;
    // Trivial cases
    if (node.children) {
      for (const segment of childPathSegments) {
        const child: IPathTreeNode<TItem> | undefined = node.children.get(segment);
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
   * Searches for the item associated with `childPathSegments`, or the nearest ancestor of that path that
   * has an associated item.
   *
   * @returns the found item, or `undefined` if no item was found
   */
  private _findChildPathFromPrefixes(prefixes: Iterable<IPrefixEntry>): IPrefixMatch<TItem> | undefined {
    let node: IPathTreeNode<TItem> = this._root;
    let best: IPrefixMatch<TItem> | undefined = node.value
      ? {
          value: node.value,
          index: 0
        }
      : undefined;
    // Trivial cases
    if (node.children) {
      for (const { prefix: hash, index } of prefixes) {
        const child: IPathTreeNode<TItem> | undefined = node.children.get(hash);
        if (!child) {
          break;
        }
        node = child;
        if (node.value !== undefined) {
          best = {
            value: node.value,
            index
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
