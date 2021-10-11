import type { CloudBuildCacheProviderBase } from './CloudBuildCacheProviderBase';

export interface ICustomBuildCacheProviderOptions extends Record<string, unknown> {
  modulePath: string;
  isCacheWriteAllowed?: boolean;
}

export interface ICustomBuildCacheProvider {
  new (options: ICustomBuildCacheProviderOptions): CloudBuildCacheProviderBase;
}
