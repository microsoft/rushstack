// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import { FileLocationStyle, Path } from './Path';
import { TypeUuid } from './TypeUuid';

/**
 * Provides options for the creation of a FileError.
 *
 * @public
 */
export interface IFileErrorOptions {
  /**
   * The absolute path to the file that contains the error.
   */
  absolutePath: string;

  /**
   * The root folder for the project that the error is in relation to.
   */
  projectFolder: string;

  /**
   * The line number of the error in the target file. Minimum value is 1.
   */
  line?: number;

  /**
   * The column number of the error in the target file. Minimum value is 1.
   */
  column?: number;
}

/**
 * Provides options for the output message of a file error.
 *
 * @public
 */
export interface IFileErrorFormattingOptions {
  /**
   * The format for the error message. If no format is provided, format 'Unix' is used by default.
   */
  format?: FileLocationStyle;
}

const uuidFileError: string = '37a4c772-2dc8-4c66-89ae-262f8cc1f0c1';

/**
 * An `Error` subclass that should be thrown to report an unexpected state that specifically references
 * a location in a file.
 *
 * @remarks The file path provided to the FileError constructor is expected to exist on disk. FileError
 * should not be used for reporting errors that are not in reference to an existing file.
 *
 * @public
 */
export class FileError extends Error {
  /** {@inheritdoc IFileErrorOptions.absolutePath} */
  public readonly absolutePath: string;
  /** {@inheritdoc IFileErrorOptions.projectFolder} */
  public readonly projectFolder: string;
  /** {@inheritdoc IFileErrorOptions.line} */
  public readonly line: number | undefined;
  /** {@inheritdoc IFileErrorOptions.column} */
  public readonly column: number | undefined;

  /**
   * Constructs a new instance of the {@link FileError} class.
   *
   * @param message - A message describing the error.
   * @param options - Options for the error.
   */
  public constructor(message: string, options: IFileErrorOptions) {
    super(message);

    this.absolutePath = options.absolutePath;
    this.projectFolder = options.projectFolder;
    this.line = options.line;
    this.column = options.column;

    // Manually set the prototype, as we can no longer extend built-in classes like Error, Array, Map, etc.
    // https://github.com/microsoft/TypeScript-wiki/blob/main/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    //
    // Note: the prototype must also be set on any classes which extend this one
    (this as any).__proto__ = FileError.prototype; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  /**
   * Get the Unix-formatted the error message.
   *
   * @override
   */
  public toString(): string {
    // Default to formatting in 'Unix' format, for consistency.
    return this.getFormattedErrorMessage();
  }

  /**
   * Get the formatted error message.
   *
   * @param options - Options for the error message format.
   */
  public getFormattedErrorMessage(options?: IFileErrorFormattingOptions): string {
    return Path.formatFileLocation({
      format: options?.format || 'Unix',
      baseFolder: this._evaluateBaseFolder(),
      pathToFormat: this.absolutePath,
      message: this.message,
      line: this.line,
      column: this.column
    });
  }

  private _evaluateBaseFolder(): string | undefined {
    // If the environment variable isn't defined, we will return the project folder by default
    if (!process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER) {
      return this.projectFolder;
    }

    // Strip leading and trailing quotes, if present.
    const rawBaseFolderEnvVariable: string = process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER.replace(
      /^("|')|("|')$/g,
      ''
    );

    const baseFolderTokenRegex: RegExp = /{([^}]+)}/g;
    const result: RegExpExecArray | null = baseFolderTokenRegex.exec(rawBaseFolderEnvVariable);
    if (!result) {
      // No tokens, it's some absolute path. Return the value as-is.
      return rawBaseFolderEnvVariable;
    } else if (result.index !== 0) {
      // Currently only support the token being first in the string.
      throw new Error(
        'The RUSHSTACK_FILE_ERROR_BASE_FOLDER environment variable contains text before ' +
          `the token "${result[0]}".`
      );
    } else if (result[0].length !== rawBaseFolderEnvVariable.length) {
      // Currently only support the token being the entire string.
      throw new Error(
        'The RUSHSTACK_FILE_ERROR_BASE_FOLDER environment variable contains text after ' +
          `the token "${result[0]}".`
      );
    }

    const token: string = result[1];
    switch (token) {
      case 'ABSOLUTE_PATH': {
        return undefined;
      }
      case 'PROJECT_FOLDER': {
        return this.projectFolder;
      }
      default: {
        throw new Error(
          `The RUSHSTACK_FILE_ERROR_BASE_FOLDER environment variable contains a token "${result[0]}", ` +
            'which is not supported.'
        );
      }
    }
  }

  public static [Symbol.hasInstance](instance: object): boolean {
    return TypeUuid.isInstanceOf(instance, uuidFileError);
  }
}

TypeUuid.registerClass(FileError, uuidFileError);
