// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  JsonFile,
  JsonSchema,
  FileSystem,
  AlreadyReportedError,
  Terminal
} from '@rushstack/node-core-library';

import {
  AzureEnvironmentNames,
  AzureStorageBuildCacheProvider
} from '../logic/buildCache/AzureStorageBuildCacheProvider';
import { RushConfiguration } from './RushConfiguration';
import { FileSystemBuildCacheProvider } from '../logic/buildCache/FileSystemBuildCacheProvider';
import { RushConstants } from '../logic/RushConstants';
import { CloudBuildCacheProviderBase } from '../logic/buildCache/CloudBuildCacheProviderBase';
import { RushUserConfiguration } from './RushUserConfiguration';
import { CacheEntryId, GetCacheEntryIdFunction } from '../logic/buildCache/CacheEntryId';

/**
 * Describes the file structure for the "common/config/rush/build-cache.json" config file.
 */
interface IBuildCacheJson {
  cacheProvider: 'azure-blob-storage' | 'local-only';
  cacheEntryNamePattern?: string;
}

interface IAzureBlobStorageBuildCacheJson extends IBuildCacheJson {
  cacheProvider: 'azure-blob-storage';

  azureBlobStorageConfiguration: IAzureStorageConfigurationJson;
}

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

interface IBuildCacheConfigurationOptions {
  buildCacheJson: IBuildCacheJson;
  getCacheEntryId: GetCacheEntryIdFunction;
  rushConfiguration: RushConfiguration;
  rushUserConfiguration: RushUserConfiguration;
}

/**
 * Use this class to load and save the "common/config/rush/build-cache.json" config file.
 * This file provides configuration options for cached project build output.
 * @public
 */
export class BuildCacheConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, '..', 'schemas', 'build-cache.schema.json')
  );

  public readonly getCacheEntryId: GetCacheEntryIdFunction;
  public readonly localCacheProvider: FileSystemBuildCacheProvider;
  public readonly cloudCacheProvider: CloudBuildCacheProviderBase | undefined;

  private constructor(options: IBuildCacheConfigurationOptions) {
    this.getCacheEntryId = options.getCacheEntryId;
    this.localCacheProvider = new FileSystemBuildCacheProvider({
      rushUserConfiguration: options.rushUserConfiguration,
      rushConfiguration: options.rushConfiguration
    });

    const { buildCacheJson } = options;
    switch (buildCacheJson.cacheProvider) {
      case 'local-only': {
        // Don't configure a cloud cache provider
        break;
      }

      case 'azure-blob-storage': {
        const azureStorageBuildCacheJson: IAzureBlobStorageBuildCacheJson = buildCacheJson as IAzureBlobStorageBuildCacheJson;
        const azureStorageConfigurationJson: IAzureStorageConfigurationJson =
          azureStorageBuildCacheJson.azureBlobStorageConfiguration;
        this.cloudCacheProvider = new AzureStorageBuildCacheProvider({
          storageAccountName: azureStorageConfigurationJson.storageAccountName,
          storageContainerName: azureStorageConfigurationJson.storageContainerName,
          azureEnvironment: azureStorageConfigurationJson.azureEnvironment,
          blobPrefix: azureStorageConfigurationJson.blobPrefix,
          isCacheWriteAllowed: !!azureStorageConfigurationJson.isCacheWriteAllowed
        });
        break;
      }

      default: {
        throw new Error(`Unexpected cache provider: ${buildCacheJson.cacheProvider}`);
      }
    }
  }

  /**
   * Loads the build-cache.json data from the repo's default file path (/common/config/rush/build-cache.json).
   * If the file has not been created yet, then undefined is returned.
   */
  public static async loadFromDefaultPathAsync(
    terminal: Terminal,
    rushConfiguration: RushConfiguration
  ): Promise<BuildCacheConfiguration | undefined> {
    const jsonFilePath: string = BuildCacheConfiguration.getBuildCacheConfigFilePath(rushConfiguration);
    if (FileSystem.exists(jsonFilePath)) {
      const buildCacheJson: IBuildCacheJson = await JsonFile.loadAndValidateAsync(
        jsonFilePath,
        BuildCacheConfiguration._jsonSchema
      );
      const rushUserConfiguration: RushUserConfiguration = await RushUserConfiguration.initializeAsync();

      let getCacheEntryId: GetCacheEntryIdFunction;
      try {
        getCacheEntryId = CacheEntryId.parsePattern(buildCacheJson.cacheEntryNamePattern);
      } catch (e) {
        terminal.writeErrorLine(
          `Error parsing cache entry name pattern "${buildCacheJson.cacheEntryNamePattern}": ${e}`
        );
        throw new AlreadyReportedError();
      }

      return new BuildCacheConfiguration({
        buildCacheJson,
        getCacheEntryId,
        rushConfiguration,
        rushUserConfiguration
      });
    } else {
      return undefined;
    }
  }

  public static getBuildCacheConfigFilePath(rushConfiguration: RushConfiguration): string {
    return path.resolve(rushConfiguration.commonRushConfigFolder, RushConstants.buildCacheFilename);
  }
}
