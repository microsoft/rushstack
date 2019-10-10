// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The data structure returned by {@link getPackageDeps}.
 * @public
 */
export interface IPackageDeps {
  /**
   * The `key` is a source file path, relative to the package folder.  The value is the Git hash.
   */
  files: { [key: string]: string };

  /**
   * An optional field used to story command-line arguments for the build.
   */
  arguments?: string;
}
