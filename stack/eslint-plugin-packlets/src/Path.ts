// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fs from 'fs';

export type ParsedPath = path.ParsedPath;

export class Path {
  /**
   * Whether the filesystem is assumed to be case sensitive for Path operations.
   *
   * @remarks
   * Regardless of operating system, a given file system's paths may be case-sensitive or case-insensitive.
   * If a volume is mounted under a subfolder, then different parts of a path can even have different
   * case-sensitivity.  The Node.js "path" API naively assumes that all Windows paths are case-insensitive,
   * and that all other OS's are case-sensitive.  This is way off, for example a modern MacBook has a
   * case-insensitive filesystem by default.  There isn't an easy workaround because Node.js does not expose
   * the native OS APIs that would give accurate answers.
   *
   * The TypeScript compiler does somewhat better: it performs an empirical test of its own bundle path to see
   * whether it can be read using different case.  If so, it normalizes all paths to lowercase (sometimes with
   * no API for retrieving the real path).  This caused our Path.isUnder() to return incorrect answers because
   * it relies on Node.js path.relative().
   *
   * To solve that problem, Path.ts performs an empirical test similar to what the TypeScript compiler does,
   * and then we adjust path.relative() to be case insensitive if appropriate.
   *
   * @see {@link https://nodejs.org/en/docs/guides/working-with-different-filesystems/}
   */
  public static usingCaseSensitive: boolean = Path._detectCaseSensitive();

  private static _detectCaseSensitive(): boolean {
    // Can our own file be accessed using a path with different case?  If so, then the filesystem is case-insensitive.
    return !fs.existsSync(__filename.toUpperCase());
  }

  // An implementation of path.relative() that is case-insensitive.
  private static _relativeCaseInsensitive(from: string, to: string): string {
    // Convert everything to uppercase and call path.relative()
    const fromNormalized: string = from.toUpperCase();
    const toNormalized: string = to.toUpperCase();
    const result: string = path.relative(fromNormalized, toNormalized);

    // Are there any cased characters in the result?
    const lowerCasedResult = result.toLowerCase();
    if (lowerCasedResult === result) {
      // No cased characters
      // Example: "../.."
      return lowerCasedResult;
    }

    // Example:
    //   from="/a/b/c"
    //   to="/a/b/d/e"
    //
    //   fromNormalized="/A/B/C"
    //   toNormalized="/A/B/D/E"
    //
    //   result="../D/E"
    //
    // Scan backwards through result and toNormalized, to find the first character where they differ
    let resultIndex: number = result.length;
    let toIndex: number = toNormalized.length;
    for (;;) {
      if (resultIndex === 0 || toIndex === 0) {
        break;
      }
      --resultIndex;
      --toIndex;
      if (result.charCodeAt(resultIndex) !== toNormalized.charCodeAt(toIndex)) {
        break;
      }
    }

    // Replace the matching part with the casing from the "to" input
    //
    // Example:
    //   ".." + "/d/e" = "../d/e"
    return result.substring(0, resultIndex) + to.substring(toIndex);
  }

  public static relative(from: string, to: string): string {
    if (!Path.usingCaseSensitive) {
      return Path._relativeCaseInsensitive(from, to);
    }
    return path.relative(from, to);
  }

  // --------------------------------------------------------------------------------------------------------
  // The operations below don't care about case sensitivity

  public static dirname(p: string): string {
    return path.dirname(p);
  }

  public static join(...paths: string[]): string {
    return path.join(...paths);
  }

  public static resolve(...pathSegments: string[]): string {
    return path.resolve(...pathSegments);
  }

  public static parse(pathString: string): ParsedPath {
    return path.parse(pathString);
  }

  // --------------------------------------------------------------------------------------------------------
  // The operations below are borrowed from @rushstack/node-core-library

  private static _relativePathRegex: RegExp = /^[.\/\\]+$/;

  /**
   * Returns true if "childPath" is located inside the "parentFolderPath" folder
   * or one of its child folders.  Note that "parentFolderPath" is not considered to be
   * under itself.  The "childPath" can refer to any type of file system object.
   *
   * @remarks
   * The indicated file/folder objects are not required to actually exist on disk.
   * For example, "parentFolderPath" is interpreted as a folder name even if it refers to a file.
   * If the paths are relative, they will first be resolved using path.resolve().
   */
  public static isUnder(childPath: string, parentFolderPath: string): boolean {
    const relativePath: string = Path.relative(childPath, parentFolderPath);
    return Path._relativePathRegex.test(relativePath);
  }

  /**
   * Returns true if `path1` and `path2` refer to the same underlying path.
   *
   * @remarks
   *
   * The comparison is performed using `path.relative()`.
   */
  public static isEqual(path1: string, path2: string): boolean {
    return Path.relative(path1, path2) === '';
  }

  /**
   * Replaces Windows-style backslashes with POSIX-style slashes.
   *
   * @remarks
   * POSIX is a registered trademark of the Institute of Electrical and Electronic Engineers, Inc.
   */
  public static convertToSlashes(inputPath: string): string {
    return inputPath.split('\\').join('/');
  }
}
