// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as fs from 'fs';
import type { NewlineKind, Encoding } from '../Text';
import type { AlreadyExistsBehavior } from './AlreadyExistsBehavior';

/**
 * An alias for the Node.js `fs.Stats` object.
 *
 * @remarks
 * This avoids the need to import the `fs` package when using the {@link FileSystem} API.
 * @public
 */
export type FileSystemStats = fs.Stats;

/**
 * An alias for the Node.js `fs.Dirent` object.
 *
 * @remarks
 * This avoids the need to import the `fs` package when using the {@link FileSystem} API.
 * @public
 */
export type FolderItem = fs.Dirent;

// The PosixModeBits are intended to be used with bitwise operations.
/* eslint-disable no-bitwise */

/**
 * The options for {@link FileSystem.readFolder}
 * @public
 */
export interface IFileSystemReadFolderOptions {
  /**
   * If true, returns the absolute paths of the files in the folder.
   * @defaultValue false
   */
  absolutePaths?: boolean;
}

/**
 * The options for {@link FileSystem.writeFile}
 * @public
 */
export interface IFileSystemWriteFileOptions {
  /**
   * If true, will ensure the folder is created before writing the file.
   * @defaultValue false
   */
  ensureFolderExists?: boolean;

  /**
   * If specified, will normalize line endings to the specified style of newline.
   * @defaultValue `undefined` which means no conversion will be performed
   */
  convertLineEndings?: NewlineKind;

  /**
   * If specified, will change the encoding of the file that will be written.
   * @defaultValue "utf8"
   */
  encoding?: Encoding;
}

/**
 * The options for {@link FileSystem.readFile}
 * @public
 */
export interface IFileSystemReadFileOptions {
  /**
   * If specified, will change the encoding of the file that will be written.
   * @defaultValue Encoding.Utf8
   */
  encoding?: Encoding;

  /**
   * If specified, will normalize line endings to the specified style of newline.
   * @defaultValue `undefined` which means no conversion will be performed
   */
  convertLineEndings?: NewlineKind;
}

/**
 * The options for {@link FileSystem.move}
 * @public
 */
export interface IFileSystemMoveOptions {
  /**
   * The path of the existing object to be moved.
   * The path may be absolute or relative.
   */
  sourcePath: string;

  /**
   * The new path for the object.
   * The path may be absolute or relative.
   */
  destinationPath: string;

  /**
   * If true, will overwrite the file if it already exists.
   * @defaultValue true
   */
  overwrite?: boolean;

  /**
   * If true, will ensure the folder is created before writing the file.
   * @defaultValue false
   */
  ensureFolderExists?: boolean;
}

/**
 * @public
 */
export interface IFileSystemCopyFileBaseOptions {
  /**
   * The path of the existing object to be copied.
   * The path may be absolute or relative.
   */
  sourcePath: string;

  /**
   * Specifies what to do if the destination path already exists.
   * @defaultValue {@link AlreadyExistsBehavior.Overwrite}
   */
  alreadyExistsBehavior?: AlreadyExistsBehavior;
}

/**
 * The options for {@link FileSystem.copyFile}
 * @public
 */
export interface IFileSystemCopyFileOptions extends IFileSystemCopyFileBaseOptions {
  /**
   * The path that the object will be copied to.
   * The path may be absolute or relative.
   */
  destinationPath: string;
}

/**
 * Callback function type for {@link IFileSystemCopyFilesAsyncOptions.filter}
 * @public
 */
export type FileSystemCopyFilesAsyncFilter = (
  sourcePath: string,
  destinationPath: string
) => Promise<boolean>;

/**
 * Callback function type for {@link IFileSystemCopyFilesOptions.filter}
 * @public
 */
export type FileSystemCopyFilesFilter = (sourcePath: string, destinationPath: string) => boolean;

/**
 * The options for {@link FileSystem.copyFilesAsync}
 * @public
 */
export interface IFileSystemCopyFilesAsyncOptions {
  /**
   * The starting path of the file or folder to be copied.
   * The path may be absolute or relative.
   */
  sourcePath: string;

  /**
   * The path that the files will be copied to.
   * The path may be absolute or relative.
   */
  destinationPath: string;

  /**
   * If true, then when copying symlinks, copy the target object instead of copying the link.
   */
  dereferenceSymlinks?: boolean;

  /**
   * Specifies what to do if a destination path already exists.
   *
   * @remarks
   * This setting is applied individually for each file being copied.
   * For example, `AlreadyExistsBehavior.Overwrite` will not recursively delete a folder
   * whose path corresponds to an individual file that is being copied to that location.
   */
  alreadyExistsBehavior?: AlreadyExistsBehavior;

  /**
   * If true, then the target object will be assigned "last modification" and "last access" timestamps
   * that are the same as the source.  Otherwise, the OS default timestamps are assigned.
   */
  preserveTimestamps?: boolean;

  /**
   * A callback that will be invoked for each path that is copied.  The callback can return `false`
   * to cause the object to be excluded from the operation.
   */
  filter?: FileSystemCopyFilesAsyncFilter | FileSystemCopyFilesFilter;
}

/**
 * The options for {@link FileSystem.copyFiles}
 * @public
 */
export interface IFileSystemCopyFilesOptions extends IFileSystemCopyFilesAsyncOptions {
  /**  {@inheritdoc IFileSystemCopyFilesAsyncOptions.filter} */
  filter?: FileSystemCopyFilesFilter; // narrow the type to exclude FileSystemCopyFilesAsyncFilter
}

/**
 * The options for {@link FileSystem.deleteFile}
 * @public
 */
export interface IFileSystemDeleteFileOptions {
  /**
   * If true, will throw an exception if the file did not exist before `deleteFile()` was called.
   * @defaultValue false
   */
  throwIfNotExists?: boolean;
}

/**
 * The options for {@link FileSystem.updateTimes}
 * Both times must be specified.
 * @public
 */
export interface IFileSystemUpdateTimeParameters {
  /**
   * The POSIX epoch time or Date when this was last accessed.
   */
  accessedTime: number | Date;

  /**
   * The POSIX epoch time or Date when this was last modified
   */
  modifiedTime: number | Date;
}

/**
 * The options for {@link FileSystem.createSymbolicLinkJunction}, {@link FileSystem.createSymbolicLinkFile},
 * {@link FileSystem.createSymbolicLinkFolder}, and {@link FileSystem.createHardLink}.
 *
 * @public
 */
export interface IFileSystemCreateLinkOptions {
  /**
   * The newly created symbolic link will point to `linkTargetPath` as its target.
   */
  linkTargetPath: string;

  /**
   * The newly created symbolic link will have this path.
   */
  newLinkPath: string;

  /**
   * Specifies what to do if the path to create already exists.
   * The default is `AlreadyExistsBehavior.Error`.
   */
  alreadyExistsBehavior?: AlreadyExistsBehavior;
}

/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface _IInternalFileSystemCreateLinkOptions extends IFileSystemCreateLinkOptions {
  /**
   * Specifies if the link target must exist.
   */
  linkTargetMustExist?: boolean;
}
