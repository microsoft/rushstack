// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError, ITerminalProvider } from '@rushstack/node-core-library';
import { RushUserConfiguration } from '../api/RushUserConfiguration';
import { IBuildCacheJson } from '../api/BuildCacheConfiguration';
import { EnvironmentConfiguration, EnvironmentVariableNames } from '../api/EnvironmentConfiguration';
import { ICloudBuildCacheProvider } from '../logic/buildCache/ICloudBuildCacheProvider';
import { CredentialCache } from '../logic/CredentialCache';
import { RushConstants } from '../logic/RushConstants';
import { WebClient } from '../utilities/WebClient';
import { ILogger, ILoggerOptions, Logger } from './logging/Logger';
import { IRushLifecycle, RushLifecycleHooks } from './RushLifeCycle';

/**
 * @beta
 */
export interface IRushSessionOptions {
  terminalProvider: ITerminalProvider;
  getIsDebugMode: () => boolean;
}

export type ICloudBuildCacheProviderFactory = (buildCacheJson: IBuildCacheJson) => ICloudBuildCacheProvider;

/**
 * @beta
 */
export class RushSession implements IRushLifecycle {
  private readonly _options: IRushSessionOptions;
  private readonly _cloudBuildCacheProviderFactories: Map<string, ICloudBuildCacheProviderFactory> =
    new Map();

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

  // eslint-disable-next-line @typescript-eslint/naming-convention
  public get EnvironmentVariableNames(): typeof EnvironmentVariableNames {
    return EnvironmentVariableNames;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  public get EnvironmentConfiguration(): typeof EnvironmentConfiguration {
    return EnvironmentConfiguration;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  public get RushConstants(): typeof RushConstants {
    return RushConstants;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  public get CredentialCache(): typeof CredentialCache {
    return CredentialCache;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  public get RushUserConfiguration(): typeof RushUserConfiguration {
    return RushUserConfiguration;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  public get WebClient(): typeof WebClient {
    return WebClient;
  }
}
