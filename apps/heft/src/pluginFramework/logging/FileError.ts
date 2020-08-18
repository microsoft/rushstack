// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import { TypeUuid } from '@rushstack/node-core-library';

export const enum FileErrorFormat {
  Unix,
  VisualStudio
}

const uuidFileError: string = '37a4c772-2dc8-4c66-89ae-262f8cc1f0c1';

/**
 * An `Error` subclass that should be thrown to report an unexpected state that specifically references
 * a location in a file.
 *
 * @public
 */
export class FileError extends Error {
  /**
   * Use this instance property to reliably detect if an instance of a class is an instance of FileError
   */
  public readonly filePath: string;
  public readonly line: number | undefined;
  public readonly column: number | undefined;

  /**
   * Constructs a new instance of the {@link FileError} class.
   *
   * @param message - A message describing the error.
   */
  public constructor(message: string, filePath: string, line?: number, column?: number) {
    super(message);

    this.filePath = filePath.replace(/\\/g, '/');
    this.line = line;
    this.column = column;

    // Manually set the prototype, as we can no longer extend built-in classes like Error, Array, Map, etc.
    // https://github.com/microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    //
    // Note: the prototype must also be set on any classes which extend this one
    (this as any).__proto__ = FileError.prototype; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  /** @override */
  public toString(format: FileErrorFormat = FileErrorFormat.Unix): string {
    let formattedFileLocation: string;
    switch (format) {
      case FileErrorFormat.Unix: {
        if (this.column !== undefined) {
          formattedFileLocation = `:${this.line}:${this.column}`;
        } else if (this.line !== undefined) {
          formattedFileLocation = `:${this.line}`;
        } else {
          formattedFileLocation = '';
        }

        break;
      }

      case FileErrorFormat.VisualStudio: {
        if (this.column !== undefined) {
          formattedFileLocation = `(${this.line},${this.column})`;
        } else if (this.line !== undefined) {
          formattedFileLocation = `(${this.line})`;
        } else {
          formattedFileLocation = '';
        }

        break;
      }

      default: {
        throw new Error(`Unknown format: ${format}`);
      }
    }

    return `${this.filePath}${formattedFileLocation} - ${this.message}`;
  }

  public static [Symbol.hasInstance](instance: object): boolean {
    return TypeUuid.isInstanceOf(instance, uuidFileError);
  }
}

TypeUuid.registerClass(FileError, uuidFileError);
