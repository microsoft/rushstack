// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Specifies the behavior of APIs such as {@link FileSystem.copyFile} or
 * {@link FileSystem.createSymbolicLinkFile} when the output file path already exists.
 *
 * @remarks
 * For {@link FileSystem.copyFile} and related APIs, the "output file path" is
 * {@link IFileSystemCopyFileOptions.destinationPath}.
 *
 * For {@link FileSystem.createSymbolicLinkFile} and related APIs, the "output file path" is
 * {@link IFileSystemCreateLinkOptions.newLinkPath}.
 *
 * @public
 */
export enum AlreadyExistsBehavior {
  /**
   * If the output file path already exists, try to overwrite the existing object.
   *
   * @remarks
   * If overwriting the object would require recursively deleting a folder tree,
   * then the operation will fail.  As an example, suppose {@link FileSystem.copyFile}
   * is copying a single file `/a/b/c` to the destination path `/d/e`, and `/d/e` is a
   * nonempty folder.  In this situation, an error will be reported; specifying
   * `AlreadyExistsBehavior.Overwrite` does not help.  Empty folders can be overwritten
   * depending on the details of the implementation.
   */
  Overwrite = 'overwrite',

  /**
   * If the output file path already exists, the operation will fail, and an error
   * will be reported.
   */
  Error = 'error',

  /**
   * If the output file path already exists, skip this item, and continue the operation.
   */
  Ignore = 'ignore'
}
