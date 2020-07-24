// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonSchema, FileSystem, JsonFile, JsonObject } from '@rushstack/node-core-library';
import lodash = require('lodash');

import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { HeftSession } from '../../pluginFramework/HeftSession';
import {
  ISharedCopyStaticAssetsConfiguration,
  ISharedTypeScriptConfiguration,
  IBuildStageContext,
  ITypeScriptConfiguration,
  ICopyStaticAssetsConfiguration,
  IApiExtractorConfiguration
} from '../../stages/BuildStage';
import { ICleanStageContext, ICleanStageProperties } from '../../stages/CleanStage';

interface IConfigurationJsonBase {}

interface ICleanConfigurationJson extends IConfigurationJsonBase {
  pathsToDelete: string[];
}

interface ICopyStaticAssetsConfigurationJson
  extends IConfigurationJsonBase,
    ISharedCopyStaticAssetsConfiguration {}

interface ITypeScriptConfigurationJson extends IConfigurationJsonBase, ISharedTypeScriptConfiguration {
  disableTslint?: boolean;
}

interface IConfigurationJsonCacheEntry<TConfigJson extends IConfigurationJsonBase = IConfigurationJsonBase> {
  data: TConfigJson | undefined;
}

export abstract class JsonConfigurationFilesPluginBase implements IHeftPlugin {
  private static _schemaCache: Map<string, JsonSchema> = new Map<string, JsonSchema>();
  private static _defaultConfigCache: Map<string, JsonObject> = new Map<string, JsonObject>();
  private _configurationJsonCache: Map<string, IConfigurationJsonCacheEntry> = new Map<
    string,
    IConfigurationJsonCacheEntry
  >();

  public abstract displayName: string;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.clean.tap(this.displayName, (clean: ICleanStageContext) => {
      clean.hooks.loadStageConfiguration.tapPromise(this.displayName, async () => {
        await this._updateCleanConfigurationAsync(heftConfiguration, clean.properties);
      });
    });

    heftSession.hooks.build.tap(this.displayName, (build: IBuildStageContext) => {
      build.hooks.compile.tap(this.displayName, (compile) => {
        compile.hooks.configureCopyStaticAssets.tapPromise(this.displayName, async () => {
          await this._updateCopyStaticAssetsConfigurationAsync(
            heftConfiguration,
            compile.properties.copyStaticAssetsConfiguration
          );
        });

        compile.hooks.configureTypeScript.tapPromise(this.displayName, async () => {
          await this._updateTypeScriptConfigurationAsync(
            heftConfiguration,
            compile.properties.typeScriptConfiguration
          );
        });
      });

      build.hooks.bundle.tap(this.displayName, (bundle) => {
        bundle.hooks.configureApiExtractor.tapPromise(this.displayName, async (existingConfiguration) => {
          await this._updateApiExtractorConfigurationAsync(heftConfiguration, existingConfiguration);
          return existingConfiguration;
        });
      });
    });
  }

  protected abstract _getConfigurationFilePathByName(
    name: string,
    heftConfiguration: HeftConfiguration
  ): string | undefined;

  private async _updateCleanConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    cleanConfiguration: ICleanStageProperties
  ): Promise<void> {
    const cleanConfigurationJson: ICleanConfigurationJson | undefined = await this._getConfigDataByNameAsync(
      heftConfiguration,
      'clean.json'
    );

    if (cleanConfigurationJson) {
      for (const pathToDelete of cleanConfigurationJson.pathsToDelete) {
        cleanConfiguration.pathsToDelete.add(pathToDelete);
      }
    }

    const typeScriptConfigurationJson:
      | ITypeScriptConfigurationJson
      | undefined = await this._getConfigDataByNameAsync(heftConfiguration, 'typescript.json');
    if (typeScriptConfigurationJson?.additionalModuleKindsToEmit) {
      for (const additionalModuleKindToEmit of typeScriptConfigurationJson.additionalModuleKindsToEmit) {
        cleanConfiguration.pathsToDelete.add(additionalModuleKindToEmit.outFolderPath);
      }
    }
  }

  private async _updateTypeScriptConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    typeScriptConfiguration: ITypeScriptConfiguration
  ): Promise<void> {
    const typeScriptConfigurationJson:
      | ITypeScriptConfigurationJson
      | undefined = await this._getConfigDataByNameAsync(heftConfiguration, 'typescript.json');

    if (typeScriptConfigurationJson?.copyFromCacheMode) {
      typeScriptConfiguration.copyFromCacheMode = typeScriptConfigurationJson.copyFromCacheMode;
    }

    if (typeScriptConfigurationJson?.additionalModuleKindsToEmit !== undefined) {
      typeScriptConfiguration.additionalModuleKindsToEmit =
        typeScriptConfigurationJson.additionalModuleKindsToEmit || undefined;
    }

    if (typeScriptConfigurationJson?.disableTslint !== undefined) {
      typeScriptConfiguration.isLintingEnabled = !typeScriptConfigurationJson.disableTslint;
    }

    if (typeScriptConfigurationJson?.maxWriteParallelism !== undefined) {
      typeScriptConfiguration.maxWriteParallelism = typeScriptConfigurationJson.maxWriteParallelism;
    }
  }

  private async _updateCopyStaticAssetsConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    copyStaticAssetsConfiguration: ICopyStaticAssetsConfiguration
  ): Promise<void> {
    const copyStaticAssetsConfigurationJson:
      | ICopyStaticAssetsConfigurationJson
      | undefined = await this._getConfigDataByNameAsync(heftConfiguration, 'copy-static-assets.json');

    if (copyStaticAssetsConfigurationJson) {
      if (copyStaticAssetsConfigurationJson.fileExtensions) {
        if (!copyStaticAssetsConfiguration.fileExtensions) {
          copyStaticAssetsConfiguration.fileExtensions = [];
        }

        copyStaticAssetsConfiguration.fileExtensions.push(
          ...copyStaticAssetsConfigurationJson.fileExtensions
        );
      }

      if (copyStaticAssetsConfigurationJson.includeGlobs) {
        if (!copyStaticAssetsConfiguration.includeGlobs) {
          copyStaticAssetsConfiguration.includeGlobs = [];
        }

        copyStaticAssetsConfiguration.includeGlobs.push(...copyStaticAssetsConfigurationJson.includeGlobs);
      }

      if (copyStaticAssetsConfigurationJson.excludeGlobs) {
        if (!copyStaticAssetsConfiguration.excludeGlobs) {
          copyStaticAssetsConfiguration.excludeGlobs = [];
        }

        copyStaticAssetsConfiguration.excludeGlobs.push(...copyStaticAssetsConfigurationJson.excludeGlobs);
      }
    }
  }

  private async _updateApiExtractorConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    apiExtractorConfiguration: IApiExtractorConfiguration
  ): Promise<void> {
    const apiExtractorConfigurationJson:
      | IApiExtractorConfiguration
      | undefined = await this._getConfigDataByNameAsync(heftConfiguration, 'api-extractor-task.json');

    if (apiExtractorConfigurationJson?.useProjectTypescriptVersion !== undefined) {
      apiExtractorConfiguration.useProjectTypescriptVersion =
        apiExtractorConfigurationJson.useProjectTypescriptVersion;
    }
  }

  private async _getConfigDataByNameAsync<TConfigJson extends IConfigurationJsonBase>(
    heftConfiguration: HeftConfiguration,
    configFilename: string
  ): Promise<TConfigJson | undefined> {
    if (path.extname(configFilename) !== '.json') {
      throw new Error('The configFilename parameter must specify a file with the .json file extension');
    }

    type IOptionalConfigurationJsonCacheEntry = IConfigurationJsonCacheEntry<TConfigJson> | undefined;
    let configurationJsonCacheEntry: IOptionalConfigurationJsonCacheEntry = this._configurationJsonCache.get(
      configFilename
    ) as IOptionalConfigurationJsonCacheEntry;

    if (!configurationJsonCacheEntry) {
      const configurationFilePath: string | undefined = this._getConfigurationFilePathByName(
        configFilename,
        heftConfiguration
      );

      if (configurationFilePath && FileSystem.exists(configurationFilePath)) {
        // Load the <name>.schema.json
        const schema: JsonSchema = this._getSchemaByName(configFilename);
        // Load the <name>.defaults.json
        const defaultConfig: JsonObject = this._getDefaultConfigByName(configFilename);
        // Load the <name>.json
        const loadedConfigurationWithoutDefaults: JsonObject = JsonFile.load(configurationFilePath);
        // Merge <name>.defaults.json and <name>.json
        const loadedConfigJson: TConfigJson = lodash.merge(
          lodash.cloneDeep(defaultConfig),
          loadedConfigurationWithoutDefaults
        );
        // Validate the resulting object to make sure it conforms to the schema
        schema.validateObject(loadedConfigJson, configurationFilePath);

        heftConfiguration.terminal.writeVerboseLine(`Loaded config file "${configurationFilePath}"`);

        configurationJsonCacheEntry = {
          data: loadedConfigJson
        };
      } else {
        heftConfiguration.terminal.writeVerboseLine(
          `Config file "${configurationFilePath}" doesn't exist. Skipping.`
        );

        configurationJsonCacheEntry = {
          data: undefined
        };
      }

      this._configurationJsonCache.set(configFilename, configurationJsonCacheEntry);
    } else {
      heftConfiguration.terminal.writeVerboseLine(`Config file "${configFilename}" was in the cache.`);
    }

    return configurationJsonCacheEntry.data;
  }

  private _getSchemaByName(configFilename: string): JsonSchema {
    let schema: JsonSchema | undefined = JsonConfigurationFilesPluginBase._schemaCache.get(configFilename);
    if (!schema) {
      const schemaFilename: string = path.parse(configFilename).name + '.schema.json';

      const schemaPath: string = path.resolve(__dirname, '..', '..', 'schemas', schemaFilename);
      schema = JsonSchema.fromFile(schemaPath);
      JsonConfigurationFilesPluginBase._schemaCache.set(configFilename, schema);
    }
    return schema;
  }

  private _getDefaultConfigByName(configFilename: string): JsonObject {
    let defaultConfig: JsonObject | undefined = JsonConfigurationFilesPluginBase._defaultConfigCache.get(
      configFilename
    );
    if (defaultConfig === undefined) {
      const defaultConfigFilename: string = path.parse(configFilename).name + '.defaults.json';

      const defaultConfigPath: string = path.resolve(__dirname, '..', '..', 'schemas', defaultConfigFilename);
      defaultConfig = JsonFile.load(defaultConfigPath);
      JsonConfigurationFilesPluginBase._defaultConfigCache.set(configFilename, defaultConfig);
    }
    return defaultConfig;
  }
}
