// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodeJsPath from 'node:path';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';

import * as fsx from 'fs-extra';

import { Text, type NewlineKind, Encoding } from './Text.ts';
import { PosixModeBits } from './PosixModeBits.ts';

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
 * The options for {@link FileSystem.readFolderItems} and {@link FileSystem.readFolderItemNames}.
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
 * The options for {@link FileSystem.writeBuffersToFile}
 * @public
 */
export interface IFileSystemWriteBinaryFileOptions {
  /**
   * If true, will ensure the folder is created before writing the file.
   * @defaultValue false
   */
  ensureFolderExists?: boolean;
}

/**
 * The options for {@link FileSystem.writeFile}
 * @public
 */
export interface IFileSystemWriteFileOptions extends IFileSystemWriteBinaryFileOptions {
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

interface IInternalFileSystemCreateLinkOptions extends IFileSystemCreateLinkOptions {
  /**
   * Specifies if the link target must exist.
   */
  linkTargetMustExist?: boolean;
}

const MOVE_DEFAULT_OPTIONS: Partial<IFileSystemMoveOptions> = {
  overwrite: true,
  ensureFolderExists: false
};

const READ_FOLDER_DEFAULT_OPTIONS: Partial<IFileSystemReadFolderOptions> = {
  absolutePaths: false
};

const WRITE_FILE_DEFAULT_OPTIONS: Partial<IFileSystemWriteFileOptions> = {
  ensureFolderExists: false,
  convertLineEndings: undefined,
  encoding: Encoding.Utf8
};

const APPEND_TO_FILE_DEFAULT_OPTIONS: Partial<IFileSystemWriteFileOptions> = {
  ...WRITE_FILE_DEFAULT_OPTIONS
};

const READ_FILE_DEFAULT_OPTIONS: Partial<IFileSystemReadFileOptions> = {
  encoding: Encoding.Utf8,
  convertLineEndings: undefined
};

const COPY_FILE_DEFAULT_OPTIONS: Partial<IFileSystemCopyFileOptions> = {
  alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
};

const COPY_FILES_DEFAULT_OPTIONS: Partial<IFileSystemCopyFilesOptions> = {
  alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
};

const DELETE_FILE_DEFAULT_OPTIONS: Partial<IFileSystemDeleteFileOptions> = {
  throwIfNotExists: false
};

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
export class FileSystem {
  // ===============
  // COMMON OPERATIONS
  // ===============

  /**
   * Returns true if the path exists on disk.
   * Behind the scenes it uses `fs.existsSync()`.
   * @remarks
   * There is a debate about the fact that after `fs.existsSync()` returns true,
   * the file might be deleted before fs.readSync() is called, which would imply that everybody
   * should catch a `readSync()` exception, and nobody should ever use `fs.existsSync()`.
   * We find this to be unpersuasive, since "unexceptional exceptions" really hinder the
   * break-on-exception debugging experience. Also, throwing/catching is generally slow.
   * @param path - The absolute or relative path to the filesystem object.
   */
  public static exists(path: string): boolean {
    return FileSystem._wrapException(() => {
      return fsx.existsSync(path);
    });
  }

  /**
   * An async version of {@link FileSystem.exists}.
   */
  public static async existsAsync(path: string): Promise<boolean> {
    return await FileSystem._wrapExceptionAsync(() => {
      return new Promise<boolean>((resolve: (result: boolean) => void) => {
        fsx.exists(path, resolve);
      });
    });
  }

  /**
   * Gets the statistics for a particular filesystem object.
   * If the path is a link, this function follows the link and returns statistics about the link target.
   * Behind the scenes it uses `fs.statSync()`.
   * @param path - The absolute or relative path to the filesystem object.
   */
  public static getStatistics(path: string): FileSystemStats {
    return FileSystem._wrapException(() => {
      return fsx.statSync(path);
    });
  }

  /**
   * An async version of {@link FileSystem.getStatistics}.
   */
  public static async getStatisticsAsync(path: string): Promise<FileSystemStats> {
    return await FileSystem._wrapExceptionAsync(() => {
      return fsx.stat(path);
    });
  }

  /**
   * Updates the accessed and modified timestamps of the filesystem object referenced by path.
   * Behind the scenes it uses `fs.utimesSync()`.
   * The caller should specify both times in the `times` parameter.
   * @param path - The path of the file that should be modified.
   * @param times - The times that the object should be updated to reflect.
   */
  public static updateTimes(path: string, times: IFileSystemUpdateTimeParameters): void {
    return FileSystem._wrapException(() => {
      fsx.utimesSync(path, times.accessedTime, times.modifiedTime);
    });
  }

  /**
   * An async version of {@link FileSystem.updateTimes}.
   */
  public static async updateTimesAsync(path: string, times: IFileSystemUpdateTimeParameters): Promise<void> {
    await FileSystem._wrapExceptionAsync(() => {
      // This cast is needed because the fs-extra typings require both parameters
      // to have the same type (number or Date), whereas Node.js does not require that.
      return fsx.utimes(path, times.accessedTime as number, times.modifiedTime as number);
    });
  }

  /**
   * Changes the permissions (i.e. file mode bits) for a filesystem object.
   * Behind the scenes it uses `fs.chmodSync()`.
   * @param path - The absolute or relative path to the object that should be updated.
   * @param modeBits - POSIX-style file mode bits specified using the {@link PosixModeBits} enum
   */
  public static changePosixModeBits(path: string, modeBits: PosixModeBits): void {
    FileSystem._wrapException(() => {
      fs.chmodSync(path, modeBits);
    });
  }

  /**
   * An async version of {@link FileSystem.changePosixModeBits}.
   */
  public static async changePosixModeBitsAsync(path: string, mode: PosixModeBits): Promise<void> {
    await FileSystem._wrapExceptionAsync(() => {
      return fsx.chmod(path, mode);
    });
  }

  /**
   * Retrieves the permissions (i.e. file mode bits) for a filesystem object.
   * Behind the scenes it uses `fs.chmodSync()`.
   * @param path - The absolute or relative path to the object that should be updated.
   *
   * @remarks
   * This calls {@link FileSystem.getStatistics} to get the POSIX mode bits.
   * If statistics in addition to the mode bits are needed, it is more efficient
   * to call {@link FileSystem.getStatistics} directly instead.
   */
  public static getPosixModeBits(path: string): PosixModeBits {
    return FileSystem._wrapException(() => {
      return FileSystem.getStatistics(path).mode;
    });
  }

  /**
   * An async version of {@link FileSystem.getPosixModeBits}.
   */
  public static async getPosixModeBitsAsync(path: string): Promise<PosixModeBits> {
    return await FileSystem._wrapExceptionAsync(async () => {
      return (await FileSystem.getStatisticsAsync(path)).mode;
    });
  }

  /**
   * Returns a 10-character string representation of a PosixModeBits value similar to what
   * would be displayed by a command such as "ls -l" on a POSIX-like operating system.
   * @remarks
   * For example, `PosixModeBits.AllRead | PosixModeBits.AllWrite` would be formatted as "-rw-rw-rw-".
   * @param modeBits - POSIX-style file mode bits specified using the {@link PosixModeBits} enum
   */
  public static formatPosixModeBits(modeBits: PosixModeBits): string {
    let result: string = '-'; // (later we may add support for additional states such as S_IFDIR or S_ISUID)

    result += modeBits & PosixModeBits.UserRead ? 'r' : '-';
    result += modeBits & PosixModeBits.UserWrite ? 'w' : '-';
    result += modeBits & PosixModeBits.UserExecute ? 'x' : '-';

    result += modeBits & PosixModeBits.GroupRead ? 'r' : '-';
    result += modeBits & PosixModeBits.GroupWrite ? 'w' : '-';
    result += modeBits & PosixModeBits.GroupExecute ? 'x' : '-';

    result += modeBits & PosixModeBits.OthersRead ? 'r' : '-';
    result += modeBits & PosixModeBits.OthersWrite ? 'w' : '-';
    result += modeBits & PosixModeBits.OthersExecute ? 'x' : '-';

    return result;
  }

  /**
   * Moves a file. The folder must exist, unless the `ensureFolderExists` option is provided.
   * Behind the scenes it uses `fs-extra.moveSync()`
   */
  public static move(options: IFileSystemMoveOptions): void {
    FileSystem._wrapException(() => {
      options = {
        ...MOVE_DEFAULT_OPTIONS,
        ...options
      };

      try {
        fsx.moveSync(options.sourcePath, options.destinationPath, { overwrite: options.overwrite });
      } catch (error) {
        if (options.ensureFolderExists) {
          if (!FileSystem.isNotExistError(error as Error)) {
            throw error;
          }

          const folderPath: string = nodeJsPath.dirname(options.destinationPath);
          FileSystem.ensureFolder(folderPath);
          fsx.moveSync(options.sourcePath, options.destinationPath, { overwrite: options.overwrite });
        } else {
          throw error;
        }
      }
    });
  }

  /**
   * An async version of {@link FileSystem.move}.
   */
  public static async moveAsync(options: IFileSystemMoveOptions): Promise<void> {
    await FileSystem._wrapExceptionAsync(async () => {
      options = {
        ...MOVE_DEFAULT_OPTIONS,
        ...options
      };

      try {
        await fsx.move(options.sourcePath, options.destinationPath, { overwrite: options.overwrite });
      } catch (error) {
        if (options.ensureFolderExists) {
          if (!FileSystem.isNotExistError(error as Error)) {
            throw error;
          }

          const folderPath: string = nodeJsPath.dirname(options.destinationPath);
          await FileSystem.ensureFolderAsync(nodeJsPath.dirname(folderPath));
          await fsx.move(options.sourcePath, options.destinationPath, { overwrite: options.overwrite });
        } else {
          throw error;
        }
      }
    });
  }

  // ===============
  // FOLDER OPERATIONS
  // ===============

  /**
   * Recursively creates a folder at a given path.
   * Behind the scenes is uses `fs-extra.ensureDirSync()`.
   * @remarks
   * Throws an exception if anything in the folderPath is not a folder.
   * @param folderPath - The absolute or relative path of the folder which should be created.
   */
  public static ensureFolder(folderPath: string): void {
    FileSystem._wrapException(() => {
      fsx.ensureDirSync(folderPath);
    });
  }

  /**
   * An async version of {@link FileSystem.ensureFolder}.
   */
  public static async ensureFolderAsync(folderPath: string): Promise<void> {
    await FileSystem._wrapExceptionAsync(() => {
      return fsx.ensureDir(folderPath);
    });
  }

  /**
   * Reads the names of folder entries, not including "." or "..".
   * Behind the scenes it uses `fs.readdirSync()`.
   * @param folderPath - The absolute or relative path to the folder which should be read.
   * @param options - Optional settings that can change the behavior. Type: `IReadFolderOptions`
   */
  public static readFolderItemNames(folderPath: string, options?: IFileSystemReadFolderOptions): string[] {
    return FileSystem._wrapException(() => {
      options = {
        ...READ_FOLDER_DEFAULT_OPTIONS,
        ...options
      };

      const fileNames: string[] = fsx.readdirSync(folderPath);
      if (options.absolutePaths) {
        return fileNames.map((fileName) => nodeJsPath.resolve(folderPath, fileName));
      } else {
        return fileNames;
      }
    });
  }

  /**
   * An async version of {@link FileSystem.readFolderItemNames}.
   */
  public static async readFolderItemNamesAsync(
    folderPath: string,
    options?: IFileSystemReadFolderOptions
  ): Promise<string[]> {
    return await FileSystem._wrapExceptionAsync(async () => {
      options = {
        ...READ_FOLDER_DEFAULT_OPTIONS,
        ...options
      };

      const fileNames: string[] = await fsx.readdir(folderPath);
      if (options.absolutePaths) {
        return fileNames.map((fileName) => nodeJsPath.resolve(folderPath, fileName));
      } else {
        return fileNames;
      }
    });
  }

  /**
   * Reads the contents of the folder, not including "." or "..", returning objects including the
   * entry names and types.
   * Behind the scenes it uses `fs.readdirSync()`.
   * @param folderPath - The absolute or relative path to the folder which should be read.
   * @param options - Optional settings that can change the behavior. Type: `IReadFolderOptions`
   */
  public static readFolderItems(folderPath: string, options?: IFileSystemReadFolderOptions): FolderItem[] {
    return FileSystem._wrapException(() => {
      options = {
        ...READ_FOLDER_DEFAULT_OPTIONS,
        ...options
      };

      const folderEntries: FolderItem[] = fsx.readdirSync(folderPath, { withFileTypes: true });
      if (options.absolutePaths) {
        return folderEntries.map((folderEntry) => {
          folderEntry.name = nodeJsPath.resolve(folderPath, folderEntry.name);
          return folderEntry;
        });
      } else {
        return folderEntries;
      }
    });
  }

  /**
   * An async version of {@link FileSystem.readFolderItems}.
   */
  public static async readFolderItemsAsync(
    folderPath: string,
    options?: IFileSystemReadFolderOptions
  ): Promise<FolderItem[]> {
    return await FileSystem._wrapExceptionAsync(async () => {
      options = {
        ...READ_FOLDER_DEFAULT_OPTIONS,
        ...options
      };

      const folderEntries: FolderItem[] = await fsPromises.readdir(folderPath, { withFileTypes: true });
      if (options.absolutePaths) {
        return folderEntries.map((folderEntry) => {
          folderEntry.name = nodeJsPath.resolve(folderPath, folderEntry.name);
          return folderEntry;
        });
      } else {
        return folderEntries;
      }
    });
  }

  /**
   * Deletes a folder, including all of its contents.
   * Behind the scenes is uses `fs-extra.removeSync()`.
   * @remarks
   * Does not throw if the folderPath does not exist.
   * @param folderPath - The absolute or relative path to the folder which should be deleted.
   */
  public static deleteFolder(folderPath: string): void {
    FileSystem._wrapException(() => {
      fsx.removeSync(folderPath);
    });
  }

  /**
   * An async version of {@link FileSystem.deleteFolder}.
   */
  public static async deleteFolderAsync(folderPath: string): Promise<void> {
    await FileSystem._wrapExceptionAsync(() => {
      return fsx.remove(folderPath);
    });
  }

  /**
   * Deletes the content of a folder, but not the folder itself. Also ensures the folder exists.
   * Behind the scenes it uses `fs-extra.emptyDirSync()`.
   * @remarks
   * This is a workaround for a common race condition, where the virus scanner holds a lock on the folder
   * for a brief period after it was deleted, causing EBUSY errors for any code that tries to recreate the folder.
   * @param folderPath - The absolute or relative path to the folder which should have its contents deleted.
   */
  public static ensureEmptyFolder(folderPath: string): void {
    FileSystem._wrapException(() => {
      fsx.emptyDirSync(folderPath);
    });
  }

  /**
   * An async version of {@link FileSystem.ensureEmptyFolder}.
   */
  public static async ensureEmptyFolderAsync(folderPath: string): Promise<void> {
    await FileSystem._wrapExceptionAsync(() => {
      return fsx.emptyDir(folderPath);
    });
  }

  // ===============
  // FILE OPERATIONS
  // ===============

  /**
   * Writes a text string to a file on disk, overwriting the file if it already exists.
   * Behind the scenes it uses `fs.writeFileSync()`.
   * @remarks
   * Throws an error if the folder doesn't exist, unless ensureFolder=true.
   * @param filePath - The absolute or relative path of the file.
   * @param contents - The text that should be written to the file.
   * @param options - Optional settings that can change the behavior. Type: `IWriteFileOptions`
   */
  public static writeFile(
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions
  ): void {
    FileSystem._wrapException(() => {
      options = {
        ...WRITE_FILE_DEFAULT_OPTIONS,
        ...options
      };

      if (options.convertLineEndings) {
        contents = Text.convertTo(contents.toString(), options.convertLineEndings);
      }

      try {
        fsx.writeFileSync(filePath, contents, { encoding: options.encoding });
      } catch (error) {
        if (options.ensureFolderExists) {
          if (!FileSystem.isNotExistError(error as Error)) {
            throw error;
          }

          const folderPath: string = nodeJsPath.dirname(filePath);
          FileSystem.ensureFolder(folderPath);
          fsx.writeFileSync(filePath, contents, { encoding: options.encoding });
        } else {
          throw error;
        }
      }
    });
  }

  /**
   * Writes the contents of multiple Uint8Arrays to a file on disk, overwriting the file if it already exists.
   * Behind the scenes it uses `fs.writevSync()`.
   *
   * This API is useful for writing large files efficiently, especially if the input is being concatenated from
   * multiple sources.
   *
   * @remarks
   * Throws an error if the folder doesn't exist, unless ensureFolder=true.
   * @param filePath - The absolute or relative path of the file.
   * @param contents - The content that should be written to the file.
   * @param options - Optional settings that can change the behavior.
   */
  public static writeBuffersToFile(
    filePath: string,
    contents: ReadonlyArray<NodeJS.ArrayBufferView>,
    options?: IFileSystemWriteBinaryFileOptions
  ): void {
    FileSystem._wrapException(() => {
      // Need a mutable copy of the iterable to handle incomplete writes,
      // since writev() doesn't take an argument for where to start writing.
      const toCopy: NodeJS.ArrayBufferView[] = [...contents];

      let fd: number | undefined;
      try {
        fd = fsx.openSync(filePath, 'w');
      } catch (error) {
        if (!options?.ensureFolderExists || !FileSystem.isNotExistError(error as Error)) {
          throw error;
        }

        const folderPath: string = nodeJsPath.dirname(filePath);
        FileSystem.ensureFolder(folderPath);
        fd = fsx.openSync(filePath, 'w');
      }

      try {
        // In practice this loop will have exactly 1 iteration, but the spec allows
        // for a writev call to write fewer bytes than requested
        while (toCopy.length) {
          let bytesWritten: number = fsx.writevSync(fd, toCopy);
          let buffersWritten: number = 0;
          while (buffersWritten < toCopy.length) {
            const bytesInCurrentBuffer: number = toCopy[buffersWritten].byteLength;
            if (bytesWritten < bytesInCurrentBuffer) {
              // This buffer was partially written.
              const currentToCopy: NodeJS.ArrayBufferView = toCopy[buffersWritten];
              toCopy[buffersWritten] = new Uint8Array(
                currentToCopy.buffer,
                currentToCopy.byteOffset + bytesWritten,
                currentToCopy.byteLength - bytesWritten
              );
              break;
            }
            bytesWritten -= bytesInCurrentBuffer;
            buffersWritten++;
          }

          if (buffersWritten > 0) {
            // Avoid cost of shifting the array more than needed.
            toCopy.splice(0, buffersWritten);
          }
        }
      } finally {
        fsx.closeSync(fd);
      }
    });
  }

  /**
   * An async version of {@link FileSystem.writeFile}.
   */
  public static async writeFileAsync(
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions
  ): Promise<void> {
    await FileSystem._wrapExceptionAsync(async () => {
      options = {
        ...WRITE_FILE_DEFAULT_OPTIONS,
        ...options
      };

      if (options.convertLineEndings) {
        contents = Text.convertTo(contents.toString(), options.convertLineEndings);
      }

      try {
        await fsx.writeFile(filePath, contents, { encoding: options.encoding });
      } catch (error) {
        if (options.ensureFolderExists) {
          if (!FileSystem.isNotExistError(error as Error)) {
            throw error;
          }

          const folderPath: string = nodeJsPath.dirname(filePath);
          await FileSystem.ensureFolderAsync(folderPath);
          await fsx.writeFile(filePath, contents, { encoding: options.encoding });
        } else {
          throw error;
        }
      }
    });
  }

  /**
   * An async version of {@link FileSystem.writeBuffersToFile}.
   */
  public static async writeBuffersToFileAsync(
    filePath: string,
    contents: ReadonlyArray<NodeJS.ArrayBufferView>,
    options?: IFileSystemWriteBinaryFileOptions
  ): Promise<void> {
    await FileSystem._wrapExceptionAsync(async () => {
      // Need a mutable copy of the iterable to handle incomplete writes,
      // since writev() doesn't take an argument for where to start writing.
      const toCopy: NodeJS.ArrayBufferView[] = [...contents];

      let handle: fsPromises.FileHandle | undefined;
      try {
        handle = await fsPromises.open(filePath, 'w');
      } catch (error) {
        if (!options?.ensureFolderExists || !FileSystem.isNotExistError(error as Error)) {
          throw error;
        }

        const folderPath: string = nodeJsPath.dirname(filePath);
        await FileSystem.ensureFolderAsync(folderPath);
        handle = await fsPromises.open(filePath, 'w');
      }

      try {
        // In practice this loop will have exactly 1 iteration, but the spec allows
        // for a writev call to write fewer bytes than requested
        while (toCopy.length) {
          let bytesWritten: number = (await handle.writev(toCopy)).bytesWritten;
          let buffersWritten: number = 0;
          while (buffersWritten < toCopy.length) {
            const bytesInCurrentBuffer: number = toCopy[buffersWritten].byteLength;
            if (bytesWritten < bytesInCurrentBuffer) {
              // This buffer was partially written.
              const currentToCopy: NodeJS.ArrayBufferView = toCopy[buffersWritten];
              toCopy[buffersWritten] = new Uint8Array(
                currentToCopy.buffer,
                currentToCopy.byteOffset + bytesWritten,
                currentToCopy.byteLength - bytesWritten
              );
              break;
            }
            bytesWritten -= bytesInCurrentBuffer;
            buffersWritten++;
          }

          if (buffersWritten > 0) {
            // Avoid cost of shifting the array more than needed.
            toCopy.splice(0, buffersWritten);
          }
        }
      } finally {
        await handle.close();
      }
    });
  }

  /**
   * Writes a text string to a file on disk, appending to the file if it already exists.
   * Behind the scenes it uses `fs.appendFileSync()`.
   * @remarks
   * Throws an error if the folder doesn't exist, unless ensureFolder=true.
   * @param filePath - The absolute or relative path of the file.
   * @param contents - The text that should be written to the file.
   * @param options - Optional settings that can change the behavior. Type: `IWriteFileOptions`
   */
  public static appendToFile(
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions
  ): void {
    FileSystem._wrapException(() => {
      options = {
        ...APPEND_TO_FILE_DEFAULT_OPTIONS,
        ...options
      };

      if (options.convertLineEndings) {
        contents = Text.convertTo(contents.toString(), options.convertLineEndings);
      }

      try {
        fsx.appendFileSync(filePath, contents, { encoding: options.encoding });
      } catch (error) {
        if (options.ensureFolderExists) {
          if (!FileSystem.isNotExistError(error as Error)) {
            throw error;
          }

          const folderPath: string = nodeJsPath.dirname(filePath);
          FileSystem.ensureFolder(folderPath);
          fsx.appendFileSync(filePath, contents, { encoding: options.encoding });
        } else {
          throw error;
        }
      }
    });
  }

  /**
   * An async version of {@link FileSystem.appendToFile}.
   */
  public static async appendToFileAsync(
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions
  ): Promise<void> {
    await FileSystem._wrapExceptionAsync(async () => {
      options = {
        ...APPEND_TO_FILE_DEFAULT_OPTIONS,
        ...options
      };

      if (options.convertLineEndings) {
        contents = Text.convertTo(contents.toString(), options.convertLineEndings);
      }

      try {
        await fsx.appendFile(filePath, contents, { encoding: options.encoding });
      } catch (error) {
        if (options.ensureFolderExists) {
          if (!FileSystem.isNotExistError(error as Error)) {
            throw error;
          }

          const folderPath: string = nodeJsPath.dirname(filePath);
          await FileSystem.ensureFolderAsync(folderPath);
          await fsx.appendFile(filePath, contents, { encoding: options.encoding });
        } else {
          throw error;
        }
      }
    });
  }

  /**
   * Reads the contents of a file into a string.
   * Behind the scenes it uses `fs.readFileSync()`.
   * @param filePath - The relative or absolute path to the file whose contents should be read.
   * @param options - Optional settings that can change the behavior. Type: `IReadFileOptions`
   */
  public static readFile(filePath: string, options?: IFileSystemReadFileOptions): string {
    return FileSystem._wrapException(() => {
      options = {
        ...READ_FILE_DEFAULT_OPTIONS,
        ...options
      };

      let contents: string = FileSystem.readFileToBuffer(filePath).toString(options.encoding);
      if (options.convertLineEndings) {
        contents = Text.convertTo(contents, options.convertLineEndings);
      }

      return contents;
    });
  }

  /**
   * An async version of {@link FileSystem.readFile}.
   */
  public static async readFileAsync(filePath: string, options?: IFileSystemReadFileOptions): Promise<string> {
    return await FileSystem._wrapExceptionAsync(async () => {
      options = {
        ...READ_FILE_DEFAULT_OPTIONS,
        ...options
      };

      let contents: string = (await FileSystem.readFileToBufferAsync(filePath)).toString(options.encoding);
      if (options.convertLineEndings) {
        contents = Text.convertTo(contents, options.convertLineEndings);
      }

      return contents;
    });
  }

  /**
   * Reads the contents of a file into a buffer.
   * Behind the scenes is uses `fs.readFileSync()`.
   * @param filePath - The relative or absolute path to the file whose contents should be read.
   */
  public static readFileToBuffer(filePath: string): Buffer {
    return FileSystem._wrapException(() => {
      return fsx.readFileSync(filePath);
    });
  }

  /**
   * An async version of {@link FileSystem.readFileToBuffer}.
   */
  public static async readFileToBufferAsync(filePath: string): Promise<Buffer> {
    return await FileSystem._wrapExceptionAsync(() => {
      return fsx.readFile(filePath);
    });
  }

  /**
   * Copies a single file from one location to another.
   * By default, destinationPath is overwritten if it already exists.
   *
   * @remarks
   * The `copyFile()` API cannot be used to copy folders.  It copies at most one file.
   * Use {@link FileSystem.copyFiles} if you need to recursively copy a tree of folders.
   *
   * The implementation is based on `copySync()` from the `fs-extra` package.
   */
  public static copyFile(options: IFileSystemCopyFileOptions): void {
    options = {
      ...COPY_FILE_DEFAULT_OPTIONS,
      ...options
    };

    if (FileSystem.getStatistics(options.sourcePath).isDirectory()) {
      throw new Error(
        'The specified path refers to a folder; this operation expects a file object:\n' + options.sourcePath
      );
    }

    FileSystem._wrapException(() => {
      fsx.copySync(options.sourcePath, options.destinationPath, {
        errorOnExist: options.alreadyExistsBehavior === AlreadyExistsBehavior.Error,
        overwrite: options.alreadyExistsBehavior === AlreadyExistsBehavior.Overwrite
      });
    });
  }

  /**
   * An async version of {@link FileSystem.copyFile}.
   */
  public static async copyFileAsync(options: IFileSystemCopyFileOptions): Promise<void> {
    options = {
      ...COPY_FILE_DEFAULT_OPTIONS,
      ...options
    };

    if ((await FileSystem.getStatisticsAsync(options.sourcePath)).isDirectory()) {
      throw new Error(
        'The specified path refers to a folder; this operation expects a file object:\n' + options.sourcePath
      );
    }

    await FileSystem._wrapExceptionAsync(() => {
      return fsx.copy(options.sourcePath, options.destinationPath, {
        errorOnExist: options.alreadyExistsBehavior === AlreadyExistsBehavior.Error,
        overwrite: options.alreadyExistsBehavior === AlreadyExistsBehavior.Overwrite
      });
    });
  }

  /**
   * Copies a file or folder from one location to another, recursively copying any folder contents.
   * By default, destinationPath is overwritten if it already exists.
   *
   * @remarks
   * If you only intend to copy a single file, it is recommended to use {@link FileSystem.copyFile}
   * instead to more clearly communicate the intended operation.
   *
   * The implementation is based on `copySync()` from the `fs-extra` package.
   */
  public static copyFiles(options: IFileSystemCopyFilesOptions): void {
    options = {
      ...COPY_FILES_DEFAULT_OPTIONS,
      ...options
    };

    FileSystem._wrapException(() => {
      fsx.copySync(options.sourcePath, options.destinationPath, {
        dereference: !!options.dereferenceSymlinks,
        errorOnExist: options.alreadyExistsBehavior === AlreadyExistsBehavior.Error,
        overwrite: options.alreadyExistsBehavior === AlreadyExistsBehavior.Overwrite,
        preserveTimestamps: !!options.preserveTimestamps,
        filter: options.filter
      });
    });
  }

  /**
   * An async version of {@link FileSystem.copyFiles}.
   */
  public static async copyFilesAsync(options: IFileSystemCopyFilesAsyncOptions): Promise<void> {
    options = {
      ...COPY_FILES_DEFAULT_OPTIONS,
      ...options
    };

    await FileSystem._wrapExceptionAsync(async () => {
      await fsx.copy(options.sourcePath, options.destinationPath, {
        dereference: !!options.dereferenceSymlinks,
        errorOnExist: options.alreadyExistsBehavior === AlreadyExistsBehavior.Error,
        overwrite: options.alreadyExistsBehavior === AlreadyExistsBehavior.Overwrite,
        preserveTimestamps: !!options.preserveTimestamps,
        filter: options.filter
      });
    });
  }

  /**
   * Deletes a file. Can optionally throw if the file doesn't exist.
   * Behind the scenes it uses `fs.unlinkSync()`.
   * @param filePath - The absolute or relative path to the file that should be deleted.
   * @param options - Optional settings that can change the behavior. Type: `IDeleteFileOptions`
   */
  public static deleteFile(filePath: string, options?: IFileSystemDeleteFileOptions): void {
    FileSystem._wrapException(() => {
      options = {
        ...DELETE_FILE_DEFAULT_OPTIONS,
        ...options
      };

      try {
        fsx.unlinkSync(filePath);
      } catch (error) {
        if (options.throwIfNotExists || !FileSystem.isNotExistError(error as Error)) {
          throw error;
        }
      }
    });
  }

  /**
   * An async version of {@link FileSystem.deleteFile}.
   */
  public static async deleteFileAsync(
    filePath: string,
    options?: IFileSystemDeleteFileOptions
  ): Promise<void> {
    await FileSystem._wrapExceptionAsync(async () => {
      options = {
        ...DELETE_FILE_DEFAULT_OPTIONS,
        ...options
      };

      try {
        await fsx.unlink(filePath);
      } catch (error) {
        if (options.throwIfNotExists || !FileSystem.isNotExistError(error as Error)) {
          throw error;
        }
      }
    });
  }

  // ===============
  // LINK OPERATIONS
  // ===============

  /**
   * Gets the statistics of a filesystem object. Does NOT follow the link to its target.
   * Behind the scenes it uses `fs.lstatSync()`.
   * @param path - The absolute or relative path to the filesystem object.
   */
  public static getLinkStatistics(path: string): FileSystemStats {
    return FileSystem._wrapException(() => {
      return fsx.lstatSync(path);
    });
  }

  /**
   * An async version of {@link FileSystem.getLinkStatistics}.
   */
  public static async getLinkStatisticsAsync(path: string): Promise<FileSystemStats> {
    return await FileSystem._wrapExceptionAsync(() => {
      return fsx.lstat(path);
    });
  }

  /**
   * If `path` refers to a symbolic link, this returns the path of the link target, which may be
   * an absolute or relative path.
   *
   * @remarks
   * If `path` refers to a filesystem object that is not a symbolic link, then an `ErrnoException` is thrown
   * with code 'UNKNOWN'.  If `path` does not exist, then an `ErrnoException` is thrown with code `ENOENT`.
   *
   * @param path - The absolute or relative path to the symbolic link.
   * @returns the path of the link target
   */
  public static readLink(path: string): string {
    return FileSystem._wrapException(() => {
      return fsx.readlinkSync(path);
    });
  }

  /**
   * An async version of {@link FileSystem.readLink}.
   */
  public static async readLinkAsync(path: string): Promise<string> {
    return await FileSystem._wrapExceptionAsync(() => {
      return fsx.readlink(path);
    });
  }

  /**
   * Creates an NTFS "directory junction" on Windows operating systems; for other operating systems, it
   * creates a regular symbolic link.  The link target must be a folder, not a file.
   * Behind the scenes it uses `fs.symlinkSync()`.
   *
   * @remarks
   * For security reasons, Windows operating systems by default require administrator elevation to create
   * symbolic links.  As a result, on Windows it's generally recommended for Node.js tools to use hard links
   * (for files) or NTFS directory junctions (for folders), since regular users are allowed to create them.
   * Hard links and junctions are less vulnerable to symlink attacks because they cannot reference a network share,
   * and their target must exist at the time of link creation.  Non-Windows operating systems generally don't
   * restrict symlink creation, and as such are more vulnerable to symlink attacks.  Note that Windows can be
   * configured to permit regular users to create symlinks, for example by enabling Windows 10 "developer mode."
   *
   * A directory junction requires the link source and target to both be located on local disk volumes;
   * if not, use a symbolic link instead.
   */
  public static createSymbolicLinkJunction(options: IFileSystemCreateLinkOptions): void {
    FileSystem._wrapException(() => {
      return FileSystem._handleLink(() => {
        // For directories, we use a Windows "junction".  On POSIX operating systems, this produces a regular symlink.
        return fsx.symlinkSync(options.linkTargetPath, options.newLinkPath, 'junction');
      }, options);
    });
  }

  /**
   * An async version of {@link FileSystem.createSymbolicLinkJunction}.
   */
  public static async createSymbolicLinkJunctionAsync(options: IFileSystemCreateLinkOptions): Promise<void> {
    await FileSystem._wrapExceptionAsync(() => {
      return FileSystem._handleLinkAsync(() => {
        // For directories, we use a Windows "junction".  On POSIX operating systems, this produces a regular symlink.
        return fsx.symlink(options.linkTargetPath, options.newLinkPath, 'junction');
      }, options);
    });
  }

  /**
   * Creates a symbolic link to a file.  On Windows operating systems, this may require administrator elevation.
   * Behind the scenes it uses `fs.symlinkSync()`.
   *
   * @remarks
   * To avoid administrator elevation on Windows, use {@link FileSystem.createHardLink} instead.
   *
   * On Windows operating systems, the NTFS file system distinguishes file symlinks versus directory symlinks:
   * If the target is not the correct type, the symlink will be created successfully, but will fail to resolve.
   * Other operating systems do not make this distinction, in which case {@link FileSystem.createSymbolicLinkFile}
   * and {@link FileSystem.createSymbolicLinkFolder} can be used interchangeably, but doing so will make your
   * tool incompatible with Windows.
   */
  public static createSymbolicLinkFile(options: IFileSystemCreateLinkOptions): void {
    FileSystem._wrapException(() => {
      return FileSystem._handleLink(() => {
        return fsx.symlinkSync(options.linkTargetPath, options.newLinkPath, 'file');
      }, options);
    });
  }

  /**
   * An async version of {@link FileSystem.createSymbolicLinkFile}.
   */
  public static async createSymbolicLinkFileAsync(options: IFileSystemCreateLinkOptions): Promise<void> {
    await FileSystem._wrapExceptionAsync(() => {
      return FileSystem._handleLinkAsync(() => {
        return fsx.symlink(options.linkTargetPath, options.newLinkPath, 'file');
      }, options);
    });
  }

  /**
   * Creates a symbolic link to a folder.  On Windows operating systems, this may require administrator elevation.
   * Behind the scenes it uses `fs.symlinkSync()`.
   *
   * @remarks
   * To avoid administrator elevation on Windows, use {@link FileSystem.createSymbolicLinkJunction} instead.
   *
   * On Windows operating systems, the NTFS file system distinguishes file symlinks versus directory symlinks:
   * If the target is not the correct type, the symlink will be created successfully, but will fail to resolve.
   * Other operating systems do not make this distinction, in which case {@link FileSystem.createSymbolicLinkFile}
   * and {@link FileSystem.createSymbolicLinkFolder} can be used interchangeably, but doing so will make your
   * tool incompatible with Windows.
   */
  public static createSymbolicLinkFolder(options: IFileSystemCreateLinkOptions): void {
    FileSystem._wrapException(() => {
      return FileSystem._handleLink(() => {
        return fsx.symlinkSync(options.linkTargetPath, options.newLinkPath, 'dir');
      }, options);
    });
  }

  /**
   * An async version of {@link FileSystem.createSymbolicLinkFolder}.
   */
  public static async createSymbolicLinkFolderAsync(options: IFileSystemCreateLinkOptions): Promise<void> {
    await FileSystem._wrapExceptionAsync(() => {
      return FileSystem._handleLinkAsync(() => {
        return fsx.symlink(options.linkTargetPath, options.newLinkPath, 'dir');
      }, options);
    });
  }

  /**
   * Creates a hard link.  The link target must be a file, not a folder.
   * Behind the scenes it uses `fs.linkSync()`.
   *
   * @remarks
   * For security reasons, Windows operating systems by default require administrator elevation to create
   * symbolic links.  As a result, on Windows it's generally recommended for Node.js tools to use hard links
   * (for files) or NTFS directory junctions (for folders), since regular users are allowed to create them.
   * Hard links and junctions are less vulnerable to symlink attacks because they cannot reference a network share,
   * and their target must exist at the time of link creation.  Non-Windows operating systems generally don't
   * restrict symlink creation, and as such are more vulnerable to symlink attacks.  Note that Windows can be
   * configured to permit regular users to create symlinks, for example by enabling Windows 10 "developer mode."
   *
   * A hard link requires the link source and target to both be located on same disk volume;
   * if not, use a symbolic link instead.
   */
  public static createHardLink(options: IFileSystemCreateLinkOptions): void {
    FileSystem._wrapException(() => {
      return FileSystem._handleLink(
        () => {
          return fsx.linkSync(options.linkTargetPath, options.newLinkPath);
        },
        { ...options, linkTargetMustExist: true }
      );
    });
  }

  /**
   * An async version of {@link FileSystem.createHardLink}.
   */
  public static async createHardLinkAsync(options: IFileSystemCreateLinkOptions): Promise<void> {
    await FileSystem._wrapExceptionAsync(() => {
      return FileSystem._handleLinkAsync(
        () => {
          return fsx.link(options.linkTargetPath, options.newLinkPath);
        },
        { ...options, linkTargetMustExist: true }
      );
    });
  }

  /**
   * Follows a link to its destination and returns the absolute path to the final target of the link.
   * Behind the scenes it uses `fs.realpathSync()`.
   * @param linkPath - The path to the link.
   */
  public static getRealPath(linkPath: string): string {
    return FileSystem._wrapException(() => {
      return fsx.realpathSync(linkPath);
    });
  }

  /**
   * An async version of {@link FileSystem.getRealPath}.
   */
  public static async getRealPathAsync(linkPath: string): Promise<string> {
    return await FileSystem._wrapExceptionAsync(() => {
      return fsx.realpath(linkPath);
    });
  }

  // ===============
  // UTILITY FUNCTIONS
  // ===============

  /**
   * Returns true if the error object indicates the file or folder already exists (`EEXIST`).
   */
  public static isExistError(error: Error): boolean {
    return FileSystem.isErrnoException(error) && error.code === 'EEXIST';
  }

  /**
   * Returns true if the error object indicates the file or folder does not exist (`ENOENT` or `ENOTDIR`)
   */
  public static isNotExistError(error: Error): boolean {
    return FileSystem.isFileDoesNotExistError(error) || FileSystem.isFolderDoesNotExistError(error);
  }

  /**
   * Returns true if the error object indicates the file does not exist (`ENOENT`).
   */
  public static isFileDoesNotExistError(error: Error): boolean {
    return FileSystem.isErrnoException(error) && error.code === 'ENOENT';
  }

  /**
   * Returns true if the error object indicates the folder does not exist (`ENOTDIR`).
   */
  public static isFolderDoesNotExistError(error: Error): boolean {
    return FileSystem.isErrnoException(error) && error.code === 'ENOTDIR';
  }

  /**
   * Returns true if the error object indicates the target is a directory (`EISDIR`).
   */
  public static isDirectoryError(error: Error): boolean {
    return FileSystem.isErrnoException(error) && error.code === 'EISDIR';
  }

  /**
   * Returns true if the error object indicates the target is not a directory (`ENOTDIR`).
   */
  public static isNotDirectoryError(error: Error): boolean {
    return FileSystem.isErrnoException(error) && error.code === 'ENOTDIR';
  }

  /**
   * Returns true if the error object indicates that the `unlink` system call failed
   * due to a permissions issue (`EPERM`).
   */
  public static isUnlinkNotPermittedError(error: Error): boolean {
    return FileSystem.isErrnoException(error) && error.code === 'EPERM' && error.syscall === 'unlink';
  }

  /**
   * Detects if the provided error object is a `NodeJS.ErrnoException`
   */
  public static isErrnoException(error: Error): error is NodeJS.ErrnoException {
    const typedError: NodeJS.ErrnoException = error;
    // Don't check for `path` because the syscall may not have a path.
    // For example, when invoked with a file descriptor.
    return (
      typeof typedError.code === 'string' &&
      typeof typedError.errno === 'number' &&
      typeof typedError.syscall === 'string'
    );
  }

  private static _handleLinkExistError(
    linkFn: () => void,
    options: IInternalFileSystemCreateLinkOptions,
    error: Error
  ): void {
    switch (options.alreadyExistsBehavior) {
      case AlreadyExistsBehavior.Ignore:
        break;
      case AlreadyExistsBehavior.Overwrite:
        // fsx.linkSync does not allow overwriting so we must manually delete. If it's
        // a folder, it will throw an error.
        this.deleteFile(options.newLinkPath);
        linkFn();
        break;
      case AlreadyExistsBehavior.Error:
      default:
        throw error;
    }
  }

  private static _handleLink(linkFn: () => void, options: IInternalFileSystemCreateLinkOptions): void {
    try {
      linkFn();
    } catch (error) {
      if (FileSystem.isExistError(error as Error)) {
        // Link exists, handle it
        FileSystem._handleLinkExistError(linkFn, options, error as Error);
      } else {
        // When attempting to create a link in a directory that does not exist, an ENOENT
        // or ENOTDIR error is thrown, so we should ensure the directory exists before
        // retrying. There are also cases where the target file must exist, so validate in
        // those cases to avoid confusing the missing directory with the missing target file.
        if (
          FileSystem.isNotExistError(error as Error) &&
          (!options.linkTargetMustExist || FileSystem.exists(options.linkTargetPath))
        ) {
          this.ensureFolder(nodeJsPath.dirname(options.newLinkPath));
          try {
            linkFn();
          } catch (retryError) {
            if (FileSystem.isExistError(retryError as Error)) {
              // Another concurrent process may have created the link between the ensureFolder
              // call and the retry; handle it the same way as the initial exist error.
              FileSystem._handleLinkExistError(linkFn, options, retryError as Error);
            } else {
              throw retryError;
            }
          }
        } else {
          throw error;
        }
      }
    }
  }

  private static async _handleLinkExistErrorAsync(
    linkFn: () => Promise<void>,
    options: IInternalFileSystemCreateLinkOptions,
    error: Error
  ): Promise<void> {
    switch (options.alreadyExistsBehavior) {
      case AlreadyExistsBehavior.Ignore:
        break;
      case AlreadyExistsBehavior.Overwrite:
        // fsx.linkSync does not allow overwriting so we must manually delete. If it's
        // a folder, it will throw an error.
        await this.deleteFileAsync(options.newLinkPath);
        await linkFn();
        break;
      case AlreadyExistsBehavior.Error:
      default:
        throw error;
    }
  }

  private static async _handleLinkAsync(
    linkFn: () => Promise<void>,
    options: IInternalFileSystemCreateLinkOptions
  ): Promise<void> {
    try {
      await linkFn();
    } catch (error) {
      if (FileSystem.isExistError(error as Error)) {
        // Link exists, handle it
        await FileSystem._handleLinkExistErrorAsync(linkFn, options, error as Error);
      } else {
        // When attempting to create a link in a directory that does not exist, an ENOENT
        // or ENOTDIR error is thrown, so we should ensure the directory exists before
        // retrying. There are also cases where the target file must exist, so validate in
        // those cases to avoid confusing the missing directory with the missing target file.
        if (
          FileSystem.isNotExistError(error as Error) &&
          (!options.linkTargetMustExist || (await FileSystem.existsAsync(options.linkTargetPath)))
        ) {
          await this.ensureFolderAsync(nodeJsPath.dirname(options.newLinkPath));
          try {
            await linkFn();
          } catch (retryError) {
            if (FileSystem.isExistError(retryError as Error)) {
              // Another concurrent process may have created the link between the ensureFolderAsync
              // call and the retry; handle it the same way as the initial exist error.
              await FileSystem._handleLinkExistErrorAsync(linkFn, options, retryError as Error);
            } else {
              throw retryError;
            }
          }
        } else {
          throw error;
        }
      }
    }
  }

  private static _wrapException<TResult>(fn: () => TResult): TResult {
    try {
      return fn();
    } catch (error) {
      FileSystem._updateErrorMessage(error as Error);
      throw error;
    }
  }

  private static async _wrapExceptionAsync<TResult>(fn: () => Promise<TResult>): Promise<TResult> {
    try {
      return await fn();
    } catch (error) {
      FileSystem._updateErrorMessage(error as Error);
      throw error;
    }
  }

  private static _updateErrorMessage(error: Error): void {
    if (FileSystem.isErrnoException(error)) {
      if (FileSystem.isFileDoesNotExistError(error)) {
        error.message = `File does not exist: ${error.path}\n${error.message}`;
      } else if (FileSystem.isFolderDoesNotExistError(error)) {
        error.message = `Folder does not exist: ${error.path}\n${error.message}`;
      } else if (FileSystem.isExistError(error)) {
        // Oddly, the typing does not include the `dest` property even though the documentation
        // indicates it is there: https://nodejs.org/docs/latest-v10.x/api/errors.html#errors_error_dest
        const extendedError: NodeJS.ErrnoException & { dest?: string } = error;
        error.message = `File or folder already exists: ${extendedError.dest}\n${error.message}`;
      } else if (FileSystem.isUnlinkNotPermittedError(error)) {
        error.message = `File or folder could not be deleted: ${error.path}\n${error.message}`;
      } else if (FileSystem.isDirectoryError(error)) {
        error.message = `Target is a folder, not a file: ${error.path}\n${error.message}`;
      } else if (FileSystem.isNotDirectoryError(error)) {
        error.message = `Target is not a folder: ${error.path}\n${error.message}`;
      }
    }
  }
}
