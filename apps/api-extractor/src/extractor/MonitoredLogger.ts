// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ILogger } from './ILogger';

/**
 * Used to collect statistics for an ILogger implementation.
 */
export class MonitoredLogger implements ILogger {
  /**
   * Number of calls to logError()
   */
  public errorCount: number;

  /**
   * Number of calls to logWarning()
   */
  public warningCount: number;

  /**
   * Number of calls to any logging method.
   */
  public messageCount: number;

  private _innerLogger: ILogger;

  constructor(logger: ILogger) {
    this._innerLogger = logger;
    this.resetCounters();
  }

  public logVerbose(message: string): void {
    ++this.messageCount;
    this._innerLogger.logVerbose(message);
  }

  public logInfo(message: string): void {
    ++this.messageCount;
    this._innerLogger.logInfo(message);
  }

  public logWarning(message: string): void {
    ++this.messageCount;
    ++this.warningCount;
    this._innerLogger.logWarning(message);
  }

  public logError(message: string): void {
    ++this.messageCount;
    ++this.errorCount;
    this._innerLogger.logError(message);
  }

  public resetCounters(): void {
    this.errorCount = 0;
    this.warningCount = 0;
    this.messageCount = 0;
  }
}
