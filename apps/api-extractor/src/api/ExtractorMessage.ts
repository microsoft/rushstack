// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as tsdoc from '@microsoft/tsdoc';
import { ExtractorMessageId } from './ExtractorMessageId';

export const enum ExtractorMessageCategory {
  Compiler,
  TSDoc,
  Extractor
}

export interface IExtractorMessageOptions {
  category: ExtractorMessageCategory;
  messageId: tsdoc.TSDocMessageId | ExtractorMessageId | string;
  text: string;
  sourceFilePath?: string;
  sourceFileLine?: number;
  sourceFileColumn?: number;
}

/**
 * Represents an error or warning that occurred during parsing.
 */
export class ExtractorMessage {
  public readonly category: ExtractorMessageCategory;

  public readonly messageId: tsdoc.TSDocMessageId | ExtractorMessageId | string;

  public readonly text: string;

  public readonly sourceFilePath: string | undefined;

  public readonly sourceFileLine: number | undefined;

  public readonly sourceFileColumn: number | undefined;

  public constructor(options: IExtractorMessageOptions) {
    this.category = options.category;
    this.messageId = options.messageId;
    this.text = options.text;
    this.sourceFilePath = options.sourceFilePath;
    this.sourceFileLine = options.sourceFileLine;
    this.sourceFileColumn = options.sourceFileColumn;
  }
}
