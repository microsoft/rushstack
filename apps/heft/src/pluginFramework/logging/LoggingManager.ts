// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  FileError,
  type FileLocationStyle,
  type IFileErrorFormattingOptions
} from '@rushstack/node-core-library';
import type { ITerminalProvider } from '@rushstack/terminal';

import { ScopedLogger } from './ScopedLogger';
export interface ILoggingManagerOptions {
  terminalProvider: ITerminalProvider;
}

export class LoggingManager {
  private _options: ILoggingManagerOptions;
  private _scopedLoggers: Map<string, ScopedLogger> = new Map<string, ScopedLogger>();
  private _shouldPrintStacks: boolean = false;
  private _hasAnyWarnings: boolean = false;
  private _hasAnyErrors: boolean = false;

  public get errorsHaveBeenEmitted(): boolean {
    return this._hasAnyErrors;
  }

  public get warningsHaveBeenEmitted(): boolean {
    return this._hasAnyWarnings;
  }

  public constructor(options: ILoggingManagerOptions) {
    this._options = options;
  }

  public enablePrintStacks(): void {
    this._shouldPrintStacks = true;
  }

  public resetScopedLoggerErrorsAndWarnings(): void {
    this._hasAnyErrors = false;
    this._hasAnyWarnings = false;
    for (const scopedLogger of this._scopedLoggers.values()) {
      scopedLogger.resetErrorsAndWarnings();
    }
  }

  public requestScopedLogger(loggerName: string): ScopedLogger {
    const existingScopedLogger: ScopedLogger | undefined = this._scopedLoggers.get(loggerName);
    if (existingScopedLogger) {
      throw new Error(`A named logger with name ${JSON.stringify(loggerName)} has already been requested.`);
    } else {
      const scopedLogger: ScopedLogger = new ScopedLogger({
        loggerName,
        terminalProvider: this._options.terminalProvider,
        getShouldPrintStacks: () => this._shouldPrintStacks,
        errorHasBeenEmittedCallback: () => (this._hasAnyErrors = true),
        warningHasBeenEmittedCallback: () => (this._hasAnyWarnings = true)
      });
      this._scopedLoggers.set(loggerName, scopedLogger);
      return scopedLogger;
    }
  }

  public getErrorStrings(fileLocationStyle?: FileLocationStyle): string[] {
    const result: string[] = [];

    for (const scopedLogger of this._scopedLoggers.values()) {
      result.push(
        ...scopedLogger.errors.map(
          (error) =>
            `[${scopedLogger.loggerName}] ` +
            LoggingManager.getErrorMessage(error, { format: fileLocationStyle })
        )
      );
    }

    return result;
  }

  public getWarningStrings(fileErrorFormat?: FileLocationStyle): string[] {
    const result: string[] = [];

    for (const scopedLogger of this._scopedLoggers.values()) {
      result.push(
        ...scopedLogger.warnings.map(
          (warning) =>
            `[${scopedLogger.loggerName}] ` +
            LoggingManager.getErrorMessage(warning, { format: fileErrorFormat })
        )
      );
    }

    return result;
  }

  public static getErrorMessage(error: Error, options?: IFileErrorFormattingOptions): string {
    if (error instanceof FileError) {
      return error.getFormattedErrorMessage(options);
    } else {
      return error.message;
    }
  }
}
