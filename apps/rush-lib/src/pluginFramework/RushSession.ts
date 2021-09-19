// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError, ITerminalProvider } from '@rushstack/node-core-library';
import { IBuildCacheJson } from '../api/BuildCacheConfiguration';
import { CloudBuildCacheProviderBase } from '../logic/buildCache/CloudBuildCacheProviderBase';
import { ILogger, ILoggerOptions, Logger } from './logging/Logger';
import { IRushLifecycle, RushLifecycleHooks } from './RushLifeCycle';

/**
 * @public
 */
export interface IRushSessionOptions {
  terminalProvider: ITerminalProvider;
  getIsDebugMode: () => boolean;
}

/**
 * @public
 */
export class RushSession implements IRushLifecycle {
  private readonly _options: IRushSessionOptions;

  public readonly hooks: RushLifecycleHooks;

  public cloudCacheProviderFactories: Map<
    string,
    (buildCacheJson: IBuildCacheJson, buildCacheConfigFilePath: string) => CloudBuildCacheProviderBase
  > = new Map();

  public constructor(options: IRushSessionOptions) {
    this._options = options;

    this.hooks = new RushLifecycleHooks();
  }

  public getLogger(name: string): ILogger {
    if (!name) {
      throw new InternalError('RushSession.getLogger(name) called without a name');
    }

    const terminalProvider: ITerminalProvider = this._options.terminalProvider;
    const loggerOptions: ILoggerOptions = {
      loggerName: name,
      getShouldPrintStacks: () => this._options.getIsDebugMode(),
      terminalProvider
    };
    if (this.hooks.loggerOptions.isUsed()) {
      this.hooks.loggerOptions.call(loggerOptions);
    } else {
      // default prepend the logger name to the log message
      const parentTerminalProvider: ITerminalProvider = terminalProvider;
      const prefixProxyTerminalProvider: ITerminalProvider = {
        write: (data, severity) => {
          parentTerminalProvider.write(`[${name}] ${data}`, severity);
        },
        eolCharacter: parentTerminalProvider.eolCharacter,
        supportsColor: parentTerminalProvider.supportsColor
      };
      loggerOptions.terminalProvider = prefixProxyTerminalProvider;
    }
    const customLogger: ILogger | undefined = this.hooks.logger.call(loggerOptions);
    if (customLogger) {
      return customLogger;
    }
    return new Logger(loggerOptions);
  }

  public get terminalProvider(): ITerminalProvider {
    return this._options.terminalProvider;
  }
}
