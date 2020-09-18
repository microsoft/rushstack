// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export type IMatchTreeCaptureSet =
  | {
      [key: string]: any;
    }
  | { failPath: string };

class MatchTreeArg {
  public readonly keyName: string;
  public readonly subtree: any | undefined;
  public constructor(keyName: string, subtree?: any) {
    this.keyName = keyName;
    this.subtree = subtree;
  }
}

class MatchTreeAlternatives {
  public readonly possibleSubtrees: any[];
  public constructor(possibleSubtrees: any[]) {
    this.possibleSubtrees = possibleSubtrees;
  }
}

function matchTreeRecursive(root: any, pattern: any, captures: IMatchTreeCaptureSet, path: string): boolean {
  if (pattern === undefined) {
    throw new Error('pattern has an undefined value at ' + path);
  }

  if (pattern instanceof MatchTreeArg) {
    if (pattern.subtree !== undefined) {
      if (!matchTreeRecursive(root, pattern.subtree, captures, path)) {
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
      const tempCaptures = { ...captures };
      if (matchTreeRecursive(root, possibleSubtree, tempCaptures, path)) {
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

    for (let i = 0; i < pattern.length; ++i) {
      const subPath: string = path + '[' + i + ']';

      const rootElement = root[i];
      const patternElement = pattern[i];
      if (!matchTreeRecursive(rootElement, patternElement, captures, subPath)) {
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
      if (!matchTreeRecursive(root[keyName], pattern[keyName], captures, subPath)) {
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

/**
 * Starting at `root`, search for the first subtree that matches `pattern`.
 * If found, return true and assign the matching nodes to the `captures` object.
 */
export function matchTree(root: any, pattern: any, captures: IMatchTreeCaptureSet = {}): boolean {
  return matchTreeRecursive(root, pattern, captures, 'root');
}

/**
 * Used to build the `pattern` tree for `matchTree()`.  For the given `subtree` of the pattern,
 * if it is matched, that node will be assigned to the `captures` object using `keyName`.
 */
export function matchTreeArg(keyName: string, subtree?: any): any {
  return new MatchTreeArg(keyName, subtree);
}

/**
 * Used to build the `pattern` tree for `matchTree()`.  Allows several alternative patterns
 * to be matched for a given subtree.
 */
export function matchTreeAlternatives(possibleSubtrees: any[]): any {
  return new MatchTreeAlternatives(possibleSubtrees);
}
