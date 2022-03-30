// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError, ITerminalProvider } from '@rushstack/node-core-library';
import { ICloudBuildCacheProviderFactory, IContributeAPIForBuildCacheProvider } from './ContributionPoint';
import { ILogger, ILoggerOptions, Logger } from './logging/Logger';
import { RushLifecycleHooks } from './RushLifeCycle';

/**
 * @beta
 */
export interface IRushSessionOptions {
  terminalProvider: ITerminalProvider;
  getIsDebugMode: () => boolean;
}

/**
 * @beta
 */
export class RushSession {
  private readonly _options: IRushSessionOptions;
  protected readonly _cloudBuildCacheProviderFactories: Map<string, ICloudBuildCacheProviderFactory>;

  public readonly hooks: RushLifecycleHooks;

  public constructor(options: IRushSessionOptions) {
    this._options = options;
    this._cloudBuildCacheProviderFactories = new Map<string, ICloudBuildCacheProviderFactory>();

    this.hooks = new RushLifecycleHooks();
  }

  public get options(): IRushSessionOptions {
    return this._options;
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
    return new Logger(loggerOptions);
  }

  public get terminalProvider(): ITerminalProvider {
    return this._options.terminalProvider;
  }

  public getContributeAPIForBuildCacheProvider(): IContributeAPIForBuildCacheProvider {
    return {
      registerCloudBuildCacheProviderFactory: (
        cacheProviderName: string,
        factory: ICloudBuildCacheProviderFactory
      ): void => {
        if (this._cloudBuildCacheProviderFactories.has(cacheProviderName)) {
          throw new Error(
            `A build cache provider factory for ${cacheProviderName} has already been registered`
          );
        }
        this._cloudBuildCacheProviderFactories.set(cacheProviderName, factory);
      }
    };
  }

  /**
   * @deprecated
   *
   * Use `rushSession.getContributeAPIForBuildCacheProvider().registerCloudBuildCacheProviderFactory`
   */
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
