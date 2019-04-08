// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Unique identifiers for console messages reported by API Extractor.
 *
 * @remarks
 *
 * These strings are possible values for the {@link ExtractorMessage.messageId} property
 * when the `ExtractorMessage.category` is {@link ExtractorMessageCategory.Console}.
 *
 * @public
 */
export const enum ConsoleMessageId {
  /**
   * "'Found metadata in ___"
   */
  FoundTSDocMetadata = 'console-found-tsdoc-metadata',

  /**
   * "Writing: ___"
   */
  WritingDocModelFile = 'console-writing-doc-model-file',

  /**
   * "Writing package typings: ___"
   */
  WritingDtsRollup = 'console-writing-dts-rollup',

  /**
   * "You have changed the public API signature for this project.  Please overwrite ___ with a
   * copy of ___ and then request an API review. See the Git repository README.md for more info."
   */
  ApiReportNotCopied = 'console-api-report-not-copied',

  /**
   * "You have changed the public API signature for this project.  Updating ___"
   */
  ApiReportCopied = 'console-api-report-copied',

  /**
   * "The API signature is up to date: ___"
   */
  ApiReportUnchanged = 'console-api-report-unchanged',

  /**
   * "The API report file has not been set up. Do this by copying ___ to ___ and committing it."
   */
  ApiReportMissing = 'console-api-report-missing'
}
