// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile, JsonSchema, FileSystem } from '@rushstack/node-core-library';

import { BuildCacheProviderBase } from '../logic/buildCache/BuildCacheProviderBase';
import { AzureStorageBuildCacheProvider } from '../logic/buildCache/AzureStorageBuildCacheProvider';
import { RushConfiguration } from './RushConfiguration';
import { FileSystemBuildCacheProvider } from '../logic/buildCache/FileSystemBuildCacheProvider';

/**
 * Describes the file structure for the "common/config/rush/build-cache.json" config file.
 */
interface IBuildCacheJson {
  cacheProvider: 'azure-storage' | 'filesystem';

  /**
   * A list of folder names under each project root that should be cached.
   * These folders should not be tracked by git.
   */
  projectOutputFolderNames: string[];
}

interface IAzureStorageBuildCacheJson extends IBuildCacheJson {
  cacheProvider: 'azure-storage';

  /**
   * A connection string for accessing the Azure storage account.
   */
  connectionString: string;

  /**
   * The name of the container in the Azure storage account to use for build cache.
   */
  storageContainerName: string;

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

  private constructor(buildCacheJson: IBuildCacheJson, rushConfiguration: RushConfiguration) {
    this.projectOutputFolderNames = buildCacheJson.projectOutputFolderNames;

    switch (buildCacheJson.cacheProvider) {
      case 'filesystem': {
        this.cacheProvider = new FileSystemBuildCacheProvider({
          rushConfiguration
        });
        break;
      }

      case 'azure-storage': {
        const azureStorageBuildCacheJson: IAzureStorageBuildCacheJson = buildCacheJson as IAzureStorageBuildCacheJson;
        this.cacheProvider = new AzureStorageBuildCacheProvider({
          connectionString: azureStorageBuildCacheJson.connectionString,
          storageContainerName: azureStorageBuildCacheJson.storageContainerName,
          blobPrefix: azureStorageBuildCacheJson.blobPrefix,
          isCacheWriteAllowed: !!azureStorageBuildCacheJson.isCacheWriteAllowed
        });
        break;
      }

      default: {
        throw new Error(`Unexpected cache provider: ${buildCacheJson.cacheProvider}`);
      }
    }
  }

  /**
   * Loads the build-cache.json data from the specified file path.
   * If the file has not been created yet, then undefined is returned.
   */
  public static loadFromFile(
    jsonFilename: string,
    rushConfiguration: RushConfiguration
  ): BuildCacheConfiguration | undefined {
    if (FileSystem.exists(jsonFilename)) {
      const buildCacheJson: IBuildCacheJson = JsonFile.loadAndValidate(
        jsonFilename,
        BuildCacheConfiguration._jsonSchema
      );

      return new BuildCacheConfiguration(buildCacheJson, rushConfiguration);
    } else {
      return undefined;
    }
  }
}
