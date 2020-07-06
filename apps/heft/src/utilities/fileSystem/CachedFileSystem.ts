// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import * as nodeJsPath from 'path';
import {
  Encoding,
  Text,
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

interface ICacheEntry<TEntry> {
  entry?: TEntry;
  error?: NodeJS.ErrnoException;
}

/**
 * This extended variant of the FileSystem API uses an in-memory cache to avoid
 * requests against the disk. It assumes that the disk stays static after construction,
 * except for writes performed through the CachedFileSystem instance.
 */
export class CachedFileSystem implements IExtendedFileSystem {
  private _statsCache: Map<string, ICacheEntry<FileSystemStats>> = new Map<
    string,
    ICacheEntry<FileSystemStats>
  >();
  private _readFolderCache: Map<string, ICacheEntry<IReadFolderFilesAndDirectoriesResult>> = new Map<
    string,
    ICacheEntry<IReadFolderFilesAndDirectoriesResult>
  >();
  private _readFileCache: Map<string, ICacheEntry<Buffer>> = new Map<string, ICacheEntry<Buffer>>();
  private _linkStatsCache: Map<string, ICacheEntry<FileSystemStats>> = new Map<
    string,
    ICacheEntry<FileSystemStats>
  >();
  private _readLinkCache: Map<string, ICacheEntry<string>> = new Map<string, ICacheEntry<string>>();
  private _realPathCache: Map<string, ICacheEntry<string>> = new Map<string, ICacheEntry<string>>();

  public exists: (path: string) => boolean = (path: string) => {
    try {
      this.getStatistics(path);
      return true;
    } catch (e) {
      if (FileSystem.isNotExistError(e)) {
        return false;
      } else {
        throw e;
      }
    }
  };

  public getStatistics: (path: string) => FileSystemStats = (path: string) => {
    return this._withCaching(path, FileSystem.getStatistics, this._statsCache);
  };

  public getStatisticsAsync: (path: string) => Promise<FileSystemStats> = async (path: string) => {
    return await this._withCachingAsync(path, FileSystem.getStatisticsAsync, this._statsCache);
  };

  public updateTimes: (path: string, times: IFileSystemUpdateTimeParameters) => void = (
    path: string,
    times: IFileSystemUpdateTimeParameters
  ) => {
    FileSystem.updateTimes(path, times);
    this._invalidateCacheEntry(path);
  };

  public updateTimesAsync: (path: string, times: IFileSystemUpdateTimeParameters) => Promise<void> = async (
    path: string,
    times: IFileSystemUpdateTimeParameters
  ) => {
    await FileSystem.updateTimesAsync(path, times);
    this._invalidateCacheEntry(path);
  };

  public changePosixModeBits: (path: string, mode: PosixModeBits) => void = (
    path: string,
    mode: PosixModeBits
  ) => {
    FileSystem.changePosixModeBits(path, mode);
    this._invalidateCacheEntry(path);
  };

  public changePosixModeBitsAsync: (path: string, mode: PosixModeBits) => Promise<void> = async (
    path: string,
    mode: PosixModeBits
  ) => {
    await FileSystem.changePosixModeBitsAsync(path, mode);
    this._invalidateCacheEntry(path);
  };

  public getPosixModeBits: (path: string) => PosixModeBits = (path: string) => {
    return this.getStatistics(path).mode;
  };

  public getPosixModeBitsAsync: (path: string) => Promise<PosixModeBits> = async (path: string) => {
    return (await this.getStatisticsAsync(path)).mode;
  };

  public formatPosixModeBits: (modeBits: PosixModeBits) => string = (modeBits: PosixModeBits) => {
    return FileSystem.formatPosixModeBits(modeBits);
  };

  public move: (options: IFileSystemMoveOptions) => void = () => {
    this._throwNotSupportedError();
  };

  public moveAsync: (options: IFileSystemMoveOptions) => Promise<void> = () => {
    this._throwNotSupportedError();
  };

  public ensureFolder: (folderPath: string) => void = (folderPath: string) => {
    if (!this._readFolderCache.get(folderPath)?.entry && !this._statsCache.get(folderPath)?.entry) {
      FileSystem.ensureFolder(folderPath);
      this._invalidateCacheEntry(folderPath);
    }
  };

  public ensureFolderAsync: (folderPath: string) => Promise<void> = async (folderPath: string) => {
    if (!this._readFolderCache.get(folderPath)?.entry && !this._statsCache.get(folderPath)?.entry) {
      await FileSystem.ensureFolderAsync(folderPath);
      this._invalidateCacheEntry(folderPath);
    }
  };

  public readFolder: (folderPath: string, options?: IFileSystemReadFolderOptions) => string[] = (
    folderPath: string,
    options?: IFileSystemReadFolderOptions
  ) => {
    const result: IReadFolderFilesAndDirectoriesResult = this.readFolderFilesAndDirectories(folderPath);
    const entryNames: string[] = [...result.directories, ...result.files];

    if (options?.absolutePaths) {
      return entryNames.map((fileName) => nodeJsPath.resolve(folderPath, fileName));
    } else {
      return entryNames;
    }
  };

  public readFolderAsync: (
    folderPath: string,
    options?: IFileSystemReadFolderOptions
  ) => Promise<string[]> = async (folderPath: string, options?: IFileSystemReadFolderOptions) => {
    const result: IReadFolderFilesAndDirectoriesResult = await this.readFolderFilesAndDirectoriesAsync(
      folderPath
    );
    const entryNames: string[] = [...result.directories, ...result.files];

    if (options?.absolutePaths) {
      return entryNames.map((fileName) => nodeJsPath.resolve(folderPath, fileName));
    } else {
      return entryNames;
    }
  };

  public deleteFolder: (folderPath: string) => void = (folderPath: string) => {
    const cachedError: Error | undefined = this._statsCache.get(folderPath)?.error;
    if (!cachedError || !FileSystem.isFolderDoesNotExistError(cachedError)) {
      FileSystem.deleteFolder(folderPath);
      this._invalidateCacheEntry(folderPath);
    }
  };

  public deleteFolderAsync: (folderPath: string) => Promise<void> = async (folderPath: string) => {
    const cachedError: Error | undefined = this._statsCache.get(folderPath)?.error;
    if (!cachedError || !FileSystem.isFolderDoesNotExistError(cachedError)) {
      await FileSystem.deleteFolderAsync(folderPath);
      this._invalidateCacheEntry(folderPath);
    }
  };

  public ensureEmptyFolder: (folderPath: string) => void = (folderPath: string) => {
    const cacheEntry: IReadFolderFilesAndDirectoriesResult | undefined = this._readFolderCache.get(folderPath)
      ?.entry;
    if (cacheEntry?.directories?.length === 0 && cacheEntry?.files?.length === 0) {
      return;
    } else {
      FileSystem.ensureEmptyFolder(folderPath);
      this._readFolderCache.set(folderPath, { entry: { files: [], directories: [] } });
    }
  };

  public ensureEmptyFolderAsync: (folderPath: string) => Promise<void> = async (folderPath: string) => {
    const cacheEntry: IReadFolderFilesAndDirectoriesResult | undefined = this._readFolderCache.get(folderPath)
      ?.entry;
    if (cacheEntry?.directories?.length === 0 && cacheEntry?.files?.length === 0) {
      return;
    } else {
      await FileSystem.ensureEmptyFolderAsync(folderPath);
      this._readFolderCache.set(folderPath, { entry: { files: [], directories: [] } });
    }
  };

  public writeFile: (
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions | undefined
  ) => void = (
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions | undefined
  ) => {
    FileSystem.writeFile(filePath, contents, options);
    this._invalidateCacheEntry(filePath);
  };

  public writeFileAsync: (
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions | undefined
  ) => Promise<void> = async (
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions | undefined
  ) => {
    await FileSystem.writeFileAsync(filePath, contents, options);
    this._invalidateCacheEntry(filePath);
  };

  public appendToFile: (
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions | undefined
  ) => void = (
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions | undefined
  ) => {
    FileSystem.appendToFile(filePath, contents, options);
    this._invalidateCacheEntry(filePath);
  };

  public appendToFileAsync: (
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions | undefined
  ) => Promise<void> = async (
    filePath: string,
    contents: string | Buffer,
    options?: IFileSystemWriteFileOptions | undefined
  ) => {
    await FileSystem.appendToFileAsync(filePath, contents, options);
    this._invalidateCacheEntry(filePath);
  };

  public readFile: (filePath: string, options?: IFileSystemReadFileOptions | undefined) => string = (
    filePath: string,
    options?: IFileSystemReadFileOptions | undefined
  ) => {
    let contents: string = this.readFileToBuffer(filePath).toString(options?.encoding || Encoding.Utf8);
    if (options?.convertLineEndings) {
      contents = Text.convertTo(contents, options.convertLineEndings);
    }

    return contents;
  };

  public readFileAsync: (
    filePath: string,
    options?: IFileSystemReadFileOptions | undefined
  ) => Promise<string> = async (filePath: string, options?: IFileSystemReadFileOptions | undefined) => {
    let contents: string = (await this.readFileToBufferAsync(filePath)).toString(
      options?.encoding || Encoding.Utf8
    );
    if (options?.convertLineEndings) {
      contents = Text.convertTo(contents, options.convertLineEndings);
    }

    return contents;
  };

  public readFileToBuffer: (filePath: string) => Buffer = (filePath: string) => {
    return this._withCaching(filePath, FileSystem.readFileToBuffer, this._readFileCache);
  };

  public readFileToBufferAsync: (filePath: string) => Promise<Buffer> = async (filePath: string) => {
    return await this._withCachingAsync(filePath, FileSystem.readFileToBufferAsync, this._readFileCache);
  };

  public copyFile: (options: IFileSystemCopyFileOptions) => void = (options: IFileSystemCopyFileOptions) => {
    FileSystem.copyFile(options);
    this._invalidateCacheEntry(options.destinationPath);
  };

  public copyFileAsync: (options: IFileSystemCopyFileOptions) => Promise<void> = async (
    options: IFileSystemCopyFileOptions
  ) => {
    await FileSystem.copyFileAsync(options);
    this._invalidateCacheEntry(options.destinationPath);
  };

  public copyFiles: (options: IFileSystemCopyFilesOptions) => void = async (
    options: IFileSystemCopyFilesOptions
  ) => {
    FileSystem.copyFiles(options);
    this._invalidateCacheEntry(options.destinationPath);
  };

  public copyFilesAsync: (options: IFileSystemCopyFilesOptions) => Promise<void> = async (
    options: IFileSystemCopyFilesOptions
  ) => {
    await FileSystem.copyFilesAsync(options);
    this._invalidateCacheEntry(options.destinationPath);
  };

  public deleteFile: (filePath: string, options?: IFileSystemDeleteFileOptions | undefined) => void = (
    filePath: string,
    options?: IFileSystemDeleteFileOptions | undefined
  ) => {
    const cachedError: Error | undefined = this._statsCache.get(filePath)?.error;
    if (!cachedError || !FileSystem.isFileDoesNotExistError(cachedError)) {
      FileSystem.deleteFile(filePath);
      this._invalidateCacheEntry(filePath);
    } else if (options?.throwIfNotExists) {
      throw cachedError;
    }
  };

  public deleteFileAsync: (
    filePath: string,
    options?: IFileSystemDeleteFileOptions | undefined
  ) => Promise<void> = async (filePath: string, options?: IFileSystemDeleteFileOptions | undefined) => {
    const cachedError: Error | undefined = this._statsCache.get(filePath)?.error;
    if (!cachedError || !FileSystem.isFileDoesNotExistError(cachedError)) {
      await FileSystem.deleteFileAsync(filePath);
      this._invalidateCacheEntry(filePath);
    } else if (options?.throwIfNotExists) {
      throw cachedError;
    }
  };

  public getLinkStatistics: (path: string) => FileSystemStats = (path: string) => {
    return this._withCaching(path, FileSystem.getLinkStatistics, this._linkStatsCache);
  };

  public getLinkStatisticsAsync: (path: string) => Promise<FileSystemStats> = async (path: string) => {
    return await this._withCachingAsync(path, FileSystem.getLinkStatisticsAsync, this._linkStatsCache);
  };

  public readLink: (path: string) => string = (path: string) => {
    return this._withCaching(path, FileSystem.readLink, this._readLinkCache);
  };

  public readLinkAsync: (path: string) => Promise<string> = async (path: string) => {
    return await this._withCachingAsync(path, FileSystem.readLinkAsync, this._readLinkCache);
  };

  public createSymbolicLinkJunction: (options: IFileSystemCreateLinkOptions) => void = (
    options: IFileSystemCreateLinkOptions
  ) => {
    FileSystem.createSymbolicLinkJunction(options);
    this._invalidateCacheEntry(options.newLinkPath);
  };

  public createSymbolicLinkJunctionAsync: (options: IFileSystemCreateLinkOptions) => Promise<void> = async (
    options: IFileSystemCreateLinkOptions
  ) => {
    await FileSystem.createSymbolicLinkJunctionAsync(options);
    this._invalidateCacheEntry(options.newLinkPath);
  };

  public createSymbolicLinkFile: (options: IFileSystemCreateLinkOptions) => void = (
    options: IFileSystemCreateLinkOptions
  ) => {
    FileSystem.createSymbolicLinkFile(options);
    this._invalidateCacheEntry(options.newLinkPath);
  };

  public createSymbolicLinkFileAsync: (options: IFileSystemCreateLinkOptions) => Promise<void> = async (
    options: IFileSystemCreateLinkOptions
  ) => {
    await FileSystem.createSymbolicLinkFileAsync(options);
    this._invalidateCacheEntry(options.newLinkPath);
  };

  public createSymbolicLinkFolder: (options: IFileSystemCreateLinkOptions) => void = (
    options: IFileSystemCreateLinkOptions
  ) => {
    FileSystem.createSymbolicLinkFolder(options);
    this._invalidateCacheEntry(options.newLinkPath);
  };

  public createSymbolicLinkFolderAsync: (options: IFileSystemCreateLinkOptions) => Promise<void> = async (
    options: IFileSystemCreateLinkOptions
  ) => {
    await FileSystem.createSymbolicLinkFolderAsync(options);
    this._invalidateCacheEntry(options.newLinkPath);
  };

  public createHardLink: (options: IFileSystemCreateLinkOptions) => void = (
    options: IFileSystemCreateLinkOptions
  ) => {
    FileSystem.createHardLink(options);
    this._invalidateCacheEntry(options.newLinkPath);
  };

  public createHardLinkAsync: (options: IFileSystemCreateLinkOptions) => Promise<void> = async (
    options: IFileSystemCreateLinkOptions
  ) => {
    await FileSystem.createHardLinkAsync(options);
    this._invalidateCacheEntry(options.newLinkPath);
  };

  public getRealPath: (linkPath: string) => string = (linkPath: string) => {
    return this._withCaching(linkPath, FileSystem.getRealPath, this._realPathCache);
  };

  public getRealPathAsync: (linkPath: string) => Promise<string> = async (linkPath: string) => {
    return await this._withCachingAsync(linkPath, FileSystem.getRealPathAsync, this._realPathCache);
  };

  public isNotExistError(error: Error): boolean {
    return FileSystem.isNotExistError(error);
  }

  public isFileDoesNotExistError(error: Error): boolean {
    return FileSystem.isFileDoesNotExistError(error);
  }

  public isFolderDoesNotExistError(error: Error): boolean {
    return FileSystem.isFolderDoesNotExistError(error);
  }

  public isErrnoException(error: Error): error is NodeJS.ErrnoException {
    return FileSystem.isErrnoException(error);
  }

  public readFolderFilesAndDirectories: (folderPath: string) => IReadFolderFilesAndDirectoriesResult = (
    folderPath: string
  ) => {
    return this._withCaching(
      folderPath,
      (path: string) => {
        // TODO: Replace this with a FileSystem API
        const folderEntries: fs.Dirent[] = fs.readdirSync(path, { withFileTypes: true });
        return this._sortFolderEntries(folderEntries);
      },
      this._readFolderCache
    );
  };

  public readFolderFilesAndDirectoriesAsync: (
    folderPath: string
  ) => Promise<IReadFolderFilesAndDirectoriesResult> = async (folderPath: string) => {
    return await this._withCachingAsync(
      folderPath,
      async (path: string) => {
        // TODO: Replace this with a FileSystem API
        const folderEntries: fs.Dirent[] = await fs.promises.readdir(path, { withFileTypes: true });
        return this._sortFolderEntries(folderEntries);
      },
      this._readFolderCache
    );
  };

  public createHardLinkExtendedAsync: (options: ICreateHardLinkExtendedOptions) => Promise<boolean> = async (
    options: ICreateHardLinkExtendedOptions
  ) => {
    try {
      await this.createHardLinkAsync(options);
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') {
        if (options.preserveExisting) {
          return false;
        }

        this.deleteFile(options.newLinkPath);
      } else if (this.isNotExistError(error)) {
        await this.ensureFolderAsync(nodeJsPath.dirname(options.newLinkPath));
      } else {
        throw error;
      }

      await this.createHardLinkAsync(options);
      return true;
    }
  };

  private _sortFolderEntries(folderEntries: fs.Dirent[]): IReadFolderFilesAndDirectoriesResult {
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

  private _withCaching<TResult>(
    path: string,
    fn: (path: string) => TResult,
    cache: Map<string, ICacheEntry<TResult>>
  ): TResult {
    let cacheEntry: ICacheEntry<TResult> | undefined = cache.get(path);
    if (!cacheEntry) {
      try {
        cacheEntry = { entry: fn(path) };
      } catch (e) {
        cacheEntry = { error: e };
      }

      cache.set(path, cacheEntry);
    }

    if (cacheEntry.entry) {
      return cacheEntry.entry;
    } else {
      throw cacheEntry.error;
    }
  }

  private async _withCachingAsync<TResult>(
    path: string,
    fn: (path: string) => Promise<TResult>,
    cache: Map<string, ICacheEntry<TResult>>
  ): Promise<TResult> {
    let cacheEntry: ICacheEntry<TResult> | undefined = cache.get(path);
    if (!cacheEntry) {
      try {
        cacheEntry = { entry: await fn(path) };
      } catch (e) {
        cacheEntry = { error: e };
      }

      cache.set(path, cacheEntry);
    }

    if (cacheEntry.entry) {
      return cacheEntry.entry;
    } else {
      throw cacheEntry.error;
    }
  }

  private _invalidateCacheEntry(path: string): void {
    this._statsCache.delete(path);
    this._readFolderCache.delete(path);
    this._readFileCache.delete(path);
    this._linkStatsCache.delete(path);
    this._readLinkCache.delete(path);
    this._realPathCache.delete(path);
  }

  private _throwNotSupportedError(): never {
    throw new Error('Operation not supported by cached filesystem.');
  }
}
