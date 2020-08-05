// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IHeftPlugin } from '../IHeftPlugin';
import { NamedLogger } from './NamedLogger';
import { ITerminalProvider } from '@rushstack/node-core-library';

export interface ILoggingManagerOptions {
  terminalProvider: ITerminalProvider;
}

export class LoggingManager {
  private _options: ILoggingManagerOptions;
  private _namedLoggers: Map<string, NamedLogger> = new Map<string, NamedLogger>();
  private _verboseEnabled: boolean;

  public constructor(options: ILoggingManagerOptions) {
    this._options = options;
  }

  public enableVerboseLogging(): void {
    this._verboseEnabled = true;
  }

  public requestNamedLogger(plugin: IHeftPlugin, loggerName: string): NamedLogger {
    const existingNamedLogger: NamedLogger | undefined = this._namedLoggers.get(loggerName);
    if (existingNamedLogger) {
      throw new Error(
        `A named logger with name "${loggerName}" has already been requested ` +
          `by plugin "${existingNamedLogger._requestingPlugin.displayName}".`
      );
    } else {
      const namedLogger: NamedLogger = new NamedLogger({
        requestingPlugin: plugin,
        loggerName,
        terminalProvider: this._options.terminalProvider,
        getVerboseEnabled: () => this._verboseEnabled
      });
      this._namedLoggers.set(loggerName, namedLogger);
      return namedLogger;
    }
  }

  public getErrorStrings(): string[] {
    const result: string[] = [];

    for (const [, namedLogger] of this._namedLoggers) {
      result.push(...namedLogger.errors.map((error) => `[${namedLogger.loggerName}] ${error.message}`));
    }

    return result;
  }

  public getWarningStrings(): string[] {
    const result: string[] = [];

    for (const [, namedLogger] of this._namedLoggers) {
      result.push(...namedLogger.warnings.map((warning) => `[${namedLogger.loggerName}] ${warning.message}`));
    }

    return result;
  }
}
