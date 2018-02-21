// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

/**
 * Helper functions for working with file paths.
 * @public
 */
export class Path {
  /**
   * Returns true if childPath refers to a location under parentPath.
   * @remarks
   * If the paths are relative, they will first be resolved using path.resolve().
   */
  public static isUnder(childPath: string, parentPath: string): boolean {
    const relativePath: string = path.relative(path.resolve(childPath), path.resolve(parentPath));
    return /^[.\/\\]+$/.test(relativePath);
  }
}
