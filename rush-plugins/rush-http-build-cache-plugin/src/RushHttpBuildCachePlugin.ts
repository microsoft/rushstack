// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushPlugin, RushSession, RushConfiguration } from '@rushstack/rush-sdk';

import type { IHttpBuildCacheProviderOptions, UploadMethod } from './HttpBuildCacheProvider';

const PLUGIN_NAME: string = 'HttpBuildCachePlugin';

/**
 * @public
 */
export interface IRushHttpBuildCachePluginConfig {
  /**
   * The URL of the server that stores the caches (e.g. "https://build-caches.example.com").
   */
  url: string;

  /**
   * The HTTP method to use when writing to the cache (defaults to PUT).
   */
  uploadMethod?: UploadMethod;

  /**
   * An optional set of HTTP headers to pass to the cache server.
   */
  headers?: Record<string, string>;

  /**
   * An optional command that prints the endpoint's credentials to stdout. Provide the
   * command or script to execute and, optionally, any arguments to pass to the script.
   */
  tokenHandler?: {
    exec: string;
    args?: string[];
  };

  /**
   * Prefix for cache keys.
   */
  cacheKeyPrefix?: string;

  /**
   * If set to true, allow writing to the cache. Defaults to false.
   */
  isCacheWriteAllowed?: boolean;
}

/**
 * @public
 */
export class RushHttpBuildCachePlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(rushSession: RushSession, rushConfig: RushConfiguration): void {
    rushSession.hooks.initialize.tap(this.pluginName, () => {
      rushSession.registerCloudBuildCacheProviderFactory('http', async (buildCacheConfig) => {
        const config: IRushHttpBuildCachePluginConfig = (
          buildCacheConfig as typeof buildCacheConfig & {
            httpConfiguration: IRushHttpBuildCachePluginConfig;
          }
        ).httpConfiguration;

        const { url, uploadMethod, headers, tokenHandler, cacheKeyPrefix, isCacheWriteAllowed } = config;

        const options: IHttpBuildCacheProviderOptions = {
          pluginName: this.pluginName,
          rushJsonFolder: rushConfig.rushJsonFolder,
          url: url,
          uploadMethod: uploadMethod,
          headers: headers,
          tokenHandler: tokenHandler,
          cacheKeyPrefix: cacheKeyPrefix,
          isCacheWriteAllowed: !!isCacheWriteAllowed
        };

        const { HttpBuildCacheProvider } = await import('./HttpBuildCacheProvider');
        return new HttpBuildCacheProvider(options, rushSession);
      });
    });
  }
}
