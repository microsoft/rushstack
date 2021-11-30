// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  JsonFile,
  JsonSchema,
  FileSystem,
  JsonObject,
  AlreadyReportedError,
  ITerminal
} from '@rushstack/node-core-library';

import { RushConfiguration } from './RushConfiguration';
import { FileSystemBuildCacheProvider } from '../logic/buildCache/FileSystemBuildCacheProvider';
import { RushConstants } from '../logic/RushConstants';
import { ICloudBuildCacheProvider } from '../logic/buildCache/ICloudBuildCacheProvider';
import { RushUserConfiguration } from './RushUserConfiguration';
import { EnvironmentConfiguration } from './EnvironmentConfiguration';
import { CacheEntryId, GetCacheEntryIdFunction } from '../logic/buildCache/CacheEntryId';
import type { CloudBuildCacheProviderFactory, RushSession } from '../pluginFramework/RushSession';

/**
 * Describes the file structure for the "common/config/rush/build-cache.json" config file.
 */
interface IBaseBuildCacheJson {
  buildCacheEnabled: boolean;
  cacheProvider: string;
  cacheEntryNamePattern?: string;
}

/**
 * @public
 */
export interface ILocalBuildCacheJson extends IBaseBuildCacheJson {
  readonly cacheProvider: 'local-only';
}

/**
 * @beta
 */
export interface ICloudBuildCacheJson extends IBaseBuildCacheJson {
  readonly cacheProvider: string;
  [otherConfigKey: string]: JsonObject;
}

/**
 * @beta
 */
export type IBuildCacheJson = ICloudBuildCacheJson | ILocalBuildCacheJson;

interface IBuildCacheConfigurationOptions {
  buildCacheJson: IBuildCacheJson;
  getCacheEntryId: GetCacheEntryIdFunction;
  rushConfiguration: RushConfiguration;
  rushUserConfiguration: RushUserConfiguration;
  rushSession: RushSession;
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

  /**
   * Indicates whether the build cache feature is enabled.
   * Typically it is enabled in the build-cache.json config file.
   */
  public readonly buildCacheEnabled: boolean;

  public readonly getCacheEntryId: GetCacheEntryIdFunction;
  public readonly localCacheProvider: FileSystemBuildCacheProvider;
  public readonly cloudCacheProvider: ICloudBuildCacheProvider | undefined;

  private constructor(options: IBuildCacheConfigurationOptions) {
    this.buildCacheEnabled =
      EnvironmentConfiguration.buildCacheEnabled ?? options.buildCacheJson.buildCacheEnabled;

    this.getCacheEntryId = options.getCacheEntryId;
    this.localCacheProvider = new FileSystemBuildCacheProvider({
      rushUserConfiguration: options.rushUserConfiguration,
      rushConfiguration: options.rushConfiguration
    });

    const { buildCacheJson } = options;
    // Don't configure a cloud cache provider if local-only
    if (buildCacheJson.cacheProvider !== 'local-only') {
      const cloudCacheProviderFactory: CloudBuildCacheProviderFactory | undefined =
        options.rushSession.getCloudBuildCacheProviderFactory(buildCacheJson.cacheProvider);
      if (!cloudCacheProviderFactory) {
        throw new Error(`Unexpected cache provider: ${buildCacheJson.cacheProvider}`);
      }
      this.cloudCacheProvider = cloudCacheProviderFactory(buildCacheJson as ICloudBuildCacheJson);
    }
  }

  /**
   * Attempts to load the build-cache.json data from the standard file path `common/config/rush/build-cache.json`.
   * If the file has not been created yet, then undefined is returned.
   */
  public static async tryLoadAsync(
    terminal: ITerminal,
    rushConfiguration: RushConfiguration,
    rushSession: RushSession
  ): Promise<BuildCacheConfiguration | undefined> {
    const jsonFilePath: string = BuildCacheConfiguration.getBuildCacheConfigFilePath(rushConfiguration);
    if (!FileSystem.exists(jsonFilePath)) {
      return undefined;
    }
    return await BuildCacheConfiguration._loadAsync(jsonFilePath, terminal, rushConfiguration, rushSession);
  }

  /**
   * Loads the build-cache.json data from the standard file path `common/config/rush/build-cache.json`.
   * If the file has not been created yet, or if the feature is not enabled, then an error is reported.
   */
  public static async loadAndRequireEnabledAsync(
    terminal: ITerminal,
    rushConfiguration: RushConfiguration,
    rushSession: RushSession
  ): Promise<BuildCacheConfiguration> {
    const jsonFilePath: string = BuildCacheConfiguration.getBuildCacheConfigFilePath(rushConfiguration);
    if (!FileSystem.exists(jsonFilePath)) {
      terminal.writeErrorLine(
        `The build cache feature is not enabled. This config file is missing:\n` + jsonFilePath
      );
      terminal.writeLine(`\nThe Rush website documentation has instructions for enabling the build cache.`);
      throw new AlreadyReportedError();
    }

    const buildCacheConfiguration: BuildCacheConfiguration = await BuildCacheConfiguration._loadAsync(
      jsonFilePath,
      terminal,
      rushConfiguration,
      rushSession
    );

    if (!buildCacheConfiguration.buildCacheEnabled) {
      terminal.writeErrorLine(
        `The build cache feature is not enabled. You can enable it by editing this config file:\n` +
          jsonFilePath
      );
      throw new AlreadyReportedError();
    }
    return buildCacheConfiguration;
  }

  private static async _loadAsync(
    jsonFilePath: string,
    terminal: ITerminal,
    rushConfiguration: RushConfiguration,
    rushSession: RushSession
  ): Promise<BuildCacheConfiguration> {
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
      rushUserConfiguration,
      rushSession
    });
  }

  public static getBuildCacheConfigFilePath(rushConfiguration: RushConfiguration): string {
    return path.resolve(rushConfiguration.commonRushConfigFolder, RushConstants.buildCacheFilename);
  }
}
