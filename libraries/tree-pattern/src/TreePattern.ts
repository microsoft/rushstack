// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Indicates the tree-like data structure that {@link TreePattern} will traverse.
 *
 * @remarks
 * Since `TreePattern` makes relatively few assumptions object the object structure, this is
 * just an alias for `any`.  At least as far as the portions to be matched, the tree nodes
 * are expected to be JSON-like structures made from JavaScript arrays, JavaScript objects,
 * and primitive values that can be compared using `===`.
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TreeNode = any;

class TreePatternArg {
  public readonly keyName: string;
  public readonly subtree: TreeNode | undefined;
  public constructor(keyName: string, subtree?: TreeNode) {
    this.keyName = keyName;
    this.subtree = subtree;
  }
}

class TreePatternAlternatives {
  public readonly possibleSubtrees: TreeNode[];
  public constructor(possibleSubtrees: TreeNode[]) {
    this.possibleSubtrees = possibleSubtrees;
  }
}

/**
 * Provides additional detail about the success or failure of {@link TreePattern.match}.
 *
 * @remarks
 * On success, the object will contain keys for any successfully matched tags, as
 * defined using {@link TreePattern.tag}.
 *
 * On failure, the `failPath` member will indicate the JSON path of the node that
 * failed to match.
 *
 * @public
 */
export type ITreePatternCaptureSet =
  | {
      [tagName: string]: TreeNode;
    }
  | { failPath: string };

/**
 * A fast, lightweight pattern matcher for tree structures such as an Abstract Syntax Tree (AST).
 * @public
 */
export class TreePattern {
  private readonly _pattern: TreeNode;

  public constructor(pattern: TreeNode) {
    this._pattern = pattern;
  }

  /**
   * Labels a subtree within the search pattern, so that the matching object can be retrieved.
   *
   * @remarks
   * Used to build the `pattern` tree for {@link TreePattern.match}.  For the given `subtree` of the pattern,
   * if it is matched, that node will be assigned to the `captures` object using `tagName` as the key.
   *
   * Example:
   *
   * ```ts
   * const myCaptures: { personName?: string } = {};
   * const myPattern = {
   *   name: TreePattern.tag('personName')
   * };
   * if (myPattern.match({ name: 'Bob' }, myCaptures)) {
   *   console.log(myCaptures.personName);
   * }
   * ```
   */
  public static tag(tagName: string, subtree?: TreeNode): TreeNode {
    return new TreePatternArg(tagName, subtree);
  }

  /**
   * Used to specify alternative possible subtrees in the search pattern.
   *
   * @remarks
   * Used to build the `pattern` tree for {@link TreePattern.match}.  Allows several alternative patterns
   * to be matched for a given subtree.
   *
   * Example:
   *
   * ```ts
   * const myPattern: TreePattern = new TreePattern({
   *   animal: TreePattern.oneOf([
   *     { kind: 'dog', bark: 'loud' },
   *     { kind: 'cat', meow: 'quiet' }
   *   ])
   * });
   * if (myPattern.match({ animal: { kind: 'dog', bark: 'loud' } })) {
   *   console.log('I can match dog.');
   * }
   * if (myPattern.match({ animal: { kind: 'cat', meow: 'quiet' } })) {
   *   console.log('I can match cat, too.');
   * }
   * ```
   */
  public static oneOf(possibleSubtrees: TreeNode[]): TreeNode {
    return new TreePatternAlternatives(possibleSubtrees);
  }

  /**
   * Match an input tree.
   *
   * @remarks
   * Return true if the `root` node matches the pattern.  (If the `root` node does not match, the child nodes are
   * not recursively tested, since for an Abstract Syntax Tree the caller is typically an efficient visitor
   * callback that already handles that job.)
   *
   * If the input matches the pattern, any tagged subtrees will be assigned to the `captures` target object
   * if provided.  If the input does not match, the path of the mismatched node will be assigned to
   * `captures.failPath`.
   *
   * @param root - the input tree to be matched
   * @param captures - an optional object to receive any subtrees that were matched using {@link TreePattern.tag}
   * @returns `true` if `root` matches the pattern, or `false` otherwise
   */
  public match(root: TreeNode, captures: ITreePatternCaptureSet = {}): boolean {
    return TreePattern._matchTreeRecursive(root, this._pattern, captures, 'root');
  }

  private static _matchTreeRecursive(
    root: TreeNode,
    pattern: TreeNode,
    captures: ITreePatternCaptureSet,
    path: string
  ): boolean {
    if (pattern === undefined) {
      throw new Error('pattern has an undefined value at ' + path);
    }

    // Avoid "Element implicitly has an 'any' type" (TS7053)
    const castedCaptures: Record<string, TreeNode> = captures;

    if (pattern instanceof TreePatternArg) {
      if (pattern.subtree !== undefined) {
        if (!TreePattern._matchTreeRecursive(root, pattern.subtree, captures, path)) {
          return false;
        }
      }

      castedCaptures[pattern.keyName] = root;
      return true;
    }

    if (pattern instanceof TreePatternAlternatives) {
      // Try each possible alternative until we find one that matches
      for (const possibleSubtree of pattern.possibleSubtrees) {
        // We shouldn't update "captures" unless the match is fully successful.
        // So make a temporary copy of it.
        const tempCaptures: Record<string, TreeNode> = { ...captures };
        if (TreePattern._matchTreeRecursive(root, possibleSubtree, tempCaptures, path)) {
          // The match was successful, so assign the tempCaptures results back into the
          // original "captures" object.
          for (const key of Object.getOwnPropertyNames(tempCaptures)) {
            castedCaptures[key] = tempCaptures[key];
          }
          return true;
        }
      }

      // None of the alternatives matched
      return false;
    }

    if (Array.isArray(pattern)) {
      if (!Array.isArray(root)) {
        captures.failPath = path;
        return false;
      }

      if (root.length !== pattern.length) {
        captures.failPath = path;
        return false;
      }

      for (let i: number = 0; i < pattern.length; ++i) {
        const subPath: string = path + '[' + i + ']';

        const rootElement: TreeNode = root[i];
        const patternElement: TreeNode = pattern[i];
        if (!TreePattern._matchTreeRecursive(rootElement, patternElement, captures, subPath)) {
          return false;
        }
      }

      return true;
    }

    // In JavaScript, typeof null === 'object'
    if (typeof pattern === 'object' && pattern !== null) {
      if (typeof root !== 'object' || root === null) {
        captures.failPath = path;
        return false;
      }

      for (const keyName of Object.getOwnPropertyNames(pattern)) {
        let subPath: string;
        if (/^[a-z_][a-z0-9_]*$/i.test(keyName)) {
          subPath = path + '.' + keyName;
        } else {
          subPath = path + '[' + JSON.stringify(keyName) + ']';
        }

        if (!Object.hasOwnProperty.call(root, keyName)) {
          captures.failPath = subPath;
          return false;
        }
        if (!TreePattern._matchTreeRecursive(root[keyName], pattern[keyName], captures, subPath)) {
          return false;
        }
      }

      return true;
    }

    if (root !== pattern) {
      captures.failPath = path;
      return false;
    }

    return true;
  }
}
