// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';
import type { ITerminalProvider } from '@rushstack/terminal';

import { type ILogger, type ILoggerOptions, Logger } from './logging/Logger.ts';
import { RushLifecycleHooks } from './RushLifeCycle.ts';
import type { IBuildCacheJson } from '../api/BuildCacheConfiguration.ts';
import type { ICloudBuildCacheProvider } from '../logic/buildCache/ICloudBuildCacheProvider.ts';
import type { ICobuildJson } from '../api/CobuildConfiguration.ts';
import type { ICobuildLockProvider } from '../logic/cobuild/ICobuildLockProvider.ts';

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
export type CloudBuildCacheProviderFactory = (
  buildCacheJson: IBuildCacheJson
) => ICloudBuildCacheProvider | Promise<ICloudBuildCacheProvider>;

/**
 * @beta
 */
export type CobuildLockProviderFactory = (
  cobuildJson: ICobuildJson
) => ICobuildLockProvider | Promise<ICobuildLockProvider>;

/**
 * @beta
 */
export class RushSession {
  private readonly _options: IRushSessionOptions;
  private readonly _cloudBuildCacheProviderFactories: Map<string, CloudBuildCacheProviderFactory> = new Map();
  private readonly _cobuildLockProviderFactories: Map<string, CobuildLockProviderFactory> = new Map();

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
    return new Logger(loggerOptions);
  }

  public get terminalProvider(): ITerminalProvider {
    return this._options.terminalProvider;
  }

  public registerCloudBuildCacheProviderFactory(
    cacheProviderName: string,
    factory: CloudBuildCacheProviderFactory
  ): void {
    if (this._cloudBuildCacheProviderFactories.has(cacheProviderName)) {
      throw new Error(`A build cache provider factory for ${cacheProviderName} has already been registered`);
    }

    this._cloudBuildCacheProviderFactories.set(cacheProviderName, factory);
  }

  public getCloudBuildCacheProviderFactory(
    cacheProviderName: string
  ): CloudBuildCacheProviderFactory | undefined {
    return this._cloudBuildCacheProviderFactories.get(cacheProviderName);
  }

  public registerCobuildLockProviderFactory(
    cobuildLockProviderName: string,
    factory: CobuildLockProviderFactory
  ): void {
    if (this._cobuildLockProviderFactories.has(cobuildLockProviderName)) {
      throw new Error(
        `A cobuild lock provider factory for ${cobuildLockProviderName} has already been registered`
      );
    }
    this._cobuildLockProviderFactories.set(cobuildLockProviderName, factory);
  }

  public getCobuildLockProviderFactory(
    cobuildLockProviderName: string
  ): CobuildLockProviderFactory | undefined {
    return this._cobuildLockProviderFactories.get(cobuildLockProviderName);
  }
}
