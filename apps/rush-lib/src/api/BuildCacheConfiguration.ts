// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile, JsonSchema, FileSystem } from '@rushstack/node-core-library';

import { BuildCacheProviderBase } from '../logic/buildCache/BuildCacheProviderBase';
import {
  AzureEnvironmentNames,
  AzureStorageBuildCacheProvider
} from '../logic/buildCache/AzureStorageBuildCacheProvider';
import { RushConfiguration } from './RushConfiguration';
import { FileSystemBuildCacheProvider } from '../logic/buildCache/FileSystemBuildCacheProvider';
import { RushGlobalFolder } from './RushGlobalFolder';
import { RushConstants } from '../logic/RushConstants';
import { RushUserConfiguration } from './RushUserConfiguration';

/**
 * Describes the file structure for the "common/config/rush/build-cache.json" config file.
 */
interface IBuildCacheJson {
  cacheProvider: 'azure-blob-storage' | 'filesystem';

  /**
   * A list of folder names under each project root that should be cached.
   * These folders should not be tracked by git.
   */
  projectOutputFolderNames: string[];
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

interface IFileSystemBuildCacheJson extends IBuildCacheJson {
  cacheProvider: 'filesystem';
}

interface IBuildCacheConfigurationOptions {
  buildCacheJson: IBuildCacheJson;
  rushConfiguration: RushConfiguration;
  rushUserConfiguration: RushUserConfiguration;
  rushGlobalFolder: RushGlobalFolder;
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

  public readonly projectOutputFolderNames: string[];

  public readonly cacheProvider: BuildCacheProviderBase;

  private constructor(options: IBuildCacheConfigurationOptions) {
    const { buildCacheJson, rushConfiguration, rushUserConfiguration, rushGlobalFolder } = options;
    this.projectOutputFolderNames = buildCacheJson.projectOutputFolderNames;

    switch (buildCacheJson.cacheProvider) {
      case 'filesystem': {
        this.cacheProvider = new FileSystemBuildCacheProvider({
          rushConfiguration,
          rushUserConfiguration
        });
        break;
      }

      case 'azure-blob-storage': {
        const azureStorageBuildCacheJson: IAzureBlobStorageBuildCacheJson = buildCacheJson as IAzureBlobStorageBuildCacheJson;
        const azureStorageConfigurationJson: IAzureStorageConfigurationJson =
          azureStorageBuildCacheJson.azureBlobStorageConfiguration;
        this.cacheProvider = new AzureStorageBuildCacheProvider({
          rushGlobalFolder,
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
    rushConfiguration: RushConfiguration,
    rushGlobalFolder: RushGlobalFolder
  ): Promise<BuildCacheConfiguration | undefined> {
    const jsonFilePath: string = BuildCacheConfiguration.getBuildCacheConfigFilePath(rushConfiguration);
    if (FileSystem.exists(jsonFilePath)) {
      const buildCacheJson: IBuildCacheJson = await JsonFile.loadAndValidateAsync(
        jsonFilePath,
        BuildCacheConfiguration._jsonSchema
      );
      const rushUserConfiguration: RushUserConfiguration = await RushUserConfiguration.initializeAsync();
      return new BuildCacheConfiguration({
        buildCacheJson,
        rushConfiguration,
        rushUserConfiguration,
        rushGlobalFolder
      });
    } else {
      return undefined;
    }
  }

  public static getBuildCacheConfigFilePath(rushConfiguration: RushConfiguration): string {
    return path.resolve(rushConfiguration.commonRushConfigFolder, RushConstants.buildCacheFilename);
  }
}
