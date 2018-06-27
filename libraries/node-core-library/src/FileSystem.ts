import * as pathUtilities from 'path';
import * as fs from 'fs';
import * as fsx from 'fs-extra';

import { Text } from './';

export type Encoding = 'utf8';

/**
 * The options for FileSystem.readFolder()
 * @public
 */
export interface IReadFolderOptions {
  /** If true, returns the absolute paths of the files in the folder. Defaults to false. */
  absolutePath?: boolean;
}

/**
 * The options for FileSystem.writeFile()
 * @public
 */
export interface IWriteFileOptions {
  ensureFolder?: boolean;
  convertLineEndings?: NewlineConversion;
  encoding?: Encoding;
}

/**
 * Enumeration controlling conversion of newlines
 * @public
 */
export enum NewlineConversion {
  CrLf,
  Lf,
  None
}

/**
 * The options for FileSystem.readFile()
 * @public
 */
export interface IReadFileOptions {
  encoding?: Encoding;
  convertLineEndings?: NewlineConversion;
}

/**
 * The options for FileSystem.move()
 * @public
 */
export interface IMoveOptions {
  overwrite?: boolean;
}

/**
 * The options for FileSystem.deleteFile()
 * @public
*/
export interface IDeleteFileOptions {
  throwIfNotExists?: boolean;
}

/**
 * A standardized file system API
 * @public
 */
export class FileSystem {
  public static exists(path: string): Boolean {
    return fsx.existsSync(path);
  }

  public static createFolder(folderPath: string): void {
    fsx.ensureDirSync(folderPath);
  }

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

  public static writeFile(filePath: string, contents: string, options?: IWriteFileOptions): void {
    options = {
      ensureFolder: true,
      convertLineEndings: NewlineConversion.None,
      encoding: 'utf8',
      ...options
    };

    if (options.ensureFolder) {
      const folderPath: string = pathUtilities.dirname(filePath);
      FileSystem.createFolder(folderPath);
    }

    contents = FileSystem._convertLineEndings(contents, options.convertLineEndings);

    fsx.writeFileSync(filePath, contents, { encoding: options.encoding });
  }

  public static emptyFolder(folderPath: string): void {
    fsx.emptyDirSync(folderPath);
  }

  public static copyFile(sourcePath: string, destinationPath: string): void {
    fsx.copySync(sourcePath, destinationPath);
  }

  public static readFile(filePath: string, options?: IReadFileOptions): string {
    options = {
      encoding: 'utf8',
      convertLineEndings: NewlineConversion.None,
      ...options
    };

    const contents: string = FileSystem.readFileToBuffer(filePath).toString(options.encoding);
    return FileSystem._convertLineEndings(contents, options.convertLineEndings);
  }

  public static readFileToBuffer(filePath: string): Buffer {
    return fsx.readFileSync(filePath);
  }

  public static deleteFile(filePath: string, options?: IDeleteFileOptions): void {
    options = {
      throwIfNotExists: false,
      ...options
    };

    if (options.throwIfNotExists || FileSystem.exists(filePath)) {
      fsx.unlinkSync(filePath);
    }
  }

  public static deleteFolder(folderPath: string): void {
    fsx.removeSync(folderPath);
  }

  // @todo, fixup places where we are using lstat not stat
  public static getStatistics(path: string): fs.Stats {
    return fsx.lstatSync(path);
  }

  public static changeMode(path: string, mode: number): void {
    fsx.chmodSync(path, mode);
  }

  public static move(sourcePath: string, destinationPath: string, options?: IMoveOptions): void {
    options = {
      overwrite: false,
      ...options
    };
    fsx.moveSync(sourcePath, destinationPath);
  }

  public static createSymbolicLinkToFolder(linkSource: string, linkTarget: string): void {
    // For directories, we use a Windows "junction".  On Unix, this produces a regular symlink.
    fsx.symlinkSync(linkTarget, linkSource, 'junction');
  }

  public static createSymbolicLinkToFile(linkSource: string, linkTarget: string): void {
    fsx.symlinkSync(linkSource, linkTarget, 'file');
  }

  public static createHardLinkToFile(linkSource: string, linkTarget: string): void {
    fsx.linkSync(linkSource, linkTarget);
  }

  public static followLink(linkPath: string): string {
    return fsx.realpathSync(linkPath);
  }

  public static updateTimes(path: string, accessedTime: number, modifiedTime: number): void {
    fsx.utimes(path, accessedTime, modifiedTime);
  }

  private static _convertLineEndings(text: string, lineEndings: NewlineConversion | undefined): string {
    if (lineEndings === NewlineConversion.CrLf) {
      return Text.convertToCrLf(text);
    } else if (lineEndings === NewlineConversion.Lf) {
      return Text.convertToLf(text);
    }
    return text;
  }
}

/**
 * API for interacting with file handles
 * @public
 */
export class File {
  private _fileDescriptor: number | undefined;

  public static open(path: string, mode: string): File {
    return new File(fsx.openSync(path, mode));
  }

  public write(text: string): void {
    if (!this._fileDescriptor) {
      throw new Error(`Cannot write to file, file descriptor has already been released.`);
    }

    fsx.writeSync(this._fileDescriptor, text);
  }

  public close(): void {
    if (!this._fileDescriptor) {
      throw new Error(`Cannot close a file twice`);
    }

    const fd: number = this._fileDescriptor;
    this._fileDescriptor = undefined;
    fsx.closeSync(fd);
  }

  private constructor(fileDescriptor: number) {
    this._fileDescriptor = fileDescriptor;
  }
}