// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

// These helpers are borrowed from @rushstack/node-core-library
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
    const relativePath: string = path.relative(childPath, parentFolderPath);
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
    return path.relative(path1, path2) === '';
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
