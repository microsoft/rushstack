import * as fs from 'fs';
import * as path from 'path';
import type { ReaddirAsynchronousMethod, ReaddirSynchronousMethod } from '@nodelib/fs.scandir';
import type { StatAsynchronousMethod, StatSynchronousMethod } from '@nodelib/fs.stat';
import type { FileSystemAdapter } from 'fast-glob';
import { Path } from '@rushstack/node-core-library';

interface IVirtualFileSystemEntry {
  name: string;
  children?: Set<IVirtualFileSystemEntry>;
}

interface IReaddirOptions {
  withFileTypes: true;
}

/* eslint-disable @rushstack/no-new-null */
type StatCallback = (error: NodeJS.ErrnoException | null, stats: fs.Stats) => void;
type ReaddirStringCallback = (error: NodeJS.ErrnoException | null, files: string[]) => void;
type ReaddirDirentCallback = (error: NodeJS.ErrnoException | null, files: fs.Dirent[]) => void;
/* eslint-enable @rushstack/no-new-null */

const IS_WINDOWS: boolean = process.platform === 'win32';

/**
 * A filesystem adapter for use with the "fast-glob" package. This adapter uses a static set of paths
 * to provide a virtual filesystem.
 *
 * @remarks This adapter only implements methods required to allow for globbing. This means that it
 * does not support returning true-to-disk file stats or dirent objects. Instead, the returned file
 * stats and dirent objects only implement the `isDirectory` and `isFile` methods, which are
 * required for filesystem traversal performed by the globber.
 */
export class StaticFileSystemAdapter implements FileSystemAdapter {
  private _directoryMap: Map<string, IVirtualFileSystemEntry> = new Map<string, IVirtualFileSystemEntry>();

  /** { @inheritdoc fs.lstat } */
  public lstat: StatAsynchronousMethod = ((filePath: string, callback: StatCallback) => {
    process.nextTick(() => {
      let result: fs.Stats;
      try {
        result = this.lstatSync(filePath);
      } catch (e) {
        callback(e, {} as fs.Stats);
        return;
      }
      // eslint-disable-next-line @rushstack/no-new-null
      callback(null, result);
    });
  }) as StatAsynchronousMethod;

  /** { @inheritdoc fs.lstatSync } */
  public lstatSync: StatSynchronousMethod = ((filePath: string) => {
    filePath = this._normalizePath(filePath);
    const entry: IVirtualFileSystemEntry | undefined = this._directoryMap.get(filePath);
    if (!entry) {
      const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
      error.code = 'ENOENT';
      error.syscall = 'stat';
      error.errno = -4058;
      error.path = filePath;
      throw error;
    }
    // We should only need to implement these methods for the purposes of fast-glob
    return {
      isFile: () => !entry.children,
      isDirectory: () => !!entry.children,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isSymbolicLink: () => false,
      isFIFO: () => false,
      isSocket: () => false
    };
  }) as StatSynchronousMethod;

  /** { @inheritdoc fs.stat } */
  public stat: StatAsynchronousMethod = ((filePath: string, callback: StatCallback) => {
    this.lstat(filePath, callback);
  }) as StatAsynchronousMethod;

  /** { @inheritdoc fs.statSync } */
  public statSync: StatSynchronousMethod = ((filePath: string) => {
    return this.lstatSync(filePath);
  }) as StatSynchronousMethod;

  /** { @inheritdoc fs.readdir } */
  public readdir: ReaddirAsynchronousMethod = ((
    filePath: string,
    optionsOrCallback: IReaddirOptions | ReaddirStringCallback,
    callback?: ReaddirDirentCallback | ReaddirStringCallback
  ) => {
    // Default to no options, which will return a string callback
    let options: IReaddirOptions | undefined;
    if (typeof optionsOrCallback === 'object') {
      options = optionsOrCallback;
    } else if (typeof optionsOrCallback === 'function') {
      callback = optionsOrCallback;
    }

    // Perform the readdir on the next tick to avoid blocking the event loop
    process.nextTick(() => {
      let result: fs.Dirent[] | string[];
      try {
        if (options?.withFileTypes) {
          result = this.readdirSync(filePath, options);
        } else {
          result = this.readdirSync(filePath);
        }
      } catch (e) {
        callback!(e, []);
        return;
      }

      // When "withFileTypes" is false or undefined, the callback is expected to return a string array.
      // Otherwise, we return a fs.Dirent array.
      if (options?.withFileTypes) {
        // eslint-disable-next-line @rushstack/no-new-null
        (callback as ReaddirDirentCallback)(null, result as fs.Dirent[]);
      } else {
        // eslint-disable-next-line @rushstack/no-new-null
        (callback as ReaddirStringCallback)(null, result as string[]);
      }
    });
  }) as ReaddirAsynchronousMethod;

  /** { @inheritdoc fs.readdirSync } */
  public readdirSync: ReaddirSynchronousMethod = ((filePath: string, options?: IReaddirOptions) => {
    filePath = this._normalizePath(filePath);
    const virtualDirectory: IVirtualFileSystemEntry | undefined = this._directoryMap.get(filePath);
    if (!virtualDirectory) {
      // Immitate a missing directory read from fs.readdir
      const error: NodeJS.ErrnoException = new Error(
        `ENOENT: no such file or directory, scandir '${filePath}'`
      );
      error.code = 'ENOENT';
      error.syscall = 'scandir';
      error.errno = -4058;
      error.path = filePath;
      throw error;
    } else if (!virtualDirectory.children) {
      // Immitate a directory read of a file from fs.readdir
      const error: NodeJS.ErrnoException = new Error(`ENOTDIR: not a directory, scandir '${filePath}'`);
      error.code = 'ENOTDIR';
      error.syscall = 'scandir';
      error.errno = -4052;
      error.path = filePath;
      throw error;
    }

    // When "withFileTypes" is false or undefined, the method is expected to return a string array.
    // Otherwise, we return a fs.Dirent array.
    const result: IVirtualFileSystemEntry[] = Array.from(virtualDirectory.children);
    if (options?.withFileTypes) {
      return result.map((entry: IVirtualFileSystemEntry) => {
        // Partially implement the fs.Dirent interface, only including the properties used by fast-glob
        return {
          name: entry.name,
          isFile: () => !entry.children,
          isDirectory: () => !!entry.children,
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isSymbolicLink: () => false,
          isFIFO: () => false,
          isSocket: () => false
        };
      });
    } else {
      return result.map((entry: IVirtualFileSystemEntry) => entry.name);
    }
  }) as ReaddirSynchronousMethod;

  /**
   * Create a new StaticFileSystemAdapter instance with the provided file paths.
   */
  public constructor(filePaths?: Iterable<string>) {
    for (const filePath of filePaths || []) {
      this.addFile(filePath);
    }
  }

  /**
   * Add a file and it's parent directories to the static virtual filesystem.
   */
  public addFile(filePath: string): void {
    filePath = this._normalizePath(filePath);
    const existingPath: IVirtualFileSystemEntry | undefined = this._directoryMap.get(filePath);
    if (!existingPath) {
      // Set an entry without children for the file. Entries with undefined children are assumed to be files.
      let childPath: string = filePath;
      let childEntry: IVirtualFileSystemEntry = { name: path.basename(childPath) };
      this._directoryMap.set(childPath, childEntry);

      // Loop through the path segments and create entries for each directory, if they don't already exist.
      // If they do, append to the existing children set and continue.
      let parentPath: string | undefined;
      while ((parentPath = path.dirname(childPath)) !== childPath) {
        const existingParentEntry: IVirtualFileSystemEntry | undefined = this._directoryMap.get(parentPath);
        if (existingParentEntry) {
          // If there is already an existing parent entry, add the child entry to the existing children set
          // and exit early, since the parent entries already exist.
          existingParentEntry.children!.add(childEntry);
          break;
        } else {
          // If there is no existing parent entry, create a new entry with the child entry as the only child.
          const parentEntry: IVirtualFileSystemEntry = {
            name: path.basename(parentPath),
            children: new Set([childEntry])
          };
          this._directoryMap.set(parentPath, parentEntry);
          childEntry = parentEntry;
          childPath = parentPath;
        }
      }
    }
  }

  /**
   * Remove a file from the static virtual filesystem.
   */
  public removeFile(filePath: string): void {
    filePath = this._normalizePath(filePath);
    const existingEntry: IVirtualFileSystemEntry | undefined = this._directoryMap.get(filePath);
    if (existingEntry) {
      // Remove the entry from the map and the parent's children set
      this._directoryMap.delete(filePath);
      this._directoryMap.get(path.dirname(filePath))!.children!.delete(existingEntry);
    }
  }

  /**
   * Remove all files from the static virtual filesystem.
   */
  public removeAllFiles(): void {
    this._directoryMap.clear();
  }

  private _normalizePath(filePath: string): string {
    // On Windows, normalize to backslashes so that errors have the correct path format
    return IS_WINDOWS ? Path.convertToBackslashes(filePath) : filePath;
  }
}
