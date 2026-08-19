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
  #options: ILoggingManagerOptions;
  #scopedLoggers: Map<string, ScopedLogger> = new Map<string, ScopedLogger>();
  #shouldPrintStacks: boolean = false;
  #hasAnyWarnings: boolean = false;
  #hasAnyErrors: boolean = false;

  public get errorsHaveBeenEmitted(): boolean {
    return this.#hasAnyErrors;
  }

  public get warningsHaveBeenEmitted(): boolean {
    return this.#hasAnyWarnings;
  }

  public constructor(options: ILoggingManagerOptions) {
    this.#options = options;
  }

  public enablePrintStacks(): void {
    this.#shouldPrintStacks = true;
  }

  public resetScopedLoggerErrorsAndWarnings(): void {
    this.#hasAnyErrors = false;
    this.#hasAnyWarnings = false;
    for (const scopedLogger of this.#scopedLoggers.values()) {
      scopedLogger.resetErrorsAndWarnings();
    }
  }

  public requestScopedLogger(loggerName: string): ScopedLogger {
    const existingScopedLogger: ScopedLogger | undefined = this.#scopedLoggers.get(loggerName);
    if (existingScopedLogger) {
      throw new Error(`A named logger with name ${JSON.stringify(loggerName)} has already been requested.`);
    } else {
      const scopedLogger: ScopedLogger = new ScopedLogger({
        loggerName,
        terminalProvider: this.#options.terminalProvider,
        getShouldPrintStacks: () => this.#shouldPrintStacks,
        errorHasBeenEmittedCallback: () => (this.#hasAnyErrors = true),
        warningHasBeenEmittedCallback: () => (this.#hasAnyWarnings = true)
      });
      this.#scopedLoggers.set(loggerName, scopedLogger);
      return scopedLogger;
    }
  }

  public getErrorStrings(fileLocationStyle?: FileLocationStyle): string[] {
    const result: string[] = [];

    for (const scopedLogger of this.#scopedLoggers.values()) {
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

    for (const scopedLogger of this.#scopedLoggers.values()) {
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
