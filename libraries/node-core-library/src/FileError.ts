// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import * as NodeJSPath from 'path';

import { Path } from './Path';
import { TypeUuid } from './TypeUuid';

/**
 * The format that the FileError message should conform to. The supported formats are:
 *  - Unix: \<filePath\>:\<line\>:\<column\> - \<message\>
 *  - VisualStudio: \<filePath\>(\<line\>,\<column\>) - \<message\>
 *  - AzureDevOps: ##vso[task.logissue type=\<error|warning\>;sourcepath=\<filePath\>;linenumber=\<line\>;columnnumber=\<column\>;]\<message\>
 *
 * @public
 */
export type FileErrorFormat = 'Unix' | 'VisualStudio' | 'AzureDevOps';

/**
 * Provides options for the output message of a file error.
 *
 * @public
 */
export interface IFileErrorFormattingOptions {
  /**
   * The format for the error message. If no format is provided, format 'Unix' is used by default.
   *
   * @remarks If no format is specified and the environment variable TF_BUILD is set to 'True'
   * (such as on Azure DevOps pipeline agents), the format 'AzureDevOps' is used by default.
   */
  format?: FileErrorFormat;

  /**
   * Whether or not the error is a warning. Defaults to false.
   */
  isWarning?: boolean;
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
   * The path to the file that contains the error.
   */
  public readonly filePath: string;

  /**
   * The line number of the error in the target file.
   */
  public readonly line: number | undefined;

  /**
   * The column number of the error in the target file.
   */
  public readonly column: number | undefined;

  /**
   * Constructs a new instance of the {@link FileError} class.
   *
   * @param message - A message describing the error.
   * @param filePath - The path to the file that contains the error.
   * @param line - The line number of the error in the target file.
   * @param column - The column number of the error in the target file.
   */
  public constructor(message: string, filePath: string, line?: number, column?: number) {
    super(message);

    this.filePath = Path.convertToSlashes(filePath);

    // Error out if the file path is not an absolute path. Absolute paths provide targeted information
    // about the error, and allow for navigation to the file from IDE consoles and CI systems.
    if (!NodeJSPath.isAbsolute(this.filePath)) {
      throw new Error('The filePath must be an absolute path.');
    }

    this.line = line;
    this.column = column;

    // Manually set the prototype, as we can no longer extend built-in classes like Error, Array, Map, etc.
    // https://github.com/microsoft/TypeScript-wiki/blob/main/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    //
    // Note: the prototype must also be set on any classes which extend this one
    (this as any).__proto__ = FileError.prototype; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  /**
   * Format the error message according to the specified format.
   *
   * @override
   */
  public toString(options?: IFileErrorFormattingOptions): string {
    let format: FileErrorFormat | undefined = options?.format;
    if (!format) {
      // If no format is provided, check to see if we are running in Azure DevOps and adapt our output.
      // Azure DevOps populates the TF_BUILD environment variable when running on an Azure DevOps agent.
      // Otherwise, fallback to Unix format. For more information on TF_BUILD, see:
      // https://docs.microsoft.com/en-us/azure/devops/pipelines/build/variables?view=azure-devops&tabs=yaml#system-variables-devops-services
      format = process.env.TF_BUILD === 'True' ? 'AzureDevOps' : 'Unix';
    }

    let formattedFileLocation: string;
    switch (format) {
      case 'Unix': {
        if (this.line !== undefined && this.column !== undefined) {
          formattedFileLocation = `:${this.line}:${this.column}`;
        } else if (this.line !== undefined) {
          formattedFileLocation = `:${this.line}`;
        } else {
          formattedFileLocation = '';
        }

        break;
      }

      case 'VisualStudio': {
        if (this.line !== undefined && this.column !== undefined) {
          formattedFileLocation = `(${this.line},${this.column})`;
        } else if (this.line !== undefined) {
          formattedFileLocation = `(${this.line})`;
        } else {
          formattedFileLocation = '';
        }

        break;
      }

      case 'AzureDevOps': {
        // Implements the format used by the Azure DevOps pipeline to log errors
        // https://docs.microsoft.com/en-us/azure/devops/pipelines/scripts/logging-commands?view=azure-devops&tabs=bash#logissue-log-an-error-or-warning
        const isWarning: boolean = options?.isWarning || false;
        return (
          '##vso[task.logissue ' +
          `type=${isWarning ? 'warning' : 'error'};` +
          `sourcepath=${this.filePath};` +
          (this.line !== undefined ? `linenumber=${this.line};` : '') +
          (this.line !== undefined && this.column !== undefined ? `columnnumber=${this.column};` : '') +
          `]${this.message}`
        );
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
