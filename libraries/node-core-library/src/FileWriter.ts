// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import type { FileSystemStats } from './FileSystem';

/**
 * Available file handle opening flags.
 * @public
 */
type NodeFileFlags = 'r' | 'r+' | 'rs+' | 'w' | 'wx' | 'w+' | 'wx+' | 'a' | 'ax' | 'a+' | 'ax+';

/**
 * Helper function to convert the file writer array to a Node.js style string (e.g. "wx" or "a").
 * @param flags - The flags that should be converted.
 */
function convertFlagsForNode(flags: IFileWriterFlags | undefined): NodeFileFlags {
  flags = {
    append: false,
    exclusive: false,
    ...flags
  };
  const result: NodeFileFlags = `${flags.append ? 'a' : 'w'}${flags.exclusive ? 'x' : ''}` as NodeFileFlags;
  return result;
}

/**
 * Interface which represents the flags about which mode the file should be opened in.
 * @public
 */
export interface IFileWriterFlags {
  /**
   * Open file for appending.
   */
  append?: boolean;

  /**
   * Fails if path exists. The exclusive flag ensures that path is newly created.
   *
   * @remarks
   * On POSIX-like operating systems, path is considered to exist even if it is a symlink to a
   * non-existent file.  The exclusive flag may or may not work with network file systems.
   *
   * POSIX is a registered trademark of the Institute of Electrical and Electronic Engineers, Inc.
   */
  exclusive?: boolean;
}

/**
 * API for interacting with file handles.
 * @public
 */
export class FileWriter {
  /**
   * The `filePath` that was passed to {@link FileWriter.open}.
   */
  public readonly filePath: string;

  private _fileDescriptor: number | undefined;

  private constructor(fileDescriptor: number, filePath: string) {
    this._fileDescriptor = fileDescriptor;
    this.filePath = filePath;
  }

  /**
   * Opens a new file handle to the file at the specified path and given mode.
   * Behind the scenes it uses `fs.openSync()`.
   * The behaviour of this function is platform specific.
   * See: https://nodejs.org/docs/latest-v8.x/api/fs.html#fs_fs_open_path_flags_mode_callback
   * @param filePath - The absolute or relative path to the file handle that should be opened.
   * @param flags - The flags for opening the handle
   */
  public static open(filePath: string, flags?: IFileWriterFlags): FileWriter {
    return new FileWriter(fs.openSync(filePath, convertFlagsForNode(flags)), filePath);
  }

  /**
   * Writes some text to the given file handle. Throws if the file handle has been closed.
   * Behind the scenes it uses `fs.writeSync()`.
   * @param text - The text to write to the file.
   */
  public write(text: string): void {
    if (!this._fileDescriptor) {
      throw new Error(`Cannot write to file, file descriptor has already been released.`);
    }

    fs.writeSync(this._fileDescriptor, text);
  }

  /**
   * Closes the file handle permanently. No operations can be made on this file handle after calling this.
   * Behind the scenes it uses `fs.closeSync()` and releases the file descriptor to be re-used.
   *
   * @remarks
   * The `close()` method can be called more than once; additional calls are ignored.
   */
  public close(): void {
    const fd: number | undefined = this._fileDescriptor;
    if (fd) {
      this._fileDescriptor = undefined;
      fs.closeSync(fd);
    }
  }

  /**
   * Gets the statistics for the given file handle. Throws if the file handle has been closed.
   * Behind the scenes it uses `fs.statSync()`.
   */
  public getStatistics(): FileSystemStats {
    if (!this._fileDescriptor) {
      throw new Error(`Cannot get file statistics, file descriptor has already been released.`);
    }

    return fs.fstatSync(this._fileDescriptor);
  }
}
