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

/**
 * This class is used to associate POSIX relative paths, such as those returned by `git` commands,
 * with entities that correspond with ancestor folders, such as Rush Projects.
 *
 * It is optimized for efficiently locating the nearest ancestor path with an associated value.
 *
 * @example
 * const tree = new LookupByPath([['foo', 1], ['bar', 2], ['foo/bar', 3]]);
 * tree.getNearestAncestor('foo'); // returns 1
 * tree.getNearestAncestor('foo/baz'); // returns 1
 * tree.getNearestAncestor('baz'); // returns undefined
 * tree.getNearestAncestor('foo/bar/baz'); returns 3
 * tree.getNearestAncestor('bar/foo/bar'); returns 2
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
        this.set(path, item);
      }
    }
  }

  /**
   * Iterates over the segments of a serialized path.
   *
   * @example
   * `LookupByPath.iteratePathSegments('foo/bar/baz')` yields 'foo', 'bar', 'baz'
   * `LookupByPath.iteratePathSegments('foo\\bar\\baz', '\\')` yields 'foo', 'bar', 'baz'
   */
  public static *iteratePathSegments(serializedPath: string, delimiter: string = '/'): Iterable<string> {
    if (!serializedPath) {
      return;
    }

    let nextIndex: number = serializedPath.indexOf(delimiter);
    let previousIndex: number = 0;
    while (nextIndex >= 0) {
      yield serializedPath.slice(previousIndex, nextIndex);

      previousIndex = nextIndex + 1;
      nextIndex = serializedPath.indexOf(delimiter, previousIndex);
    }

    if (previousIndex + 1 < serializedPath.length) {
      yield serializedPath.slice(previousIndex);
    }
  }

  /**
   * Associates the value with the specified serialized path.
   * If a value is already associated, will overwrite.
   */
  public set(serializedPath: string, value: TItem): this {
    return this.setFromPathSegments(LookupByPath.iteratePathSegments(serializedPath, this.delimiter), value);
  }

  /**
   * Associates the value with the specified path.
   * If a value is already associated, will overwrite.
   */
  public setFromPathSegments(segments: Iterable<string>, value: TItem): this {
    let node: IPathTreeNode<TItem> = this._root;
    for (const segment of segments) {
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
   * Gets the nearest existing ancestor to the specified serialized path
   *
   * @example
   * const tree = new LookupByPath([['foo', 1], ['foo/bar', 2]]);
   * tree.findNearestAncestor('foo/baz'); // returns 1
   * tree.findNearestAncestor('foo/bar/baz'); // returns 2
   */
  public findNearestAncestor(serializedPath: string): TItem | undefined {
    return this.findNearestAncestorFromPathSegments(
      LookupByPath.iteratePathSegments(serializedPath, this.delimiter)
    );
  }

  /**
   * Gets the nearest existing ancestor to the specified path segment iterable
   *
   * @example
   * const tree = new LookupByPath([['foo', 1], ['foo/bar', 2]]);
   * tree.findNearestAncestorFromPathSegments(['foo', 'baz']); // returns 1
   * tree.findNearestAncestorFromPathSegments(['foo','bar', 'baz']); // returns 2
   */
  public findNearestAncestorFromPathSegments(segments: Iterable<string>): TItem | undefined {
    let node: IPathTreeNode<TItem> = this._root;
    let best: TItem | undefined = node.value;
    // Trivial cases
    if (node.children) {
      for (const segment of segments) {
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
}
