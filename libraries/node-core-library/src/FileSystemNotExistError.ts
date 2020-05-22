// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * An `Error` subclass that should be thrown to report that a file or folder does not exist.
 *
 * @public
 */
export class FileSystemNotExistError extends Error implements NodeJS.ErrnoException {
  // These are the built in NodeJS.ErrnoException properties
  public readonly errno: number | undefined;
  public readonly code: string | undefined;
  public readonly path: string | undefined;
  public readonly syscall: string | undefined;

  /**
   * Constructs a new instance of the {@link FileSystemNotExistError} class.
   *
   * @param innerError - The error thrown by NodeJS's fs API
   */
  public constructor(innerError: NodeJS.ErrnoException) {
    super(
      FileSystemNotExistError.isFileNotExistError(innerError)
        ? FileSystemNotExistError._formatMessageForFile(innerError.path)
        : FileSystemNotExistError._formatMessageForFolder(innerError.path)
    );

    const errnoProperties: string[] = ['errno', 'code', 'path', 'syscall', 'stack'];
    for (const property of errnoProperties) {
      if (innerError.hasOwnProperty(property)) {
        this[property] = innerError[property];
      }
    }

    // Manually set the prototype, as we can no longer extend built-in classes like Error, Array, Map, etc.
    // https://github.com/microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    //
    // Note: the prototype must also be set on any classes which extend this one
    (this as any).__proto__ = FileSystemNotExistError.prototype; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  public static [Symbol.hasInstance](error: FileSystemNotExistError): boolean {
    return FileSystemNotExistError.isNotExistError(error);
  }

  /**
   * Returns true if the error provided indicates the file does not exist.
   */
  public static isFileNotExistError(error: NodeJS.ErrnoException): boolean {
    return error.code === 'ENOENT';
  }

  /**
   * Returns true if the error provided indicates the folder does not exist.
   */
  public static isFolderNotExistError(error: NodeJS.ErrnoException): boolean {
    return error.code === 'ENOTDIR';
  }

  /**
   * Returns true if the error provided indicates the file or folder does not exist.
   */
  public static isNotExistError(error: NodeJS.ErrnoException): boolean {
    return FileSystemNotExistError.isFileNotExistError(error) || FileSystemNotExistError.isFolderNotExistError(error);
  }

  private static _formatMessageForFile(path: string | undefined): string {
    if (path) {
      return `File not found: ${path}`;
    } else {
      return 'File not found';
    }
  }

  private static _formatMessageForFolder(path: string | undefined): string {
    if (path) {
      return `Folder not found: ${path}`;
    } else {
      return 'Folder not found';
    }
  }

  /** @override */
  public toString(): string {
    return this.message; // Avoid adding the "Error:" prefix
  }
}
