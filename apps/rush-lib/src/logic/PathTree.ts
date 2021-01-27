/**
 * @public
 */
export interface IPathTreeNode<T> {
  /**
   * The value that exactly matches the current relative path
   */
  value: T | undefined;
  /**
   * Child nodes by subfolder
   */
  children: Map<string, IPathTreeNode<T>> | undefined;
}

/**
 * This class is used to associate POSIX relative paths, such as those returned by `git` commands,
 * with entities that correspond with ancestor folders, such as Rush Projects
 */
export class PathTree<T> {
  /**
   * The root node of the tree, corresponding to the path ''
   */
  public readonly root: IPathTreeNode<T>;

  /**
   * Constructs a new `PathTree`
   *
   * @param entries - Initial path-value pairs to populate the tree.
   */
  public constructor(entries?: Iterable<[string, T]>) {
    this.root = {
      value: undefined,
      children: undefined
    };

    if (entries) {
      for (const [path, item] of entries) {
        this.set(path, item);
      }
    }
  }

  /**
   * Iterates over the segments of a posix relative path.
   *
   * @example
   * `PathTree.iteratePathSegments('foo/bar/baz')` yields 'foo', 'bar', 'baz'
   */
  public static *iteratePathSegments(posixRelativePath: string): Iterable<string> {
    if (!posixRelativePath) {
      return;
    }

    let slashIndex: number = posixRelativePath.indexOf('/');
    let previousSlashIndex: number = 0;
    while (slashIndex >= 0) {
      yield posixRelativePath.slice(previousSlashIndex, slashIndex);

      previousSlashIndex = slashIndex + 1;
      slashIndex = posixRelativePath.indexOf('/', previousSlashIndex);
    }

    if (previousSlashIndex + 1 < posixRelativePath.length) {
      yield posixRelativePath.slice(previousSlashIndex);
    }
  }

  /**
   * Sets the value at the specified relative path
   */
  public set(posixRelativePath: string, value: T): this {
    let node: IPathTreeNode<T> = this.root;
    for (const segment of PathTree.iteratePathSegments(posixRelativePath)) {
      if (!node.children) {
        node.children = new Map();
      }
      let child: IPathTreeNode<T> | undefined = node.children.get(segment);
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
   * Gets the nearest existing parent to the specified relative path
   */
  public getNearestParent(posixRelativePath: string): T | undefined {
    let node: IPathTreeNode<T> = this.root;
    let best: T | undefined = node.value;
    // Trivial cases
    if (node.children && posixRelativePath) {
      for (const segment of PathTree.iteratePathSegments(posixRelativePath)) {
        const child: IPathTreeNode<T> | undefined = node.children.get(segment);
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
