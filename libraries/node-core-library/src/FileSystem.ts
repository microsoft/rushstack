// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as pathUtilities from 'path';
import * as fs from 'fs';
import * as fsx from 'fs-extra';

import { Text, NewlineKind, Encoding } from './Text';
import { PosixModeBits } from './PosixModeBits';
import { LegacyAdapters } from './LegacyAdapters';

// The PosixModeBits are intended to be used with bitwise operations.
/* eslint-disable no-bitwise */

/**
 * The options for FileSystem.readFolder()
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
 * The options for FileSystem.writeFile()
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
 * The options for FileSystem.readFile()
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
 * The options for FileSystem.move()
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
 * The options for FileSystem.copyFile()
 * @public
 */
export interface IFileSystemCopyFileOptions {
  /**
   * The path of the existing object to be copied.
   * The path may be absolute or relative.
   */
  sourcePath: string;

  /**
   * The path that the object will be copied to.
   * The path may be absolute or relative.
   */
  destinationPath: string;
}

/**
 * The options for FileSystem.deleteFile()
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
 * The parameters for `updateTimes()`.
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
 * The options for `FileSystem.createSymbolicLinkJunction()`, `createSymbolicLinkFile()`,
 * `createSymbolicLinkFolder()`,  and `createHardLink()`.
 *
 * @public
 */
export interface IFileSystemCreateLinkOptions {
  /**
   * The existing path that the symbolic link will point to.
   */
  linkTargetPath: string;

  /**
   * The new path for the new symlink link to be created.
   */
  newLinkPath: string;
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
    return fsx.existsSync(path);
  }

  /**
   * Gets the statistics for a particular filesystem object.
   * If the path is a link, this function follows the link and returns statistics about the link target.
   * Behind the scenes it uses `fs.statSync()`.
   * @param path - The absolute or relative path to the filesystem object.
   */
  public static getStatistics(path: string): fs.Stats {
    return fsx.statSync(path);
  }

  /**
   * An async version of {@link FileSystem.getStatistics}.
   */
  public static getStatisticsAsync(path: string): Promise<fs.Stats> {
    return LegacyAdapters.convertCallbackToPromise(fsx.stat, path);
  }

  /**
   * Updates the accessed and modified timestamps of the filesystem object referenced by path.
   * Behind the scenes it uses `fs.utimesSync()`.
   * The caller should specify both times in the `times` parameter.
   * @param path - The path of the file that should be modified.
   * @param times - The times that the object should be updated to reflect.
   */
  public static updateTimes(path: string, times: IFileSystemUpdateTimeParameters): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fsx.utimesSync(path, times.accessedTime as any, times.modifiedTime as any);
  }

  /**
   * An async version of {@link FileSystem.updateTimes}.
   */
  public static updateTimesAsync(path: string, times: IFileSystemUpdateTimeParameters): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return LegacyAdapters.convertCallbackToPromise(fsx.utimes, path, times.accessedTime as any, times.modifiedTime as any);
  }


  /**
   * Changes the permissions (i.e. file mode bits) for a filesystem object.
   * Behind the scenes it uses `fs.chmodSync()`.
   * @param path - The absolute or relative path to the object that should be updated.
   * @param modeBits - POSIX-style file mode bits specified using the {@link PosixModeBits} enum
   */
  public static changePosixModeBits(path: string, mode: PosixModeBits): void {
    fs.chmodSync(path, mode);
  }

  /**
   * An async version of {@link FileSystem.changePosixModeBits}.
   */
  public static changePosixModeBitsAsync(path: string, mode: PosixModeBits): Promise<void> {
    return LegacyAdapters.convertCallbackToPromise(fsx.chmod, path, mode);
  }

  /**
   * Retrieves the permissions (i.e. file mode bits) for a filesystem object.
   * Behind the scenes it uses `fs.chmodSync()`.
   * @param path - The absolute or relative path to the object that should be updated.
   */
  public static getPosixModeBits(path: string): PosixModeBits {
    return FileSystem.getStatistics(path).mode;
  }

  /**
   * An async version of {@link FileSystem.getPosixModeBits}.
   */
  public static async getPosixModeBitsAsync(path: string): Promise<PosixModeBits> {
    return (await FileSystem.getStatisticsAsync(path)).mode;
  }

  /**
   * Returns a 10-character string representation of a PosixModeBits value similar to what
   * would be displayed by a command such as "ls -l" on a POSIX-like operating system.
   * @remarks
   * For example, `PosixModeBits.AllRead | PosixModeBits.AllWrite` would be formatted as "-rw-rw-rw-".
   * @param modeBits - POSIX-style file mode bits specified using the {@link PosixModeBits} enum
   */
  public static formatPosixModeBits(modeBits: PosixModeBits): string {
    let result: string = '-';  // (later we may add support for additional states such as S_IFDIR or S_ISUID)

    result += (modeBits & PosixModeBits.UserRead) ? 'r' : '-';
    result += (modeBits & PosixModeBits.UserWrite) ? 'w' : '-';
    result += (modeBits & PosixModeBits.UserExecute) ? 'x' : '-';

    result += (modeBits & PosixModeBits.GroupRead) ? 'r' : '-';
    result += (modeBits & PosixModeBits.GroupWrite) ? 'w' : '-';
    result += (modeBits & PosixModeBits.GroupExecute) ? 'x' : '-';

    result += (modeBits & PosixModeBits.OthersRead) ? 'r' : '-';
    result += (modeBits & PosixModeBits.OthersWrite) ? 'w' : '-';
    result += (modeBits & PosixModeBits.OthersExecute) ? 'x' : '-';

    return result;
  }

  /**
   * Moves a file. The folder must exist, unless the `ensureFolderExists` option is provided.
   * Behind the scenes it uses `fs-extra.moveSync()`
   */
  public static move(options: IFileSystemMoveOptions): void {
    options = {
      ...MOVE_DEFAULT_OPTIONS,
      ...options
    };

    if (options.ensureFolderExists) {
      FileSystem.ensureFolder(pathUtilities.basename(options.sourcePath));
    }

    fsx.moveSync(options.sourcePath, options.destinationPath, { overwrite: options.overwrite });
  }

  /**
   * An async version of {@link FileSystem.move}.
   */
  public static async moveAsync(options: IFileSystemMoveOptions): Promise<void> {
    options = {
      ...MOVE_DEFAULT_OPTIONS,
      ...options
    };

    if (options.ensureFolderExists) {
      await FileSystem.ensureFolderAsync(pathUtilities.basename(options.sourcePath));
    }

    await LegacyAdapters.convertCallbackToPromise(
      fsx.move,
      options.sourcePath,
      options.destinationPath,
      { overwrite: options.overwrite }
    );
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
    fsx.ensureDirSync(folderPath);
  }

  /**
   * An async version of {@link FileSystem.ensureFolder}.
   */
  public static ensureFolderAsync(folderPath: string): Promise<void> {
    return LegacyAdapters.convertCallbackToPromise(fsx.ensureDir, folderPath);
  }

  /**
   * Reads the contents of the folder, not including "." or "..".
   * Behind the scenes it uses `fs.readdirSync()`.
   * @param folderPath - The absolute or relative path to the folder which should be read.
   * @param options - Optional settings that can change the behavior. Type: `IReadFolderOptions`
   */
  public static readFolder(folderPath: string, options?: IFileSystemReadFolderOptions): string[] {
    options = {
      ...READ_FOLDER_DEFAULT_OPTIONS,
      ...options
    };

    let fileNames: string[]
    try {
      fileNames = fsx.readdirSync(folderPath);
    } catch (e) {
      if (FileSystem._isNotExistError(e)) {
        throw new Error(`Folder does not exist: "${folderPath}"`);
      } else {
        throw e;
      }
    }

    if (options.absolutePaths) {
      return FileSystem._resolvePaths(fileNames, folderPath);
    } else {
      return fileNames;
    }
  }

  /**
   * An async version of {@link FileSystem.readFolder}.
   */
  public static async readFolderAsync(folderPath: string, options?: IFileSystemReadFolderOptions): Promise<string[]> {
    options = {
      ...READ_FOLDER_DEFAULT_OPTIONS,
      ...options
    };

    let fileNames: string[];
    try {
      fileNames = await LegacyAdapters.convertCallbackToPromise(fsx.readdir, folderPath);
    } catch (e) {
      if (FileSystem._isNotExistError(e)) {
        throw new Error(`Folder does not exist: "${folderPath}"`);
      } else {
        throw e;
      }
    }

    if (options.absolutePaths) {
      return FileSystem._resolvePaths(fileNames, folderPath);
    } else {
      return fileNames;
    }
  }

  /**
   * Deletes a folder, including all of its contents.
   * Behind the scenes is uses `fs-extra.removeSync()`.
   * @remarks
   * Does not throw if the folderPath does not exist.
   * @param folderPath - The absolute or relative path to the folder which should be deleted.
   */
  public static deleteFolder(folderPath: string): void {
    fsx.removeSync(folderPath);
  }

  /**
   * An async version of {@link FileSystem.deleteFolder}.
   */
  public static deleteFolderAsync(folderPath: string): Promise<void> {
    return LegacyAdapters.convertCallbackToPromise(fsx.remove, folderPath);
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
    fsx.emptyDirSync(folderPath);
  }

  /**
   * An async version of {@link FileSystem.ensureEmptyFolder}.
   */
  public static ensureEmptyFolderAsync(folderPath: string): Promise<void> {
    return LegacyAdapters.convertCallbackToPromise(fsx.emptyDir, folderPath);
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
  public static writeFile(filePath: string, contents: string | Buffer, options?: IFileSystemWriteFileOptions): void {
    options = {
      ...WRITE_FILE_DEFAULT_OPTIONS,
      ...options
    };

    if (options.ensureFolderExists) {
      const folderPath: string = pathUtilities.dirname(filePath);
      FileSystem.ensureFolder(folderPath);
    }

    if (options.convertLineEndings) {
      contents = Text.convertTo(contents.toString(), options.convertLineEndings);
    }

    fsx.writeFileSync(filePath, contents, { encoding: options.encoding });
  }

  /**
   * An async version of {@link FileSystem.writeFile}.
   */
  public static async writeFileAsync(filePath: string, contents: string | Buffer, options?: IFileSystemWriteFileOptions): Promise<void> {
    options = {
      ...WRITE_FILE_DEFAULT_OPTIONS,
      ...options
    };

    if (options.ensureFolderExists) {
      const folderPath: string = pathUtilities.dirname(filePath);
      await FileSystem.ensureFolderAsync(folderPath);
    }

    if (options.convertLineEndings) {
      contents = Text.convertTo(contents.toString(), options.convertLineEndings);
    }

    await LegacyAdapters.convertCallbackToPromise(fsx.writeFile, filePath, contents, { encoding: options.encoding });
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
  public static appendToFile(filePath: string, contents: string | Buffer, options?: IFileSystemWriteFileOptions): void {
    options = {
      ...APPEND_TO_FILE_DEFAULT_OPTIONS,
      ...options
    };

    if (options.ensureFolderExists) {
      const folderPath: string = pathUtilities.dirname(filePath);
      FileSystem.ensureFolder(folderPath);
    }

    if (options.convertLineEndings) {
      contents = Text.convertTo(contents.toString(), options.convertLineEndings);
    }

    fsx.appendFileSync(filePath, contents, { encoding: options.encoding });
  }

  /**
   * An async version of {@link FileSystem.appendToFile}.
   */
  public static async appendToFileAsync(filePath: string, contents: string | Buffer, options?: IFileSystemWriteFileOptions): Promise<void> {
    options = {
      ...APPEND_TO_FILE_DEFAULT_OPTIONS,
      ...options
    };

    if (options.ensureFolderExists) {
      const folderPath: string = pathUtilities.dirname(filePath);
      await FileSystem.ensureFolderAsync(folderPath);
    }

    if (options.convertLineEndings) {
      contents = Text.convertTo(contents.toString(), options.convertLineEndings);
    }

    await LegacyAdapters.convertCallbackToPromise(fsx.appendFile, filePath, contents, { encoding: options.encoding });
  }

  /**
   * Reads the contents of a file into a string.
   * Behind the scenes it uses `fs.readFileSync()`.
   * @param filePath - The relative or absolute path to the file whose contents should be read.
   * @param options - Optional settings that can change the behavior. Type: `IReadFileOptions`
   */
  public static readFile(filePath: string, options?: IFileSystemReadFileOptions): string {
    options = {
      ...READ_FILE_DEFAULT_OPTIONS,
      ...options
    };

    let contents: string = FileSystem.readFileToBuffer(filePath).toString(options.encoding);
    if (options.convertLineEndings) {
      contents = Text.convertTo(contents, options.convertLineEndings);
    }

    return contents;
  }

  /**
   * An async version of {@link FileSystem.readFile}.
   */
  public static async readFileAsync(filePath: string, options?: IFileSystemReadFileOptions): Promise<string> {
    options = {
      ...READ_FILE_DEFAULT_OPTIONS,
      ...options
    };

    let contents: string = (await FileSystem.readFileToBufferAsync(filePath)).toString(options.encoding);
    if (options.convertLineEndings) {
      contents = Text.convertTo(contents, options.convertLineEndings);
    }

    return contents;
  }

  /**
   * Reads the contents of a file into a buffer.
   * Behind the scenes is uses `fs.readFileSync()`.
   * @param filePath - The relative or absolute path to the file whose contents should be read.
   */
  public static readFileToBuffer(filePath: string): Buffer {
    return fsx.readFileSync(filePath);
  }

  /**
   * An async version of {@link FileSystem.readFileToBuffer}.
   */
  public static readFileToBufferAsync(filePath: string): Promise<Buffer> {
    return LegacyAdapters.convertCallbackToPromise(fsx.readFile, filePath);
  }

  /**
   * Copies a file from one location to another.
   * By default, destinationPath is overwritten if it already exists.
   * Behind the scenes it uses `fs.copyFileSync()`.
   */
  public static copyFile(options: IFileSystemCopyFileOptions): void {
    fsx.copySync(options.sourcePath, options.destinationPath);
  }

  /**
   * An async version of {@link FileSystem.copyFile}.
   */
  public static async copyFileAsync(options: IFileSystemCopyFileOptions): Promise<void> {
    await fsx.copy(options.sourcePath, options.destinationPath);
  }

  /**
   * Deletes a file. Can optionally throw if the file doesn't exist.
   * Behind the scenes it uses `fs.unlinkSync()`.
   * @param filePath - The absolute or relative path to the file that should be deleted.
   * @param options - Optional settings that can change the behavior. Type: `IDeleteFileOptions`
   */
  public static deleteFile(filePath: string, options?: IFileSystemDeleteFileOptions): void {
    options = {
      ...DELETE_FILE_DEFAULT_OPTIONS,
      ...options
    };

    try {
      fsx.unlinkSync(filePath);
    } catch (error) {
      if (options.throwIfNotExists) {
        throw error;
      }
    }
  }

  /**
   * An async version of {@link FileSystem.deleteFile}.
   */
  public static async deleteFileAsync(filePath: string, options?: IFileSystemDeleteFileOptions): Promise<void> {
    options = {
      ...DELETE_FILE_DEFAULT_OPTIONS,
      ...options
    };

    try {
      await LegacyAdapters.convertCallbackToPromise(fsx.unlink, filePath);
    } catch (error) {
      if (options.throwIfNotExists) {
        throw error;
      }
    }
  }

  // ===============
  // LINK OPERATIONS
  // ===============

  /**
   * Gets the statistics of a filesystem object. Does NOT follow the link to its target.
   * Behind the scenes it uses `fs.lstatSync()`.
   * @param path - The absolute or relative path to the filesystem object.
   */
  public static getLinkStatistics(path: string): fs.Stats {
    return fsx.lstatSync(path);
  }

  /**
   * An async version of {@link FileSystem.getLinkStatistics}.
   */
  public static getLinkStatisticsAsync(path: string): Promise<fs.Stats> {
    return LegacyAdapters.convertCallbackToPromise(fsx.lstat, path);
  }

  /**
   * Creates a Windows "directory junction". Behaves like `createSymbolicLinkToFile()` on other platforms.
   * Behind the scenes it uses `fs.symlinkSync()`.
   */
  public static createSymbolicLinkJunction(options: IFileSystemCreateLinkOptions): void {
    // For directories, we use a Windows "junction".  On POSIX operating systems, this produces a regular symlink.
    fsx.symlinkSync(options.linkTargetPath, options.newLinkPath, 'junction');
  }

  /**
   * An async version of {@link FileSystem.createSymbolicLinkJunction}.
   */
  public static createSymbolicLinkJunctionAsync(options: IFileSystemCreateLinkOptions): Promise<void> {
    // For directories, we use a Windows "junction".  On POSIX operating systems, this produces a regular symlink.
    return LegacyAdapters.convertCallbackToPromise(fsx.symlink, options.linkTargetPath, options.newLinkPath, 'junction');
  }

  /**
   * Creates a symbolic link to a file (on Windows this requires elevated permissionsBits).
   * Behind the scenes it uses `fs.symlinkSync()`.
   */
  public static createSymbolicLinkFile(options: IFileSystemCreateLinkOptions): void {
    fsx.symlinkSync(options.linkTargetPath, options.newLinkPath, 'file');
  }

  /**
   * An async version of {@link FileSystem.createSymbolicLinkFile}.
   */
  public static createSymbolicLinkFileAsync(options: IFileSystemCreateLinkOptions): Promise<void> {
    return LegacyAdapters.convertCallbackToPromise(fsx.symlink, options.linkTargetPath, options.newLinkPath, 'file');
  }

  /**
   * Creates a symbolic link to a folder (on Windows this requires elevated permissionsBits).
   * Behind the scenes it uses `fs.symlinkSync()`.
   */
  public static createSymbolicLinkFolder(options: IFileSystemCreateLinkOptions): void {
    fsx.symlinkSync(options.linkTargetPath, options.newLinkPath, 'dir');
  }

  /**
   * An async version of {@link FileSystem.createSymbolicLinkFolder}.
   */
  public static createSymbolicLinkFolderAsync(options: IFileSystemCreateLinkOptions): Promise<void> {
    return LegacyAdapters.convertCallbackToPromise(fsx.symlink, options.linkTargetPath, options.newLinkPath, 'dir');
  }

  /**
   * Creates a hard link.
   * Behind the scenes it uses `fs.linkSync()`.
   */
  public static createHardLink(options: IFileSystemCreateLinkOptions): void {
    fsx.linkSync(options.linkTargetPath, options.newLinkPath);
  }

  /**
   * An async version of {@link FileSystem.createHardLink}.
   */
  public static createHardLinkAsync(options: IFileSystemCreateLinkOptions): Promise<void> {
    return LegacyAdapters.convertCallbackToPromise(fsx.link, options.linkTargetPath, options.newLinkPath);
  }

  /**
   * Follows a link to its destination and returns the absolute path to the final target of the link.
   * Behind the scenes it uses `fs.realpathSync()`.
   * @param linkPath - The path to the link.
   */
  public static getRealPath(linkPath: string): string {
    return fsx.realpathSync(linkPath);
  }

  /**
   * An async version of {@link FileSystem.getRealPath}.
   */
  public static getRealPathAsync(linkPath: string): Promise<string> {
    return LegacyAdapters.convertCallbackToPromise(fsx.realpath, linkPath);
  }

  // ===============
  // UTILITY FUNCTIONS
  // ===============

  /**
   * Returns true if the error provided indicates the file or folder
   * does not exist.
   *
   * @internal
   */
  public static _isNotExistError(error: NodeJS.ErrnoException): boolean {
    return error.code === 'ENOENT';
  }

  /**
   * Resolves the provided paths relative to the provided parent path
   * @param paths - The paths to resolve.
   * @param relativeTo - The path relative to which the paths should be resolved.
   */
  private static _resolvePaths(paths: string[], relativeTo: string): string[] {
    return paths.map(fileName => pathUtilities.resolve(relativeTo, fileName));
  }
}
