// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Import, JsonSchema } from '@rushstack/node-core-library';
import type { IRushPlugin, RushSession, RushConfiguration } from '@microsoft/rush-lib';
import type { AzureEnvironmentNames } from './AzureStorageBuildCacheProvider';

const AzureStorageBuildCacheProviderModule: typeof import('./AzureStorageBuildCacheProvider') = Import.lazy(
  '../logic/buildCache/AzureStorageBuildCacheProvider',
  require
);

const PLUGIN_NAME: string = 'AzureStorageBuildCachePlugin';

/**
 * @public
 */
interface IAzureStorageConfigurationJson {
  /**
   * The name of the the Azure storage account to use for build cache.
   */
  storageAccountName: string;

  /**
   * The name of the container in the Azure storage account to use for build cache.
   */
  storageContainerName: string;

  /**
   * The Azure environment the storage account exists in. Defaults to AzureCloud.
   */
  azureEnvironment?: AzureEnvironmentNames;

  /**
   * An optional prefix for cache item blob names.
   */
  blobPrefix?: string;

  /**
   * If set to true, allow writing to the cache. Defaults to false.
   */
  isCacheWriteAllowed?: boolean;
}

/**
 * @public
 */
export class RushAzureStorageBuildCachePlugin implements IRushPlugin {
  public pluginName: string = PLUGIN_NAME;

  private static _getBuildCacheConfigJsonSchema(): JsonSchema {
    return JsonSchema.fromFile(path.join(__dirname, 'schemas', 'azure-blob-storage-config.schema.json'));
  }

  public apply(rushSession: RushSession, rushConfig: RushConfiguration): void {
    rushSession.hooks.initialize.tap(PLUGIN_NAME, () => {
      rushSession.cloudCacheProviderFactories.set(
        'azure-blob-storage',
        (buildCacheConfig, buildCacheConfigFilePath) => {
          RushAzureStorageBuildCachePlugin._getBuildCacheConfigJsonSchema().validateObject(
            buildCacheConfig,
            buildCacheConfigFilePath
          );
          type IBuildCache = typeof buildCacheConfig & {
            azureStorageConfiguration: IAzureStorageConfigurationJson;
          };
          const { azureStorageConfiguration } = buildCacheConfig as IBuildCache;
          return new AzureStorageBuildCacheProviderModule.AzureStorageBuildCacheProvider({
            storageAccountName: azureStorageConfiguration.storageAccountName,
            storageContainerName: azureStorageConfiguration.storageContainerName,
            azureEnvironment: azureStorageConfiguration.azureEnvironment,
            blobPrefix: azureStorageConfiguration.blobPrefix,
            isCacheWriteAllowed: !!azureStorageConfiguration.isCacheWriteAllowed
          });
        }
      );
    });
  }
}
