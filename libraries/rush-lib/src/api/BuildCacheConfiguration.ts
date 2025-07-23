// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';

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
import { EnvironmentConfiguration, EnvironmentVariableNames } from './EnvironmentConfiguration';
import {
  CacheEntryId,
  type IGenerateCacheEntryIdOptions,
  type GetCacheEntryIdFunction
} from '../logic/buildCache/CacheEntryId';
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
   * The token parser is in CacheEntryId.ts
   */
  cacheEntryNamePattern?: string;
  /**
   * An optional salt to inject during calculation of the cache key. This can be used to invalidate the cache for all projects when the salt changes.
   */
  cacheHashSalt?: string;
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

const BUILD_CACHE_JSON_SCHEMA: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

/**
 * Use this class to load and save the "common/config/rush/build-cache.json" config file.
 * This file provides configuration options for cached project build output.
 * @beta
 */
export class BuildCacheConfiguration {
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
  /**
   * An optional salt to inject during calculation of the cache key. This can be used to invalidate the cache for all projects when the salt changes.
   */
  public readonly cacheHashSalt: string | undefined;

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
    this.cacheHashSalt = buildCacheJson.cacheHashSalt;
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
    const { buildCacheConfiguration } = await BuildCacheConfiguration._tryLoadInternalAsync(
      terminal,
      rushConfiguration,
      rushSession
    );
    return buildCacheConfiguration;
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
    const { buildCacheConfiguration, jsonFilePath } = await BuildCacheConfiguration._tryLoadInternalAsync(
      terminal,
      rushConfiguration,
      rushSession
    );

    if (!buildCacheConfiguration) {
      terminal.writeErrorLine(
        `The build cache feature is not enabled. This config file is missing:\n` + jsonFilePath
      );
      terminal.writeLine(`\nThe Rush website documentation has instructions for enabling the build cache.`);
      throw new AlreadyReportedError();
    }

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
    return `${rushConfiguration.commonRushConfigFolder}/${RushConstants.buildCacheFilename}`;
  }

  private static async _tryLoadInternalAsync(
    terminal: ITerminal,
    rushConfiguration: RushConfiguration,
    rushSession: RushSession
  ): Promise<{ buildCacheConfiguration: BuildCacheConfiguration | undefined; jsonFilePath: string }> {
    const jsonFilePath: string = BuildCacheConfiguration.getBuildCacheConfigFilePath(rushConfiguration);
    const buildCacheConfiguration: BuildCacheConfiguration | undefined =
      await BuildCacheConfiguration._tryLoadAsync(jsonFilePath, terminal, rushConfiguration, rushSession);
    return { buildCacheConfiguration, jsonFilePath };
  }

  private static async _tryLoadAsync(
    jsonFilePath: string,
    terminal: ITerminal,
    rushConfiguration: RushConfiguration,
    rushSession: RushSession
  ): Promise<BuildCacheConfiguration | undefined> {
    let buildCacheJson: IBuildCacheJson;
    const buildCacheOverrideJson: string | undefined = EnvironmentConfiguration.buildCacheOverrideJson;
    if (buildCacheOverrideJson) {
      buildCacheJson = JsonFile.parseString(buildCacheOverrideJson);
      BUILD_CACHE_JSON_SCHEMA.validateObject(
        buildCacheJson,
        `${EnvironmentVariableNames.RUSH_BUILD_CACHE_OVERRIDE_JSON} environment variable`
      );
    } else {
      const buildCacheOverrideJsonFilePath: string | undefined =
        EnvironmentConfiguration.buildCacheOverrideJsonFilePath;
      if (buildCacheOverrideJsonFilePath) {
        buildCacheJson = await JsonFile.loadAndValidateAsync(
          buildCacheOverrideJsonFilePath,
          BUILD_CACHE_JSON_SCHEMA
        );
      } else {
        try {
          buildCacheJson = await JsonFile.loadAndValidateAsync(jsonFilePath, BUILD_CACHE_JSON_SCHEMA);
        } catch (e) {
          if (!FileSystem.isNotExistError(e)) {
            throw e;
          } else {
            return undefined;
          }
        }
      }
    }

    const rushUserConfiguration: RushUserConfiguration = await RushUserConfiguration.initializeAsync();
    let innerGetCacheEntryId: GetCacheEntryIdFunction;
    try {
      innerGetCacheEntryId = CacheEntryId.parsePattern(buildCacheJson.cacheEntryNamePattern);
    } catch (e) {
      terminal.writeErrorLine(
        `Error parsing cache entry name pattern "${buildCacheJson.cacheEntryNamePattern}": ${e}`
      );
      throw new AlreadyReportedError();
    }

    const { cacheHashSalt = '', cacheProvider } = buildCacheJson;
    const salt: string = `${RushConstants.buildCacheVersion}${
      cacheHashSalt ? `${RushConstants.hashDelimiter}${cacheHashSalt}` : ''
    }`;
    // Extend the cache entry id with to salt the hash
    // This facilitates forcing cache invalidation either when the build cache version changes (new version of Rush)
    // or when the user-side salt changes (need to purge bad cache entries, plugins including additional files)
    const getCacheEntryId: GetCacheEntryIdFunction = (options: IGenerateCacheEntryIdOptions): string => {
      const saltedHash: string = createHash('sha1')
        .update(salt)
        .update(options.projectStateHash)
        .digest('hex');

      return innerGetCacheEntryId({
        phaseName: options.phaseName,
        projectName: options.projectName,
        projectStateHash: saltedHash
      });
    };

    let cloudCacheProvider: ICloudBuildCacheProvider | undefined;
    // Don't configure a cloud cache provider if local-only
    if (cacheProvider !== 'local-only') {
      const cloudCacheProviderFactory: CloudBuildCacheProviderFactory | undefined =
        rushSession.getCloudBuildCacheProviderFactory(cacheProvider);
      if (!cloudCacheProviderFactory) {
        throw new Error(`Unexpected cache provider: ${cacheProvider}`);
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
