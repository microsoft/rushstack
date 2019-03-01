// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as tsdoc from '@microsoft/tsdoc';
import * as path from 'path';
import { ExtractorMessageId } from './ExtractorMessageId';
import { Path, Text } from '@microsoft/node-core-library';

/**
 * Specifies a category of messages for use with {@link ExtractorMessage}.
 * @public
 */
export const enum ExtractorMessageCategory {
  /**
   * Messages originating from the TypeScript compiler.
   *
   * @remarks
   * These strings begin with the prefix "TS" and have a numeric error code.
   * Example: `TS2551`
   */
  Compiler = 'Compiler',

  /**
   * Messages related to parsing of TSDoc comments.
   *
   * @remarks
   * These strings begin with the prefix "tsdoc-".
   * Example: `tsdoc-link-tag-unescaped-text`
   */
  TSDoc = 'TSDoc',

  /**
   * Messages related to API Extractor's analysis.
   *
   * @remarks
   * These strings begin with the prefix "ae-".
   * Example: `ae-extra-release-tag`
   */
  Extractor =  'Extractor'
}

/**
 * Constructor options for `ExtractorMessage`.
 */
export interface IExtractorMessageOptions {
  category: ExtractorMessageCategory;
  messageId: tsdoc.TSDocMessageId | ExtractorMessageId | string;
  text: string;
  sourceFilePath?: string;
  sourceFileLine?: number;
  sourceFileColumn?: number;
}

/**
 * This object is used to report an error or warning that occurred during API Extractor's analysis.
 *
 * @public
 */
export class ExtractorMessage {
  /**
   * The category of issue.
   */
  public readonly category: ExtractorMessageCategory;

  /**
   * A text string that uniquely identifies the issue type.  This identifier can be used to suppress
   * or configure the reporting of issues, and also to search for help about an issue.
   */
  public readonly messageId: tsdoc.TSDocMessageId | ExtractorMessageId | string;

  /**
   * The text description of this issue.
   */
  public readonly text: string;

  /**
   * The absolute path to the affected input source file, if there is one.
   */
  public readonly sourceFilePath: string | undefined;

  /**
   * The line number where the issue occurred in the input source file.  This is not used if `sourceFilePath`
   * is undefined.  The first line number is 1.
   */
  public readonly sourceFileLine: number | undefined;

  /**
   * The column number where the issue occurred in the input source file.  This is not used if `sourceFilePath`
   * is undefined.  The first column number is 1.
   */
  public readonly sourceFileColumn: number | undefined;

  /** @internal */
  public constructor(options: IExtractorMessageOptions) {
    this.category = options.category;
    this.messageId = options.messageId;
    this.text = options.text;
    this.sourceFilePath = options.sourceFilePath;
    this.sourceFileLine = options.sourceFileLine;
    this.sourceFileColumn = options.sourceFileColumn;
  }

  /**
   * Returns the message formatted with its identifier and file position.
   * @remarks
   * Example:
   * ```
   * src/folder/File.ts:123:4 - (ae-extra-release-tag) The doc comment should not contain more than one release tag.
   * ```
   */
  public formatMessageAndLocation(workingPackageFolderPath: string): string {
    let result: string = '';

    if (this.sourceFilePath) {
      // Make the path relative to the workingPackageFolderPath
      let scrubbedPath: string = this.sourceFilePath;

      // If it's under the working folder, make it a relative path
      if (Path.isUnderOrEqual(this.sourceFilePath, workingPackageFolderPath)) {
        scrubbedPath = path.relative(workingPackageFolderPath, this.sourceFilePath);
      }

      // Convert it to a Unix-style path
      scrubbedPath = Text.replaceAll(scrubbedPath, '\\', '/');
      result += scrubbedPath;

      if (this.sourceFileLine) {
        result += `:${this.sourceFileLine}`;

        if (this.sourceFileColumn) {
          result += `:${this.sourceFileColumn}`;
        }
      }

      if (result.length > 0) {
        result += ' - ';
      }
    }

    result += this.formatMessageWithoutLocation();

    return result;
  }

  public formatMessageWithoutLocation(): string {
    return `(${this.messageId}) ${this.text}`;
  }
}
