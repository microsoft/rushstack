// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export { AlreadyExistsBehavior } from './FileSystem/AlreadyExistsBehavior';

export type {
  FileSystemCopyFilesAsyncFilter,
  FileSystemCopyFilesFilter,
  FileSystemStats,
  FolderItem,
  IFileSystemCopyFileBaseOptions,
  IFileSystemCopyFileOptions,
  IFileSystemCopyFilesAsyncOptions,
  IFileSystemCopyFilesOptions,
  IFileSystemCreateLinkOptions,
  IFileSystemDeleteFileOptions,
  IFileSystemMoveOptions,
  IFileSystemReadFileOptions,
  IFileSystemReadFolderOptions,
  IFileSystemUpdateTimeParameters,
  IFileSystemWriteFileOptions
} from './FileSystem/interfaces';

/**
 * The FileSystem API provides a complete set of recommended operations for interacting with the file system.
 *
 * @remarks
 * We recommend to use this instead of the native `fs` API, because `fs` is a minimal set of low-level
 * primitives that must be mapped for each supported operating system. The FileSystem API takes a
 * philosophical approach of providing "one obvious way" to do each operation. We also prefer synchronous
 * operations except in cases where there would be a clear performance benefit for using async, since synchronous
 * code is much easier to read and debug. Also, indiscriminate parallelism has been seen to actually worsen
 * performance, versus improving it.
 *
 * Note that in the documentation, we refer to "filesystem objects", this can be a
 * file, folder, symbolic link, hard link, directory junction, etc.
 *
 * @public
 */
import * as FileSystem from './FileSystem/FileSystem';
export { FileSystem };
