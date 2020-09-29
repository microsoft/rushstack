// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

/**
 * Common operations for manipulating file and directory paths.
 * @remarks
 * This API is intended to eventually be a complete replacement for the NodeJS "path" API.
 * @public
 */
export class Path {
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
    // If childPath is under parentPath, then relativePath will be something like
    // "../.." or "..\\..", which consists entirely of periods and slashes.
    // (Note that something like "....t" is actually a valid filename, but "...." is not.)
    const relativePath: string = path.relative(childPath, parentFolderPath);
    return Path._relativePathRegex.test(relativePath);
  }

  /**
   * Returns true if "childPath" is equal to "parentFolderPath", or if it is inside that folder
   * or one of its children.  The "childPath" can refer to any type of file system object.
   *
   * @remarks
   * The indicated file/folder objects are not required to actually exist on disk.
   * For example, "parentFolderPath" is interpreted as a folder name even if it refers to a file.
   * If the paths are relative, they will first be resolved using path.resolve().
   */
  public static isUnderOrEqual(childPath: string, parentFolderPath: string): boolean {
    const relativePath: string = path.relative(childPath, parentFolderPath);
    return relativePath === '' || Path._relativePathRegex.test(relativePath);
  }

  /**
   * Returns true if `path1` and `path2` refer to the same underlying path.
   *
   * @remarks
   *
   * The comparison is performed using `path.relative()`.
   */
  public static isEqual(path1: string, path2: string): boolean {
    return path.relative(path1, path2) === '';
  }

  /**
   * If `longPath` is under `parentFolderPath`, then this returns a shortened relative path.
   * Otherwise, it converts it to an absolute path.
   *
   * @remarks
   * This is useful when displaying a file path that is typically expected to be under the current
   * working directory; in the unusual case where it is in another folder, the full path is interesting.
   */
  public static makeRelativeOnlyIfUnder(longPath: string, parentFolderPath: string): string {
    // Same logic as Path.isUnderOrEqual()
    const relativePath: string = path.relative(longPath, parentFolderPath);
    const isUnderOrEqual: boolean = relativePath === '' || Path._relativePathRegex.test(relativePath);

    if (isUnderOrEqual) {
      return relativePath;
    } else {
      return path.resolve(longPath);
    }
  }
}
