// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Provides a custom logging service to API Extractor.
 * @public
 */
export interface ILogger {
  /**
   * Log a message that will only be shown in a "verbose" logging mode.
   */
  logVerbose(message: string): void;

  /**
   * Log a normal message.
   */
  logInfo(message: string): void;

  /**
   * Log a warning message.  Typically it is shown in yellow and will break a production build.
   */
  logWarning(message: string): void;

  /**
   * Log an error message.  Typically it is shown in red and will break the build, even if it
   * is not a production build.
   */
  logError(message: string): void;
}
