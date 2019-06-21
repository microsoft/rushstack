// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as pathUtilities from 'path';
import * as fs from 'fs';
import * as fsx from 'fs-extra';

import { Text, NewlineKind, Encoding } from './Text';
import { PosixModeBits } from './PosixModeBits';

// The PosixModeBits are intended to be used with bitwise operations.
// tslint:disable:no-bitwise

/**
 * The options for FileSystem.readFolder()
 * @public
 */
export interface IFileSystemReadFolderOptions {
  /**
   * If true, returns the absolute paths of the files in the folder.
   * Defaults to `false`.
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
   * Defaults to `false`.
   */
  ensureFolderExists?: boolean;

  /**
   * If specified, will normalize line endings to the specified style of newline.
   * Defaults to `NewlineKind.None`.
   */
  convertLineEndings?: NewlineKind;

  /**
   * If specified, will change the encoding of the file that will be written.
   * Defaults to `"utf8"`.
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
   * Defaults to `"utf8"`.
   */
  encoding?: Encoding;

  /**
   * If specified, will normalize line endings to the specified style of newline.
   * Defaults to `NewlineKind.None`.
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
   * If true, will overwrite the file if it already exists. Defaults to true.
   */
  overwrite?: boolean;

  /**
   * If true, will ensure the folder is created before writing the file.
   * Defaults to `false`.
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
   * Defaults to `false`.
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
   * Updates the accessed and modified timestamps of the filesystem object referenced by path.
   * Behind the scenes it uses `fs.utimesSync()`.
   * The caller should specify both times in the `times` parameter.
   * @param path - The path of the file that should be modified.
   * @param times - The times that the object should be updated to reflect.
   */
  public static updateTimes(path: string, times: IFileSystemUpdateTimeParameters): void {
    // tslint:disable-next-line:no-any
    fsx.utimesSync(path, times.accessedTime as any, times.modifiedTime as any);
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
   * Retrieves the permissions (i.e. file mode bits) for a filesystem object.
   * Behind the scenes it uses `fs.chmodSync()`.
   * @param path - The absolute or relative path to the object that should be updated.
   */
  public static getPosixModeBits(path: string): PosixModeBits {
    return FileSystem.getStatistics(path).mode;
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
      overwrite: true,
      ensureFolderExists: false,
      ...options
    };

    if (options.ensureFolderExists) {
      FileSystem.ensureFolder(pathUtilities.basename(options.sourcePath));
    }

    fsx.moveSync(options.sourcePath, options.destinationPath, { overwrite: options.overwrite });
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
   * Reads the contents of the folder, not including "." or "..".
   * Behind the scenes it uses `fs.readdirSync()`.
   * @param folderPath - The absolute or relative path to the folder which should be read.
   * @param options - Optional settings that can change the behavior. Type: `IReadFolderOptions`
   */
  public static readFolder(folderPath: string, options?: IFileSystemReadFolderOptions): Array<string> {
    options = {
      absolutePaths: false,
      ...options
    };

    if (!FileSystem.exists(folderPath)) {
      throw new Error(`Folder does not exist: "${folderPath}"`);
    }

    const fileNames: Array<string> = fsx.readdirSync(folderPath);

    if (options.absolutePaths) {
      return fileNames.map(fileName => pathUtilities.resolve(folderPath, fileName));
    }

    return fileNames;
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
      ensureFolderExists: false,
      convertLineEndings: undefined,
      encoding: Encoding.Utf8,
      ...options
    };

    if (options.ensureFolderExists) {
      const folderPath: string = pathUtilities.dirname(filePath);
      FileSystem.ensureFolder(folderPath);
    }

    contents = FileSystem._convertLineEndings(contents.toString(), options.convertLineEndings);

    fsx.writeFileSync(filePath, contents, { encoding: options.encoding });
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
      ensureFolderExists: false,
      convertLineEndings: undefined,
      encoding: Encoding.Utf8,
      ...options
    };

    if (options.ensureFolderExists) {
      const folderPath: string = pathUtilities.dirname(filePath);
      FileSystem.ensureFolder(folderPath);
    }

    contents = FileSystem._convertLineEndings(contents.toString(), options.convertLineEndings);

    fsx.appendFileSync(filePath, contents, { encoding: options.encoding });
  }

  /**
   * Reads the contents of a file into a string.
   * Behind the scenes it uses `fs.readFileSync()`.
   * @param filePath - The relative or absolute path to the file whose contents should be read.
   * @param options - Optional settings that can change the behavior. Type: `IReadFileOptions`
   */
  public static readFile(filePath: string, options?: IFileSystemReadFileOptions): string {
    options = {
      encoding: Encoding.Utf8,
      convertLineEndings: undefined,
      ...options
    };

    const contents: string = FileSystem.readFileToBuffer(filePath).toString(options.encoding);
    return FileSystem._convertLineEndings(contents, options.convertLineEndings);
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
   * Copies a file from one location to another.
   * By default, destinationPath is overwritten if it already exists.
   * Behind the scenes it uses `fs.copyFileSync()`.
   */
  public static copyFile(options: IFileSystemCopyFileOptions): void {
    fsx.copySync(options.sourcePath, options.destinationPath);
  }

  /**
   * Deletes a file. Can optionally throw if the file doesn't exist.
   * Behind the scenes it uses `fs.unlinkSync()`.
   * @param filePath - The absolute or relative path to the file that should be deleted.
   * @param options - Optional settings that can change the behavior. Type: `IDeleteFileOptions`
   */
  public static deleteFile(filePath: string, options?: IFileSystemDeleteFileOptions): void {
    options = {
      throwIfNotExists: false,
      ...options
    };

    if (options.throwIfNotExists) {
      fsx.unlinkSync(filePath);
    } else {
      try {
        fsx.unlinkSync(filePath);
      } catch (error) {
        /* no-op */
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
   * Creates a Windows "directory junction". Behaves like `createSymbolicLinkToFile()` on other platforms.
   * Behind the scenes it uses `fs.symlinkSync()`.
   */
  public static createSymbolicLinkJunction(options: IFileSystemCreateLinkOptions): void {
    // For directories, we use a Windows "junction".  On POSIX operating systems, this produces a regular symlink.
    fsx.symlinkSync(options.linkTargetPath, options.newLinkPath, 'junction');
  }

  /**
   * Creates a symbolic link to a file (on Windows this requires elevated permissionsBits).
   * Behind the scenes it uses `fs.symlinkSync()`.
   */
  public static createSymbolicLinkFile(options: IFileSystemCreateLinkOptions): void {
    fsx.symlinkSync(options.linkTargetPath, options.newLinkPath, 'file');
  }

  /**
   * Creates a symbolic link to a folder (on Windows this requires elevated permissionsBits).
   * Behind the scenes it uses `fs.symlinkSync()`.
   */
  public static createSymbolicLinkFolder(options: IFileSystemCreateLinkOptions): void {
    fsx.symlinkSync(options.linkTargetPath, options.newLinkPath, 'dir');
  }

  /**
   * Creates a hard link.
   * Behind the scenes it uses `fs.linkSync()`.
   */
  public static createHardLink(options: IFileSystemCreateLinkOptions): void {
    fsx.linkSync(options.linkTargetPath, options.newLinkPath);
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
   * A helper function that converts line endings on a string.
   * @param text - The text to be normalized.
   * @param lineEndings - The style of line endings to use.
   */
  private static _convertLineEndings(text: string, lineEndings: NewlineKind | undefined): string {
    switch (lineEndings) {
      case NewlineKind.CrLf:
        return Text.convertToCrLf(text);
      case NewlineKind.Lf:
        return Text.convertToLf(text);
      default:
        return text;
    }
  }
}
