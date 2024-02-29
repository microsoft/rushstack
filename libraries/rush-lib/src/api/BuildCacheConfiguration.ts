// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  JsonFile,
  JsonSchema,
  FileSystem,
  type JsonObject,
  AlreadyReportedError
} from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import type { RushConfiguration } from './RushConfiguration';
import { FileSystemBuildCacheProvider } from '../logic/buildCache/FileSystemBuildCacheProvider';
import { RushConstants } from '../logic/RushConstants';
import type { ICloudBuildCacheProvider } from '../logic/buildCache/ICloudBuildCacheProvider';
import { RushUserConfiguration } from './RushUserConfiguration';
import { EnvironmentConfiguration } from './EnvironmentConfiguration';
import { CacheEntryId, type GetCacheEntryIdFunction } from '../logic/buildCache/CacheEntryId';
import type { CloudBuildCacheProviderFactory, RushSession } from '../pluginFramework/RushSession';
import schemaJson from '../schemas/build-cache.schema.json';

/**
 * Describes the file structure for the "common/config/rush/build-cache.json" config file.
 */
export interface IBaseBuildCacheJson {
  buildCacheEnabled: boolean;
  cacheProvider: string;
  /**
   * Used to specify the cache entry ID format. If this property is set, it must
   * contain a `[hash]` token. It may also contain one of the following tokens:
   * - `[projectName]`
   * - `[projectName:normalize]`
   * - `[phaseName]`
   * - `[phaseName:normalize]`
   * - `[phaseName:trimPrefix]`
   * - `[os]`
   * - `[arch]`
   * @privateRemarks
   * NOTE: If you update this comment, make sure to update build-cache.json in the "rush init" template.
   * The token parser is in CachEntryId.ts
   */
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
  cloudCacheProvider: ICloudBuildCacheProvider | undefined;
}

/**
 * Use this class to load and save the "common/config/rush/build-cache.json" config file.
 * This file provides configuration options for cached project build output.
 * @beta
 */
export class BuildCacheConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  /**
   * Indicates whether the build cache feature is enabled.
   * Typically it is enabled in the build-cache.json config file.
   */
  public readonly buildCacheEnabled: boolean;
  /**
   * Indicates whether or not writing to the cache is enabled.
   */
  public cacheWriteEnabled: boolean;
  /**
   * Method to calculate the cache entry id for a project, phase, and project state.
   */
  public readonly getCacheEntryId: GetCacheEntryIdFunction;
  /**
   * The provider for interacting with the local build cache.
   */
  public readonly localCacheProvider: FileSystemBuildCacheProvider;
  /**
   * The provider for interacting with the cloud build cache, if configured.
   */
  public readonly cloudCacheProvider: ICloudBuildCacheProvider | undefined;

  private constructor({
    getCacheEntryId,
    buildCacheJson,
    rushUserConfiguration,
    rushConfiguration,
    cloudCacheProvider
  }: IBuildCacheConfigurationOptions) {
    this.buildCacheEnabled = EnvironmentConfiguration.buildCacheEnabled ?? buildCacheJson.buildCacheEnabled;
    this.cacheWriteEnabled =
      !!this.buildCacheEnabled && EnvironmentConfiguration.buildCacheWriteAllowed !== false;

    this.getCacheEntryId = getCacheEntryId;
    this.localCacheProvider = new FileSystemBuildCacheProvider({
      rushUserConfiguration: rushUserConfiguration,
      rushConfiguration: rushConfiguration
    });
    this.cloudCacheProvider = cloudCacheProvider;
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

  /**
   * Gets the absolute path to the build-cache.json file in the specified rush workspace.
   */
  public static getBuildCacheConfigFilePath(rushConfiguration: RushConfiguration): string {
    return path.resolve(rushConfiguration.commonRushConfigFolder, RushConstants.buildCacheFilename);
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

    let cloudCacheProvider: ICloudBuildCacheProvider | undefined;
    // Don't configure a cloud cache provider if local-only
    if (buildCacheJson.cacheProvider !== 'local-only') {
      const cloudCacheProviderFactory: CloudBuildCacheProviderFactory | undefined =
        rushSession.getCloudBuildCacheProviderFactory(buildCacheJson.cacheProvider);
      if (!cloudCacheProviderFactory) {
        throw new Error(`Unexpected cache provider: ${buildCacheJson.cacheProvider}`);
      }
      cloudCacheProvider = await cloudCacheProviderFactory(buildCacheJson as ICloudBuildCacheJson);
    }

    return new BuildCacheConfiguration({
      buildCacheJson,
      getCacheEntryId,
      rushConfiguration,
      rushUserConfiguration,
      rushSession,
      cloudCacheProvider
    });
  }
}
