// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as fs from 'node:fs';

export type ParsedPath = path.ParsedPath;

const RELATIVE_PATH_REGEXP: RegExp = /^[.\/\\]+$/;

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

  // Removes redundant trailing slashes from a path.
  private static _trimTrailingSlashes(inputPath: string): string {
    // Examples:
    // "/a/b///\\" --> "/a/b"
    // "/"         --> "/"
    return inputPath.replace(/(?<=[^\/\\])[\/\\]+$/, '');
  }

  // An implementation of path.relative() that is case-insensitive.
  private static _relativeCaseInsensitive(from: string, to: string): string {
    // path.relative() apples path.normalize() and also trims any trailing slashes.
    // Since we'll be matching toNormalized against result, we need to do that for our string as well.
    const normalizedTo: string = Path._trimTrailingSlashes(path.normalize(to));

    // We start by converting everything to uppercase and call path.relative()
    const uppercasedFrom: string = from.toUpperCase();
    const uppercasedTo: string = normalizedTo.toUpperCase();

    // The result will be all uppercase because its inputs were uppercased
    const uppercasedResult: string = path.relative(uppercasedFrom, uppercasedTo);

    // Are there any cased characters in the result?
    if (uppercasedResult.toLowerCase() === uppercasedResult) {
      // No cased characters
      // Example: "../.."
      return uppercasedResult;
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
    // Scan backwards comparing uppercasedResult versus uppercasedTo, stopping at the first place where they differ.
    let resultIndex: number = uppercasedResult.length;
    let toIndex: number = normalizedTo.length;
    for (;;) {
      if (resultIndex === 0 || toIndex === 0) {
        // Stop if we reach the start of the string
        break;
      }

      if (uppercasedResult.charCodeAt(resultIndex - 1) !== uppercasedTo.charCodeAt(toIndex - 1)) {
        // Stop before we reach a character that is different
        break;
      }

      --resultIndex;
      --toIndex;
    }

    // Replace the matching part with the properly cased substring from the "normalizedTo" input
    //
    // Example:
    //   ".." + "/d/e" = "../d/e"
    return uppercasedResult.substring(0, resultIndex) + normalizedTo.substring(toIndex);
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
    return RELATIVE_PATH_REGEXP.test(relativePath);
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
