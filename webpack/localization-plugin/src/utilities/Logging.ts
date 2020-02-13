// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface ILoggingFunctions {
  logError: (message: string) => void;
  logWarning: (message: string) => void;
  logFileError: (message: string, filePath: string, line?: number, position?: number) => void;
  logFileWarning: (message: string, filePath: string, line?: number, position?: number) => void;
}

/**
 * @internal
 */
export interface ILoggerOptions {
  writeError: (message: string) => void;
  writeWarning: (message: string) => void;
}

export class Logging {
  public static getLoggingFunctions(options: ILoggerOptions): ILoggingFunctions {
    return {
      logError: (message: string) => options.writeError(message),
      logWarning: (message: string) => options.writeWarning(message),
      logFileError: (message: string, filePath: string, line?: number, position?: number) => {
        Logging.logWithLocation(
          options.writeError,
          message,
          filePath,
          line,
          position
        );
      },
      logFileWarning: (message: string, filePath: string, line?: number, position?: number) => {
        Logging.logWithLocation(
          options.writeWarning,
          message,
          filePath,
          line,
          position
        );
      }
    };
  }

  public static logWithLocation(
    loggingFn: (message: string) => void,
    message: string,
    filePath: string,
    line?: number,
    position?: number
  ): void {
    let location: string;
    if (position !== undefined) {
      location = `${filePath}(${line},${position})`;
    } else if (line !== undefined) {
      location = `${filePath}(${line})`;
    } else {
      location = filePath;
    }

    loggingFn(`${location}: ${message}`);
  }

}