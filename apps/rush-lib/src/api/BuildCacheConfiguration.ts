// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  JsonFile,
  JsonSchema,
  FileSystem,
  AlreadyReportedError,
  Terminal,
  Import
} from '@rushstack/node-core-library';

import { RushConfiguration } from './RushConfiguration';
import { FileSystemBuildCacheProvider } from '../logic/buildCache/FileSystemBuildCacheProvider';
import { RushConstants } from '../logic/RushConstants';
import { CloudBuildCacheProviderBase } from '../logic/buildCache/CloudBuildCacheProviderBase';
import { RushUserConfiguration } from './RushUserConfiguration';
import { CacheEntryId, GetCacheEntryIdFunction } from '../logic/buildCache/CacheEntryId';

const AzureStorageBuildCacheProviderModule: typeof import('../logic/buildCache/AzureStorageBuildCacheProvider') = Import.lazy(
  '../logic/buildCache/AzureStorageBuildCacheProvider',
  require
);
import type {
  AzureEnvironmentNames,
  AzureStorageBuildCacheProvider
} from '../logic/buildCache/AzureStorageBuildCacheProvider';
const AmazonS3BuildCacheProviderModule: typeof import('../logic/buildCache/AmazonS3BuildCacheProvider') = Import.lazy(
  '../logic/buildCache/AmazonS3BuildCacheProvider',
  require
);
import type { AmazonS3BuildCacheProvider } from '../logic/buildCache/AmazonS3BuildCacheProvider';

/**
 * Describes the file structure for the "common/config/rush/build-cache.json" config file.
 */
interface IBaseBuildCacheJson {
  cacheProvider: 'azure-blob-storage' | 'amazon-s3' | 'local-only';
  cacheEntryNamePattern?: string;
}

interface IAzureBlobStorageBuildCacheJson extends IBaseBuildCacheJson {
  cacheProvider: 'azure-blob-storage';

  azureBlobStorageConfiguration: IAzureStorageConfigurationJson;
}

interface IAmazonS3BuildCacheJson extends IBaseBuildCacheJson {
  cacheProvider: 'amazon-s3';

  amazonS3Configuration: IAmazonS3ConfigurationJson;
}

interface ILocalBuildCacheJson extends IBaseBuildCacheJson {
  cacheProvider: 'local-only';
}

type IBuildCacheJson = IAzureBlobStorageBuildCacheJson | IAmazonS3BuildCacheJson | ILocalBuildCacheJson;

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

interface IAmazonS3ConfigurationJson {
  /**
   * The Amazon S3 region of the bucket to use for build cache (e.g. "us-east-1").
   */
  s3Region: string;

  /**
   * The name of the bucket in Amazon S3 to use for build cache.
   */
  s3Bucket: string;

  /**
   * An optional prefix ("folder") for cache items.
   */
  s3Prefix?: string;

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
        this.cloudCacheProvider = this._createAzureStorageBuildCacheProvider(
          buildCacheJson.azureBlobStorageConfiguration
        );
        break;
      }

      case 'amazon-s3': {
        this.cloudCacheProvider = this._createAmazonS3BuildCacheProvider(
          buildCacheJson.amazonS3Configuration
        );
        break;
      }

      default: {
        throw new Error(`Unexpected cache provider: ${(buildCacheJson as IBuildCacheJson).cacheProvider}`);
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

  private _createAzureStorageBuildCacheProvider(
    azureStorageConfigurationJson: IAzureStorageConfigurationJson
  ): AzureStorageBuildCacheProvider {
    return new AzureStorageBuildCacheProviderModule.AzureStorageBuildCacheProvider({
      storageAccountName: azureStorageConfigurationJson.storageAccountName,
      storageContainerName: azureStorageConfigurationJson.storageContainerName,
      azureEnvironment: azureStorageConfigurationJson.azureEnvironment,
      blobPrefix: azureStorageConfigurationJson.blobPrefix,
      isCacheWriteAllowed: !!azureStorageConfigurationJson.isCacheWriteAllowed
    });
  }

  private _createAmazonS3BuildCacheProvider(
    amazonS3ConfigurationJson: IAmazonS3ConfigurationJson
  ): AmazonS3BuildCacheProvider {
    return new AmazonS3BuildCacheProviderModule.AmazonS3BuildCacheProvider({
      s3Region: amazonS3ConfigurationJson.s3Region,
      s3Bucket: amazonS3ConfigurationJson.s3Bucket,
      s3Prefix: amazonS3ConfigurationJson.s3Prefix,
      isCacheWriteAllowed: !!amazonS3ConfigurationJson.isCacheWriteAllowed
    });
  }
}
