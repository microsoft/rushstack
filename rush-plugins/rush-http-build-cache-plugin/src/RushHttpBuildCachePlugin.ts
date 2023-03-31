import { Import } from '@rushstack/node-core-library';
import type { IRushPlugin, RushSession, RushConfiguration } from '@rushstack/rush-sdk';
import type { HttpBuildCacheProvider, IHttpBuildCacheProviderOptions } from './HttpBuildCacheProvider';

const HttpBuildCacheProviderModule: typeof import('./HttpBuildCacheProvider') = Import.lazy(
  './HttpBuildCacheProvider',
  require
);

const PLUGIN_NAME: string = 'HttpBuildCachePlugin';

/**
 * @public
 */
export interface IRushHttpBuildCachePluginOptions {
  /**
   * The URL of the server that stores the caches (e.g. "https://build-caches.example.com").
   */
  url: string;

  /**
   * The HTTP method to use when writing to the cache (defaults to PUT).
   */
  uploadMethod?: string;

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
  private readonly _options: IRushHttpBuildCachePluginOptions;

  public constructor(options: IRushHttpBuildCachePluginOptions) {
    this._options = options;
  }

  public apply(rushSession: RushSession, rushConfig: RushConfiguration): void {
    rushSession.hooks.initialize.tap(this.pluginName, () => {
      rushSession.registerCloudBuildCacheProviderFactory(
        'http',
        (buildCacheConfig): HttpBuildCacheProvider => {
          const { url, uploadMethod, headers, tokenHandler, cacheKeyPrefix, isCacheWriteAllowed } =
            this._options;

          const options: IHttpBuildCacheProviderOptions = {
            pluginName: this.pluginName,
            rushProjectRoot: rushConfig.rushJsonFolder,
            url: url,
            uploadMethod: uploadMethod,
            headers: headers,
            tokenHandler: tokenHandler,
            cacheKeyPrefix: cacheKeyPrefix,
            isCacheWriteAllowed: !!isCacheWriteAllowed
          };

          return new HttpBuildCacheProviderModule.HttpBuildCacheProvider(options, rushSession);
        }
      );
    });
  }
}
