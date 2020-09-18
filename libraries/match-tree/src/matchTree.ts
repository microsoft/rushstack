// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TreeNode = any;

class MatchTreeArg {
  public readonly keyName: string;
  public readonly subtree: TreeNode | undefined;
  public constructor(keyName: string, subtree?: TreeNode) {
    this.keyName = keyName;
    this.subtree = subtree;
  }
}

class MatchTreeAlternatives {
  public readonly possibleSubtrees: TreeNode[];
  public constructor(possibleSubtrees: TreeNode[]) {
    this.possibleSubtrees = possibleSubtrees;
  }
}

/**
 * @public
 */
export type IMatchTreeCaptureSet =
  | {
      [key: string]: TreeNode;
    }
  | { failPath: string };

/**
 * @public
 */
export class MatchTree {
  /**
   * Used to build the `pattern` tree for `matchTree()`.  For the given `subtree` of the pattern,
   * if it is matched, that node will be assigned to the `captures` object using `keyName`.
   */
  public static matchTreeArg(keyName: string, subtree?: TreeNode): TreeNode {
    return new MatchTreeArg(keyName, subtree);
  }

  /**
   * Used to build the `pattern` tree for `matchTree()`.  Allows several alternative patterns
   * to be matched for a given subtree.
   */
  public static matchTreeAlternatives(possibleSubtrees: TreeNode[]): TreeNode {
    return new MatchTreeAlternatives(possibleSubtrees);
  }

  /**
   * Starting at `root`, search for the first subtree that matches `pattern`.
   * If found, return true and assign the matching nodes to the `captures` object.
   */
  public static matchTree(root: TreeNode, pattern: TreeNode, captures: IMatchTreeCaptureSet = {}): boolean {
    return MatchTree._matchTreeRecursive(root, pattern, captures, 'root');
  }

  private static _matchTreeRecursive(
    root: TreeNode,
    pattern: TreeNode,
    captures: IMatchTreeCaptureSet,
    path: string
  ): boolean {
    if (pattern === undefined) {
      throw new Error('pattern has an undefined value at ' + path);
    }

    if (pattern instanceof MatchTreeArg) {
      if (pattern.subtree !== undefined) {
        if (!MatchTree._matchTreeRecursive(root, pattern.subtree, captures, path)) {
          return false;
        }
      }

      captures[pattern.keyName] = root;
      return true;
    }

    if (pattern instanceof MatchTreeAlternatives) {
      // Try each possible alternative until we find one that matches
      for (const possibleSubtree of pattern.possibleSubtrees) {
        // We shouldn't update "captures" unless the match is fully successful.
        // So make a temporary copy of it.
        const tempCaptures: IMatchTreeCaptureSet = { ...captures };
        if (MatchTree._matchTreeRecursive(root, possibleSubtree, tempCaptures, path)) {
          // The match was successful, so assign the tempCaptures results back into the
          // original "captures" object.
          for (const key of Object.getOwnPropertyNames(tempCaptures)) {
            captures[key] = tempCaptures[key];
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
        if (!MatchTree._matchTreeRecursive(rootElement, patternElement, captures, subPath)) {
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
        if (!MatchTree._matchTreeRecursive(root[keyName], pattern[keyName], captures, subPath)) {
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
