import * as pathUtilities from 'path';
import * as fs from 'fs';
import * as fsx from 'fs-extra';

import { Text } from './Text';

/**
 * The allowed types of encodings, as supported by Node.js
 * @public
 */
export const enum Encoding {
  Utf8 = 'utf8'
}

/**
 * Enumeration controlling conversion of newline characters.
 * @public
 */
export const enum NewlineKind {
  /**
   * Windows-style newlines
   */
  CrLf = '\r\n',

  /**
   * Unix-style newlines
   */
  Lf = '\n'
}

/**
 * Available PermissionsBits bits. These can be added together using the pipe operator, e.g.:
 *
 * PermissionsBits.Read === 1                                           (or "001" in decimal)
 * PermissionsBits.Read | PermissionsBits.Write === 3                       (or "011" in decimal)
 * PermissionsBits.Read | PermissionsBits.Write | PermissionsBits.Execute === 7 (or "111" in decimal)
 * @public
 */
export const enum PermissionsBits {
  None = 0,
  Execute = 1,
  Write = 2,
  Read = 4
}

/**
 * Interface representing Unix-style file permission mode bits.
 * All values should be set.
 * @public
 */
export interface IFileModeBits {
  Owner: PermissionsBits;
  Group: PermissionsBits;
  Other: PermissionsBits;
}

/**
 * The options for FileSystem.readFolder()
 * @public
 */
export interface IReadFolderOptions {
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
export interface IWriteFileOptions {
  /**
   * If true, will ensure the folder is created before writing the file.
   * Defaults to `false`.
   */
  ensureFolder?: boolean;

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
export interface IReadFileOptions {
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
   * If true, will overwrite the file if it already exists. Defaults to false.
   */
  overwrite?: boolean;

  /**
   * If true, will ensure the folder is created before writing the file.
   * Defaults to `false`.
   */
  ensureFolder?: boolean;
}

/**
 * The options for FileSystem.deleteFile()
 * @public
*/
export interface IDeleteFileOptions {
  /**
   * If true, will throw an exception if the file did not exist before `deleteFile()` was called.
   * Defaults to `false`.
   */
  throwIfNotExists?: boolean;
}

/**
 * The parameters for `updateTimes()`.
 * Both times must be specified.
 */
export interface IUpdateTimeParameters {
  /**
   * The UNIX epoch time or Date when this was last accessed.
   */
  accessedTime: number | Date;

  /**
   * The UNIX epoch time or Date when this was last modified
   */
  modifiedTime: number | Date;
}

/**
 * The FileSystem API provides a complete set of recommended operations for interacting with the file system.
 * @remarks
 * We recommend to use this instead of the native `fs` API, because `fs` is a minimal set of low-level
 * primitives that must be mapped for each supported operating system. The FileSystem API takes a
 * philosophical approach of providing "one obvious way" to do each operation. We also prefer synchronous
 * operations except in cases where there would be a clear performance benefit for using async, since synchronous
 * code is much easier to read and debug. Also, indiscriminate parallelism has been seen to actually worsen
 * performance, versus improving it.
 *
 * Note that in the documentation, we refer to "filesystem objects", this can be a
 * file, folder, synbolic link, hard link, directory junction, etc.
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
  public static updateTimes(path: string, times: IUpdateTimeParameters): void {
    // tslint:disable-next-line:no-any
    fsx.utimes(path, times.accessedTime as any, times.modifiedTime as any);
  }

  /**
   * Changes the permissions (i.e. file mode bits) for a filesystem object.
   * Behind the scenes it uses `fs.chmodSync()`.
   * @param path - The absolute or relative path to the object that should be updated.
   * @param mode - UNIX-style file mode bits (e.g. 777 or 666 etc)
   */
  public static changePermissionBits(path: string, mode: IFileModeBits): void {
    const modeAsOctal: number = (mode.Owner << 6) + (mode.Group << 3) + (mode.Other);
    fsx.chmodSync(path, modeAsOctal);
  }

  /**
   * Moves a file. The folder must exist, unless the `ensureFolder` option is provided.
   * Behind the scenes it uses `fsx.moveSync()`
   * @param sourcePath - The absolute or relative path to the source file.
   * @param targetPath - The absolute or relative path where the file should be moved to.
   * @param options - Optional settings that can change the behavior. Type: `IFileSystemMoveOptions`
   */
  public static move(sourcePath: string, targetPath: string, options?: IFileSystemMoveOptions): void {
    options = {
      overwrite: false,
      ensureFolder: false,
      ...options
    };

    if (options.ensureFolder) {
      FileSystem.ensureFolder(pathUtilities.basename(sourcePath));
    }
    fsx.moveSync(sourcePath, targetPath, { overwrite: options.overwrite });
  }

  // ===============
  // FOLDER OPERATIONS
  // ===============

  /**
   * Recursively creates a folder at a given path.
   * Behind the scenes is uses `fsx.ensureDirSync()`.
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
  public static readFolder(folderPath: string, options?: IReadFolderOptions): Array<string> {
    options = {
      absolutePaths: false,
      ...options
    };

    if (!FileSystem.exists(folderPath)) {
      throw new Error(`Cannot read contents of folder, as it does not exist: "${folderPath}"`);
    }

    const fileNames: Array<string> = fsx.readdirSync(folderPath);

    if (options.absolutePaths) {
      return fileNames.map(fileName => pathUtilities.resolve(folderPath, fileName));
    }

    return fileNames;
  }

  /**
   * Deletes a folder, including all of its contents.
   * Behind the scenes is uses `fsx.removeSync()`
   * @param folderPath - The absolute or relative path to the folder which should be deleted.
   */
  public static deleteFolder(folderPath: string): void {
    fsx.removeSync(folderPath);
  }

  /**
   * Deletes the content of a folder, but not the folder itself.
   * Behind the scenes it uses `fsx.emptyDirSync()`
   * @param folderPath - The absolute or relative path to the folder which should have its contents deleted.
   */
  public static emptyFolder(folderPath: string): void {
    fsx.emptyDirSync(folderPath);
  }

  // ===============
  // FILE OPERATIONS
  // ===============

  /**
   * Writes a text string to a file on disk, overwriting the file if it already exists.
   * Behind the scenes it uses `fs.writeFileSync()`
   * @param filePath - The absolute or relative path of the file.
   * @param contents - The text that should be written to the file.
   * @param options - Optional settings that can change the behavior. Type: `IWriteFileOptions`
   */
  public static writeFile(filePath: string, contents: string, options?: IWriteFileOptions): void {
    options = {
      ensureFolder: false,
      convertLineEndings: undefined,
      encoding: Encoding.Utf8,
      ...options
    };

    if (options.ensureFolder) {
      const folderPath: string = pathUtilities.dirname(filePath);
      FileSystem.ensureFolder(folderPath);
    }

    contents = FileSystem._convertLineEndings(contents, options.convertLineEndings);

    fsx.writeFileSync(filePath, contents, { encoding: options.encoding });
  }

  /**
   * Reads the contents of a file into a string.
   * Behind the scenes it uses `fs.readFileSync()`.
   * @param filePath - The relative or absolute path to the file whose contents should be read.
   * @param options - Optional settings that can change the behavior. Type: `IReadFileOptions`
   */
  public static readFile(filePath: string, options?: IReadFileOptions): string {
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
   * @param sourcePath - The absolute or relative path to the source file to be copied.
   * @param destinationPath - The absolute or relative path to the new copy that will be created.
   */
  public static copyFile(sourcePath: string, destinationPath: string): void {
    fsx.copySync(sourcePath, destinationPath);
  }

  /**
   * Deletes a file. Can optionally throw if the file doesn't exist.
   * Behind the scenes it uses `fs.unlinkSync()`.
   * @param filePath - The absolute or relative path to the file that should be deleted.
   * @param options - Optional settings that can change the behavior. Type: `IDeleteFileOptions`
   */
  public static deleteFile(filePath: string, options?: IDeleteFileOptions): void {
    options = {
      throwIfNotExists: false,
      ...options
    };

    if (options.throwIfNotExists || FileSystem.exists(filePath)) {
      fsx.unlinkSync(filePath);
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
   * Creates a symbolic link to a folder (on Windows this is a "directory junction").
   * Behind the scenes it uses `fs.symlinkSync()`.
   * @param linkSource - The absolute or relative path to the destination where the link should be created.
   * @param linkTarget - The absolute or relative path to the target of the link.
   */
  public static createSymbolicLinkToFolder(linkSource: string, linkTarget: string): void {
    // For directories, we use a Windows "junction".  On Unix, this produces a regular symlink.
    fsx.symlinkSync(linkTarget, linkSource, 'junction');
  }

  /**
   * Creates a symbolic link to a file (on Windows this requires elevated permissionsBits).
   * Behind the scenes it uses `fs.symlinkSync()`.
   * @param linkSource - The absolute or relative path to the destination where the link should be created.
   * @param linkTarget - The absolute or relative path to the target of the link.
   */
  public static createSymbolicLinkToFile(linkSource: string, linkTarget: string): void {
    fsx.symlinkSync(linkSource, linkTarget, 'file');
  }

  /**
   * Creates a hard link to a file.
   * Behind the scenes it uses `fs.linkSync()`.
   * @param linkSource - The absolute or relative path to the destination where the link should be created.
   * @param linkTarget - The absolute or relative path to the target of the link.
   */
  public static createHardLinkToFile(linkSource: string, linkTarget: string): void {
    fsx.linkSync(linkSource, linkTarget);
  }

  /**
   * Follows a link to its destination and returns the absolute path to the final target of the link.
   * Behind the scenes it uses `fs.realpathSync()`.
   * @param linkPath - The path to the link.
   */
  public static followLink(linkPath: string): string {
    return fsx.realpathSync(linkPath);
  }

  /**
   * A helper function that converts line endings on a string.
   * @param text - The text to be normalized.
   * @param lineEndings - The style of line endings to use.
   */
  private static _convertLineEndings(text: string, lineEndings: NewlineKind | undefined): string {
    if (lineEndings === NewlineKind.CrLf) {
      return Text.convertToCrLf(text);
    } else if (lineEndings === NewlineKind.Lf) {
      return Text.convertToLf(text);
    }
    return text;
  }
}