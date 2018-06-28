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
export enum NewlineConversion {
  CrLf,
  Lf,
  None
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
  absolutePath?: boolean;
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
   * Defaults to `NewlineConversion.None`.
   */
  convertLineEndings?: NewlineConversion;

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
   * Defaults to `NewlineConversion.None`.
   */
  convertLineEndings?: NewlineConversion;
}

/**
 * The options for FileSystem.move()
 * @public
 */
export interface IMoveOptions {
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
 * A standardized file system API. Mostly contains wrappers around `fs` and `fs-extra`.
 * Also contains useful options to simplify and normalize file system operations.
 * @public
 */
export class FileSystem {

  // ===============
  // COMMON OPERATIONS
  // ===============

  /**
   * Returns true if the path exists on disk. It can be a file, folder, or link.
   * Behind the scenes it uses `fs.existsSync()`.
   * @param path - The absolute or relative path to the file, folder, or link.
   */
  public static exists(path: string): boolean {
    return fsx.existsSync(path);
  }

  /**
   * Gets the statistics for a particular file or folder.
   * If the path is a link, this function follows the link and returns statistics about the link target.
   * Behind the scenes it uses `fs.statSync()`.
   * @param path - The absolute or relative path to the file, folder, or link.
   */
  public static getStatistics(path: string): fs.Stats {
    return fsx.statSync(path);
  }

  /**
   * Updates the accessed and modified timestamps of the file, folder, or link referenced by path.
   * Behind the scenes it uses `fs.utimesSync()`.
   * @param path - The path of the file that should be modified.
   * @param accessedTime - The UNIX epoch time when this was last accessed.
   * @param modifiedTime - The UNIX epoch time when this was last modified.
   */
  public static updateTimes(path: string, accessedTime: number, modifiedTime: number): void {
    fsx.utimes(path, accessedTime, modifiedTime);
  }

  /**
   * Changes the permissions mode of a file, folder, or link.
   * Behind the scenes it uses `fs.chmodSync()`.
   * @param path - The absolute or relative path to the object that should be updated.
   * @param mode - should be a UNIX-style permissions modifier number (e.g. 777 or 666 etc)
   */
  public static changeMode(path: string, mode: number): void {
    fsx.chmodSync(path, mode);
  }

  /**
   * Moves a file. The folder must exist, unless the `ensureFolder` option is provided.
   * Behind the scenes it uses `fsx.moveSync()`
   * @param sourcePath - The absolute or relative path to the source file.
   * @param destinationPath - The absolute or relative path where the file should be moved to.
   * @param options - Optional settings that can change the behavior. Type: `IMoveOptions`
   */
  public static move(sourcePath: string, destinationPath: string, options?: IMoveOptions): void {
    options = {
      overwrite: false,
      ensureFolder: false,
      ...options
    };

    if (options.ensureFolder) {
      FileSystem.createFolder(pathUtilities.basename(sourcePath));
    }
    fsx.moveSync(sourcePath, destinationPath, { overwrite: options.overwrite });
  }

  // ===============
  // FOLDER OPERATIONS
  // ===============

  /**
   * Recursively creates a folder at a given path.
   * Behind the scenes is uses `fsx.ensureDirSync()`.
   * @param folderPath - The absolute or relative path of the folder which should be created.
   */
  public static createFolder(folderPath: string): void {
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
      absolutePath: false,
      ...options
    };

    if (!FileSystem.exists(folderPath)) {
      throw new Error(`Cannot read contents of folder, as it does not exist: "${folderPath}"`);
    }

    const fileNames: Array<string> = fsx.readdirSync(folderPath);

    if (options.absolutePath) {
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
      convertLineEndings: NewlineConversion.None,
      encoding: Encoding.Utf8,
      ...options
    };

    if (options.ensureFolder) {
      const folderPath: string = pathUtilities.dirname(filePath);
      FileSystem.createFolder(folderPath);
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
      convertLineEndings: NewlineConversion.None,
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
   * Gets the statistics of a file, folder, or link. Does NOT follow the link to its target.
   * Behind the scenes it uses `fs.lstatSync()`.
   * @param path - The absolute or relative path to the file, folder, or link.
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
   * Creates a symbolic link to a file (on Windows this requires elevated permissions).
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
  private static _convertLineEndings(text: string, lineEndings: NewlineConversion | undefined): string {
    if (lineEndings === NewlineConversion.CrLf) {
      return Text.convertToCrLf(text);
    } else if (lineEndings === NewlineConversion.Lf) {
      return Text.convertToLf(text);
    }
    return text;
  }
}