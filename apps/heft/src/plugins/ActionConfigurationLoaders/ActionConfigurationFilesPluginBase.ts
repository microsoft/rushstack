// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonSchema, FileSystem, JsonFile } from '@rushstack/node-core-library';

import {
  ISharedTypeScriptConfiguration,
  ISharedCopyStaticAssetsConfiguration,
  ICopyStaticAssetsConfiguration,
  ITypeScriptConfiguration,
  IBuildActionContext
} from '../../cli/actions/BuildAction';
import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { ICleanActionProperties, ICleanActionContext } from '../../cli/actions/CleanAction';

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

export abstract class ActionConfigurationFilesPluginBase implements IHeftPlugin {
  private static _schemaCache: Map<string, JsonSchema> = new Map<string, JsonSchema>();
  private _configurationJsonCache: Map<string, IConfigurationJsonCacheEntry> = new Map<
    string,
    IConfigurationJsonCacheEntry
  >();

  public abstract displayName: string;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.clean.tap(this.displayName, (clean: ICleanActionContext) => {
      clean.hooks.loadActionConfiguration.tapPromise(this.displayName, async () => {
        await this._updateCleanConfigurationAsync(heftConfiguration, clean.properties);
      });
    });

    heftSession.hooks.build.tap(this.displayName, (build: IBuildActionContext) => {
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
    });
  }

  protected abstract _getActionConfigurationFilePathByName(
    actionName: string,
    heftConfiguration: HeftConfiguration
  ): string | undefined;

  private async _updateCleanConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    cleanConfiguration: ICleanActionProperties
  ): Promise<void> {
    const cleanActionConfiguration:
      | ICleanConfigurationJson
      | undefined = await this._getConfigDataByNameAsync(heftConfiguration, 'clean');

    if (cleanActionConfiguration) {
      for (const pathToDelete of cleanActionConfiguration.pathsToDelete) {
        cleanConfiguration.pathsToDelete.add(pathToDelete);
      }
    }

    const typeScriptConfigurationJson:
      | ITypeScriptConfigurationJson
      | undefined = await this._getConfigDataByNameAsync(heftConfiguration, 'typescript');
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
      | undefined = await this._getConfigDataByNameAsync(heftConfiguration, 'typescript');

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
      | undefined = await this._getConfigDataByNameAsync(heftConfiguration, 'copy-static-assets');

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

  private async _getConfigDataByNameAsync<TConfigJson extends IConfigurationJsonBase>(
    heftConfiguration: HeftConfiguration,
    configFilename: string
  ): Promise<TConfigJson | undefined> {
    type IOptionalConfigurationJsonCacheEntry = IConfigurationJsonCacheEntry<TConfigJson> | undefined;
    let configurationJsonCacheEntry: IOptionalConfigurationJsonCacheEntry = this._configurationJsonCache.get(
      configFilename
    ) as IOptionalConfigurationJsonCacheEntry;

    if (!configurationJsonCacheEntry) {
      const actionConfigurationFilePath: string | undefined = this._getActionConfigurationFilePathByName(
        configFilename,
        heftConfiguration
      );

      if (actionConfigurationFilePath && FileSystem.exists(actionConfigurationFilePath)) {
        const schema: JsonSchema = await this._getSchemaByNameAsync(configFilename);
        const baseSchema: JsonSchema = await this._getSchemaByNameAsync('action');

        const loadedConfigJson: TConfigJson = JsonFile.loadAndValidate(actionConfigurationFilePath, schema);
        baseSchema.validateObject(loadedConfigJson, actionConfigurationFilePath);

        heftConfiguration.terminal.writeVerboseLine(`Loaded config file "${actionConfigurationFilePath}"`);

        configurationJsonCacheEntry = {
          data: loadedConfigJson
        };
      } else {
        heftConfiguration.terminal.writeVerboseLine(
          `Config file "${actionConfigurationFilePath}" doesn't exist. Skipping.`
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

  private async _getSchemaByNameAsync(configFilename: string): Promise<JsonSchema> {
    let schema: JsonSchema | undefined = ActionConfigurationFilesPluginBase._schemaCache.get(configFilename);
    if (!schema) {
      const schemaPath: string = path.resolve(
        __dirname,
        '..',
        '..',
        'schemas',
        `${configFilename}.schema.json`
      );
      schema = JsonSchema.fromFile(schemaPath);
      ActionConfigurationFilesPluginBase._schemaCache.set(configFilename, schema);
    }

    return schema;
  }
}
