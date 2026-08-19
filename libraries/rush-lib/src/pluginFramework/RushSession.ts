// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';
import type { ITerminalProvider } from '@rushstack/terminal';

import { type ILogger, type ILoggerOptions, Logger } from './logging/Logger';
import { RushLifecycleHooks } from './RushLifeCycle';
import type { IBuildCacheJson } from '../api/BuildCacheConfiguration';
import type { ICloudBuildCacheProvider } from '../logic/buildCache/ICloudBuildCacheProvider';
import type { ICobuildJson } from '../api/CobuildConfiguration';
import type { ICobuildLockProvider } from '../logic/cobuild/ICobuildLockProvider';

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
  readonly #options: IRushSessionOptions;
  readonly #cloudBuildCacheProviderFactories: Map<string, CloudBuildCacheProviderFactory> = new Map();
  readonly #cobuildLockProviderFactories: Map<string, CobuildLockProviderFactory> = new Map();

  public readonly hooks: RushLifecycleHooks;

  public constructor(options: IRushSessionOptions) {
    this.#options = options;

    this.hooks = new RushLifecycleHooks();
  }

  public getLogger(name: string): ILogger {
    if (!name) {
      throw new InternalError('RushSession.getLogger(name) called without a name');
    }

    const terminalProvider: ITerminalProvider = this.#options.terminalProvider;
    const loggerOptions: ILoggerOptions = {
      loggerName: name,
      getShouldPrintStacks: () => this.#options.getIsDebugMode(),
      terminalProvider
    };
    return new Logger(loggerOptions);
  }

  public get terminalProvider(): ITerminalProvider {
    return this.#options.terminalProvider;
  }

  public registerCloudBuildCacheProviderFactory(
    cacheProviderName: string,
    factory: CloudBuildCacheProviderFactory
  ): void {
    if (this.#cloudBuildCacheProviderFactories.has(cacheProviderName)) {
      throw new Error(`A build cache provider factory for ${cacheProviderName} has already been registered`);
    }

    this.#cloudBuildCacheProviderFactories.set(cacheProviderName, factory);
  }

  public getCloudBuildCacheProviderFactory(
    cacheProviderName: string
  ): CloudBuildCacheProviderFactory | undefined {
    return this.#cloudBuildCacheProviderFactories.get(cacheProviderName);
  }

  public registerCobuildLockProviderFactory(
    cobuildLockProviderName: string,
    factory: CobuildLockProviderFactory
  ): void {
    if (this.#cobuildLockProviderFactories.has(cobuildLockProviderName)) {
      throw new Error(
        `A cobuild lock provider factory for ${cobuildLockProviderName} has already been registered`
      );
    }
    this.#cobuildLockProviderFactories.set(cobuildLockProviderName, factory);
  }

  public getCobuildLockProviderFactory(
    cobuildLockProviderName: string
  ): CobuildLockProviderFactory | undefined {
    return this.#cobuildLockProviderFactories.get(cobuildLockProviderName);
  }
}
