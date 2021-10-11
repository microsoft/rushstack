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

export type ICloudBuildCacheProviderFactory = (
  buildCacheJson: IBuildCacheJson
) => CloudBuildCacheProviderBase;

/**
 * @public
 */
export class RushSession implements IRushLifecycle {
  private readonly _options: IRushSessionOptions;
  private _cloudBuildCacheProviderFactories: Map<string, ICloudBuildCacheProviderFactory> = new Map();

  public readonly hooks: RushLifecycleHooks;

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

  public registerCloudBuildCacheProviderFactory(
    cacheProviderName: string,
    factory: ICloudBuildCacheProviderFactory
  ): void {
    if (this._cloudBuildCacheProviderFactories.has(cacheProviderName)) {
      throw new Error(`A build cache provider factory for ${cacheProviderName} has already been registered`);
    }
    this._cloudBuildCacheProviderFactories.set(cacheProviderName, factory);
  }

  public getCloudBuildCacheProviderFactory(
    cacheProviderName: string
  ): ICloudBuildCacheProviderFactory | undefined {
    return this._cloudBuildCacheProviderFactories.get(cacheProviderName);
  }
}
