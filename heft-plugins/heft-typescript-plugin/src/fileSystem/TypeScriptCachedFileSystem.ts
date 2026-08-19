// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  Encoding,
  Text,
  type IFileSystemWriteFileOptions,
  type IFileSystemReadFileOptions,
  type IFileSystemCopyFileOptions,
  type IFileSystemDeleteFileOptions,
  type IFileSystemCreateLinkOptions,
  FileSystem,
  type FileSystemStats,
  Sort,
  type FolderItem
} from '@rushstack/node-core-library';

export interface IReadFolderFilesAndDirectoriesResult {
  files: string[];
  directories: string[];
}

interface ICacheEntry<TEntry> {
  entry: TEntry | undefined;
  error?: NodeJS.ErrnoException;
}

/**
 * This is a FileSystem API (largely unrelated to the @rushstack/node-core-library FileSystem API)
 * that provides caching to the Heft TypeScriptBuilder.
 * It uses an in-memory cache to avoid requests against the disk. It assumes that the disk stays
 * static after construction, except for writes performed through the TypeScriptCachedFileSystem
 * instance.
 */
export class TypeScriptCachedFileSystem {
  #statsCache: Map<string, ICacheEntry<FileSystemStats>> = new Map();
  #readFolderCache: Map<string, ICacheEntry<IReadFolderFilesAndDirectoriesResult>> = new Map();
  #readFileCache: Map<string, ICacheEntry<Buffer>> = new Map();
  #realPathCache: Map<string, ICacheEntry<string>> = new Map();

  public exists: (path: string) => boolean = (path: string) => {
    try {
      this.getStatistics(path);
      return true;
    } catch (e) {
      if (FileSystem.isNotExistError(e as Error)) {
        return false;
      } else {
        throw e;
      }
    }
  };

  public directoryExists: (path: string) => boolean = (path: string) => {
    try {
      const stats: FileSystemStats = this.getStatistics(path);
      return stats.isDirectory();
    } catch (e) {
      if (FileSystem.isNotExistError(e as Error)) {
        return false;
      } else {
        throw e;
      }
    }
  };

  public getStatistics: (path: string) => FileSystemStats = (path: string) => {
    return this.#withCaching(path, FileSystem.getStatistics, this.#statsCache);
  };

  public ensureFolder: (folderPath: string) => void = (folderPath: string) => {
    if (!this.#readFolderCache.get(folderPath)?.entry && !this.#statsCache.get(folderPath)?.entry) {
      FileSystem.ensureFolder(folderPath);
      this.#invalidateCacheEntry(folderPath);
    }
  };

  public ensureFolderAsync: (folderPath: string) => Promise<void> = async (folderPath: string) => {
    if (!this.#readFolderCache.get(folderPath)?.entry && !this.#statsCache.get(folderPath)?.entry) {
      await FileSystem.ensureFolderAsync(folderPath);
      this.#invalidateCacheEntry(folderPath);
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
    this.#invalidateCacheEntry(filePath);
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

  public readFileToBuffer: (filePath: string) => Buffer = (filePath: string) => {
    return this.#withCaching(filePath, FileSystem.readFileToBuffer, this.#readFileCache);
  };

  public copyFileAsync: (options: IFileSystemCopyFileOptions) => Promise<void> = async (
    options: IFileSystemCopyFileOptions
  ) => {
    await FileSystem.copyFileAsync(options);
    this.#invalidateCacheEntry(options.destinationPath);
  };

  public deleteFile: (filePath: string, options?: IFileSystemDeleteFileOptions | undefined) => void = (
    filePath: string,
    options?: IFileSystemDeleteFileOptions | undefined
  ) => {
    const cachedError: Error | undefined = this.#statsCache.get(filePath)?.error;
    if (!cachedError || !FileSystem.isFileDoesNotExistError(cachedError)) {
      FileSystem.deleteFile(filePath);
      this.#invalidateCacheEntry(filePath);
    } else if (options?.throwIfNotExists) {
      throw cachedError;
    }
  };

  public createHardLinkAsync: (options: IFileSystemCreateLinkOptions) => Promise<void> = async (
    options: IFileSystemCreateLinkOptions
  ) => {
    await FileSystem.createHardLinkAsync(options);
    this.#invalidateCacheEntry(options.newLinkPath);
  };

  public getRealPath: (linkPath: string) => string = (linkPath: string) => {
    return this.#withCaching(
      linkPath,
      (path: string) => {
        try {
          return FileSystem.getRealPath(path);
        } catch (e) {
          if (FileSystem.isNotExistError(e as Error)) {
            // TypeScript's ts.sys.realpath returns the path it's provided if that path doesn't exist
            return path;
          } else {
            throw e;
          }
        }
      },
      this.#realPathCache
    );
  };

  public readFolderFilesAndDirectories: (folderPath: string) => IReadFolderFilesAndDirectoriesResult = (
    folderPath: string
  ) => {
    return this.#withCaching(
      folderPath,
      (path: string) => {
        const folderEntries: FolderItem[] = FileSystem.readFolderItems(path);
        return this.#sortFolderEntries(folderEntries);
      },
      this.#readFolderCache
    );
  };

  #sortFolderEntries(folderEntries: FolderItem[]): IReadFolderFilesAndDirectoriesResult {
    // TypeScript expects entries sorted ordinally by name
    // In practice this might not matter
    folderEntries.sort((a, b) => Sort.compareByValue(a, b));

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

  #withCaching<TResult>(
    path: string,
    fn: (path: string) => TResult,
    cache: Map<string, ICacheEntry<TResult>>
  ): TResult {
    let cacheEntry: ICacheEntry<TResult> | undefined = cache.get(path);
    if (!cacheEntry) {
      try {
        cacheEntry = { entry: fn(path) };
      } catch (e) {
        cacheEntry = { error: e as Error, entry: undefined };
      }

      cache.set(path, cacheEntry);
    }

    if (cacheEntry.entry) {
      return cacheEntry.entry;
    } else {
      throw cacheEntry.error;
    }
  }

  #invalidateCacheEntry(path: string): void {
    this.#statsCache.delete(path);
    this.#readFolderCache.delete(path);
    this.#readFileCache.delete(path);
    this.#realPathCache.delete(path);
  }
}
