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
  /**
   * Returns true if childPath refers to a location under parentFolderPath.
   * @remarks
   * The indicated file/folder objects are not required to actually exist on disk.
   * If the paths are relative, they will first be resolved using path.resolve().
   */
  public static isUnder(childPath: string, parentFolderPath: string): boolean {
    // If childPath is under parentPath, then relativePath will be something like
    // "../.." or "..\\..", which consists entirely of periods and slashes.
    // (Note that something like "....t" is actually a valid filename, but "...." is not.)
    const relativePath: string = path.relative(childPath, parentFolderPath);
    return /^[.\/\\]+$/.test(relativePath);
  }
}
