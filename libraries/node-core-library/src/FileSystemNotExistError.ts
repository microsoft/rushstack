// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from "./FileSystem";

/**
 * An `Error` subclass that should be thrown to report that a file or folder does not exist.
 *
 * @public
 */
export class FileSystemNotExistError extends Error {
  /**
   * The inner error, thrown by NodeJS
   */
  public readonly innerError: NodeJS.ErrnoException;

  /**
   * Constructs a new instance of the {@link FileSystemNotExistError} class.
   *
   * @param innerError - The error thrown by NodeJS's fs API
   */
  public constructor(innerError: NodeJS.ErrnoException) {
    super(
      FileSystem.isFileNotExistError(innerError)
        ? FileSystemNotExistError._formatMessageForFile(innerError.path)
        : FileSystemNotExistError._formatMessageForFolder(innerError.path)
    );

    this.innerError = innerError;

    // Manually set the prototype, as we can no longer extend built-in classes like Error, Array, Map, etc.
    // https://github.com/microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    //
    // Note: the prototype must also be set on any classes which extend this one
    (this as any).__proto__ = FileSystemNotExistError.prototype; // eslint-disable-line @typescript-eslint/no-explicit-any
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
}
