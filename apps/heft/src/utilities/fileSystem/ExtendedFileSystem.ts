// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import * as nodeJsPath from 'path';
import {
  PosixModeBits,
  IFileSystemUpdateTimeParameters,
  IFileSystemReadFolderOptions,
  IFileSystemMoveOptions,
  IFileSystemWriteFileOptions,
  IFileSystemReadFileOptions,
  IFileSystemCopyFileOptions,
  IFileSystemDeleteFileOptions,
  IFileSystemCreateLinkOptions,
  FileSystem,
  FileSystemStats,
  IFileSystemCopyFilesOptions
} from '@rushstack/node-core-library';

import {
  IExtendedFileSystem,
  IReadFolderFilesAndDirectoriesResult,
  ICreateHardLinkExtendedOptions
} from './IExtendedFileSystem';

export class ExtendedFileSystem implements IExtendedFileSystem {
  /**
   * This is a wrapper around the node-core-library FileSystem API, so just use those APIs for everything we can
   */
  public readonly exists: (path: string) => boolean = FileSystem.exists;
  public readonly getStatistics: (path: string) => FileSystemStats = FileSystem.getStatistics;
  public readonly getStatisticsAsync: (path: string) => Promise<FileSystemStats> =
    FileSystem.getStatisticsAsync;
  public readonly updateTimes: (path: string, times: IFileSystemUpdateTimeParameters) => void =
    FileSystem.updateTimes;
  public readonly updateTimesAsync: (path: string, times: IFileSystemUpdateTimeParameters) => Promise<void> =
    FileSystem.updateTimesAsync;
  public readonly changePosixModeBits: (path: string, mode: PosixModeBits) => void =
    FileSystem.changePosixModeBits;
  public readonly changePosixModeBitsAsync: (path: string, mode: PosixModeBits) => Promise<void> =
    FileSystem.changePosixModeBitsAsync;
  public readonly getPosixModeBits: (path: string) => PosixModeBits = FileSystem.getPosixModeBits;
  public readonly getPosixModeBitsAsync: (path: string) => Promise<PosixModeBits> =
    FileSystem.getPosixModeBitsAsync;
  public readonly formatPosixModeBits: (modeBits: PosixModeBits) => string = FileSystem.formatPosixModeBits;
  public readonly move: (options: IFileSystemMoveOptions) => void = FileSystem.move;
  public readonly moveAsync: (options: IFileSystemMoveOptions) => Promise<void> = FileSystem.moveAsync;
  public readonly ensureFolder: (folderPath: string) => void = FileSystem.ensureFolder;
  public readonly ensureFolderAsync: (folderPath: string) => Promise<void> = FileSystem.ensureFolderAsync;
  public readonly readFolder: (
    folderPath: string,
    options?: IFileSystemReadFolderOptions | undefined
  ) => string[] = FileSystem.readFolder;
  public readonly readFolderAsync: (
    folderPath: string,
    options?: IFileSystemReadFolderOptions | undefined
  ) => Promise<string[]> = FileSystem.readFolderAsync;
  public readonly deleteFolder: (folderPath: string) => void = FileSystem.deleteFolder;
  public readonly deleteFolderAsync: (folderPath: string) => Promise<void> = FileSystem.deleteFolderAsync;
  public readonly ensureEmptyFolder: (folderPath: string) => void = FileSystem.ensureEmptyFolder;
  public readonly ensureEmptyFolderAsync: (folderPath: string) => Promise<void> =
    FileSystem.ensureEmptyFolderAsync;
  public readonly writeFile: (
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions | undefined
  ) => void = FileSystem.writeFile;
  public readonly writeFileAsync: (
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions | undefined
  ) => Promise<void> = FileSystem.writeFileAsync;
  public readonly appendToFile: (
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions | undefined
  ) => void = FileSystem.appendToFile;
  public readonly appendToFileAsync: (
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions | undefined
  ) => Promise<void> = FileSystem.appendToFileAsync;
  public readonly readFile: (filePath: string, options?: IFileSystemReadFileOptions | undefined) => string =
    FileSystem.readFile;
  public readonly readFileAsync: (
    filePath: string,
    options?: IFileSystemReadFileOptions | undefined
  ) => Promise<string> = FileSystem.readFileAsync;
  public readonly readFileToBuffer: (filePath: string) => Buffer = FileSystem.readFileToBuffer;
  public readonly readFileToBufferAsync: (filePath: string) => Promise<Buffer> =
    FileSystem.readFileToBufferAsync;
  public readonly copyFile: (options: IFileSystemCopyFileOptions) => void = FileSystem.copyFile;
  public readonly copyFileAsync: (options: IFileSystemCopyFileOptions) => Promise<void> =
    FileSystem.copyFileAsync;
  public readonly copyFiles: (options: IFileSystemCopyFilesOptions) => void = FileSystem.copyFiles;
  public readonly copyFilesAsync: (options: IFileSystemCopyFilesOptions) => Promise<void> =
    FileSystem.copyFilesAsync;
  public readonly deleteFile: (filePath: string, options?: IFileSystemDeleteFileOptions | undefined) => void =
    FileSystem.deleteFile;
  public readonly deleteFileAsync: (
    filePath: string,
    options?: IFileSystemDeleteFileOptions | undefined
  ) => Promise<void> = FileSystem.deleteFileAsync;
  public readonly getLinkStatistics: (path: string) => FileSystemStats = FileSystem.getLinkStatistics;
  public readonly getLinkStatisticsAsync: (path: string) => Promise<FileSystemStats> =
    FileSystem.getLinkStatisticsAsync;
  public readonly readLink: (path: string) => string = FileSystem.readLink;
  public readonly readLinkAsync: (path: string) => Promise<string> = FileSystem.readLinkAsync;
  public readonly createSymbolicLinkJunction: (options: IFileSystemCreateLinkOptions) => void =
    FileSystem.createSymbolicLinkJunction;
  public readonly createSymbolicLinkJunctionAsync: (options: IFileSystemCreateLinkOptions) => Promise<void> =
    FileSystem.createSymbolicLinkJunctionAsync;
  public readonly createSymbolicLinkFile: (options: IFileSystemCreateLinkOptions) => void =
    FileSystem.createSymbolicLinkFile;
  public readonly createSymbolicLinkFileAsync: (options: IFileSystemCreateLinkOptions) => Promise<void> =
    FileSystem.createSymbolicLinkFileAsync;
  public readonly createSymbolicLinkFolder: (options: IFileSystemCreateLinkOptions) => void =
    FileSystem.createSymbolicLinkFolder;
  public readonly createSymbolicLinkFolderAsync: (options: IFileSystemCreateLinkOptions) => Promise<void> =
    FileSystem.createSymbolicLinkFolderAsync;
  public readonly createHardLink: (options: IFileSystemCreateLinkOptions) => void = FileSystem.createHardLink;
  public readonly createHardLinkAsync: (options: IFileSystemCreateLinkOptions) => Promise<void> =
    FileSystem.createHardLinkAsync;
  public readonly getRealPath: (linkPath: string) => string = FileSystem.getRealPath;
  public readonly getRealPathAsync: (linkPath: string) => Promise<string> = FileSystem.getRealPathAsync;
  public readonly isNotExistError: (error: Error) => boolean = FileSystem.isNotExistError;
  public readonly isFileDoesNotExistError: (error: Error) => boolean = FileSystem.isFileDoesNotExistError;
  public readonly isFolderDoesNotExistError: (error: Error) => boolean = FileSystem.isFolderDoesNotExistError;
  public readonly isErrnoException: (error: Error) => error is NodeJS.ErrnoException =
    FileSystem.isErrnoException;

  public readFolderFilesAndDirectories(folderPath: string): IReadFolderFilesAndDirectoriesResult {
    // Replace this with a FileSystem API
    const folderEntries: fs.Dirent[] = fs.readdirSync(folderPath, { withFileTypes: true });

    // TypeScript expects entries sorted ordinally by name
    // In practice this might not matter
    folderEntries.sort((a, b) => {
      if (a > b) {
        return 1;
      } else if (a < b) {
        return -1;
      } else {
        return 0;
      }
    });

    const files: string[] = [];
    const directories: string[] = [];
    for (const folderEntry of folderEntries) {
      if (folderEntry.isFile()) {
        files.push(folderEntry.name);
      } else if (folderEntry.isDirectory()) {
        directories.push(folderEntry.name);
      }
    }

    return { files, directories };
  }

  public async createHardLinkExtendedAsync(options: ICreateHardLinkExtendedOptions): Promise<boolean> {
    try {
      await FileSystem.createHardLinkAsync(options);
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') {
        if (options.preserveExisting) {
          return false;
        }

        FileSystem.deleteFile(options.newLinkPath);
      } else if (FileSystem.isNotExistError(error)) {
        await FileSystem.ensureFolderAsync(nodeJsPath.dirname(options.newLinkPath));
      } else {
        throw error;
      }

      await FileSystem.createHardLinkAsync(options);
      return true;
    }
  }
}
