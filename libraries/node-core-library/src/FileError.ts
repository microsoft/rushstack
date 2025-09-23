// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type FileLocationStyle, Path } from './Path';
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

const baseFolderEnvVar: string = 'RUSHSTACK_FILE_ERROR_BASE_FOLDER';

/**
 * Problem matcher pattern for parsing error messages.
 *
 * @public
 */
export interface IProblemMatcherPattern {
  /** The regular expression used to match the log message. */
  regexp: string;
  /** Match index for the severity level. */
  severity: number;
  /** Match index for the file path. */
  file: number;
  /** Match index for the line number. */
  line: number;
  /** Match index for the column number. */
  column: number;
  /** Match index for the problem code. */
  code: number;
  /** Match index for the problem message. */
  message: number;
}

const unixProblemMatcherPattern: IProblemMatcherPattern = {
  regexp: '^\\[[^\\]]+\\]\\s+(Error|Warning):\\s+([^:]+):(\\d+):(\\d+)\\s+-\\s+(?:\\(([^)]+)\\)\\s+)?(.*)$',
  severity: 1,
  file: 2,
  line: 3,
  column: 4,
  code: 5,
  message: 6
};

const vsProblemMatcherPattern: IProblemMatcherPattern = {
  regexp:
    '^\\[[^\\]]+\\]\\s+(Error|Warning):\\s+([^\\(]+)\\((\\d+),(\\d+)\\)\\s+-\\s+(?:\\(([^)]+)\\)\\s+)?(.*)$',
  severity: 1,
  file: 2,
  line: 3,
  column: 4,
  code: 5,
  message: 6
};

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
  /** @internal */
  public static _sanitizedEnvironmentVariable: string | undefined;
  /** @internal */
  public static _environmentVariableIsAbsolutePath: boolean = false;

  private static _environmentVariableBasePathFnMap: ReadonlyMap<
    string | undefined,
    (fileError: FileError) => string | undefined
  > = new Map([
    [undefined, (fileError: FileError) => fileError.projectFolder],
    ['{PROJECT_FOLDER}', (fileError: FileError) => fileError.projectFolder],
    ['{ABSOLUTE_PATH}', (fileError: FileError) => undefined as string | undefined]
  ]);

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

  /**
   * Get the problem matcher pattern for parsing error messages.
   *
   * @param options - Options for the error message format.
   * @returns The problem matcher pattern.
   */
  public static getProblemMatcher(
    options?: Pick<IFileErrorFormattingOptions, 'format'>
  ): IProblemMatcherPattern {
    const format: FileLocationStyle = options?.format || 'Unix';
    switch (format) {
      case 'Unix':
        return unixProblemMatcherPattern;
      case 'VisualStudio':
        return vsProblemMatcherPattern;
      default:
        throw new Error(`The FileError format "${format}" is not supported for problem matchers.`);
    }
  }

  private _evaluateBaseFolder(): string | undefined {
    // Cache the sanitized environment variable. This means that we don't support changing
    // the environment variable mid-execution. This is a reasonable tradeoff for the benefit
    // of being able to cache absolute paths, since that is only able to be determined after
    // running the regex, which is expensive. Since this would be a common execution path for
    // tools like Rush, we should optimize for that.
    if (!FileError._sanitizedEnvironmentVariable && process.env[baseFolderEnvVar]) {
      // Strip leading and trailing quotes, if present.
      FileError._sanitizedEnvironmentVariable = process.env[baseFolderEnvVar]!.replace(/^("|')|("|')$/g, '');
    }

    if (FileError._environmentVariableIsAbsolutePath) {
      return FileError._sanitizedEnvironmentVariable;
    }

    // undefined environment variable has a mapping to the project folder
    const baseFolderFn: ((fileError: FileError) => string | undefined) | undefined =
      FileError._environmentVariableBasePathFnMap.get(FileError._sanitizedEnvironmentVariable);
    if (baseFolderFn) {
      return baseFolderFn(this);
    }

    const baseFolderTokenRegex: RegExp = /{([^}]+)}/g;
    const result: RegExpExecArray | null = baseFolderTokenRegex.exec(
      FileError._sanitizedEnvironmentVariable!
    );
    if (!result) {
      // No tokens, assume absolute path
      FileError._environmentVariableIsAbsolutePath = true;
      return FileError._sanitizedEnvironmentVariable;
    } else if (result.index !== 0) {
      // Currently only support the token being first in the string.
      throw new Error(
        `The ${baseFolderEnvVar} environment variable contains text before the token "${result[0]}".`
      );
    } else if (result[0].length !== FileError._sanitizedEnvironmentVariable!.length) {
      // Currently only support the token being the entire string.
      throw new Error(
        `The ${baseFolderEnvVar} environment variable contains text after the token "${result[0]}".`
      );
    } else {
      throw new Error(
        `The ${baseFolderEnvVar} environment variable contains a token "${result[0]}", which is not ` +
          'supported.'
      );
    }
  }

  public static [Symbol.hasInstance](instance: object): boolean {
    return TypeUuid.isInstanceOf(instance, uuidFileError);
  }
}

TypeUuid.registerClass(FileError, uuidFileError);
