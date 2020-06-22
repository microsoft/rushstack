// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonSchema, FileSystem, JsonFile } from '@rushstack/node-core-library';

import { IPluginPackage } from '../../pluginFramework/IPluginPackage';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { Clean, HeftCompilation, Build } from '../../pluginFramework/HeftCompilation';
import { ISharedCopyStaticAssetsConfiguration } from '../../cli/actions/BuildAction';

interface IConfigurationJsonBase {}

interface ICleanConfigurationJson extends IConfigurationJsonBase {
  pathsToDelete: string[];
}

interface ICopyStaticAssetsConfigurationJson
  extends IConfigurationJsonBase,
    ISharedCopyStaticAssetsConfiguration {}

export abstract class ActionConfigurationFilesPluginBase implements IPluginPackage {
  private static _schemaCache: Map<string, JsonSchema> = new Map<string, JsonSchema>();

  public abstract displayName: string;

  public apply(heftCompilation: HeftCompilation, heftConfiguration: HeftConfiguration): void {
    heftCompilation.hooks.clean.tap(this.displayName, (clean: Clean) => {
      clean.hooks.loadActionConfiguration.tapPromise(this.displayName, async () => {
        const cleanActionConfiguration:
          | ICleanConfigurationJson
          | undefined = await this._getConfigDataByNameAsync(heftConfiguration, 'clean');

        if (cleanActionConfiguration) {
          clean.pathsToDelete.push(...cleanActionConfiguration.pathsToDelete);
        }
      });
    });

    heftCompilation.hooks.build.tap(this.displayName, (build: Build) => {
      build.hooks.compile.tap(this.displayName, (compile) => {
        compile.hooks.configureCopyStaticAssets.tapPromise(this.displayName, async () => {
          const copyStaticAssetsConfiguration:
            | ICopyStaticAssetsConfigurationJson
            | undefined = await this._getConfigDataByNameAsync(heftConfiguration, 'copy-static-assets');

          if (copyStaticAssetsConfiguration) {
            if (copyStaticAssetsConfiguration.fileExtensions) {
              if (!compile.copyStaticAssetsConfiguration.fileExtensions) {
                compile.copyStaticAssetsConfiguration.fileExtensions = [];
              }

              compile.copyStaticAssetsConfiguration.fileExtensions.push(
                ...copyStaticAssetsConfiguration.fileExtensions
              );
            }

            if (copyStaticAssetsConfiguration.include) {
              if (!compile.copyStaticAssetsConfiguration.include) {
                compile.copyStaticAssetsConfiguration.include = [];
              }

              compile.copyStaticAssetsConfiguration.include.push(...copyStaticAssetsConfiguration.include);
            }

            if (copyStaticAssetsConfiguration.exclude) {
              if (!compile.copyStaticAssetsConfiguration.exclude) {
                compile.copyStaticAssetsConfiguration.exclude = [];
              }

              compile.copyStaticAssetsConfiguration.exclude.push(...copyStaticAssetsConfiguration.exclude);
            }
          }
        });
      });
    });
  }

  protected abstract _getActionConfigurationFilePathByName(
    actionName: string,
    heftConfiguration: HeftConfiguration
  ): string | undefined;

  private async _getConfigDataByNameAsync<TConfigJson>(
    heftConfiguration: HeftConfiguration,
    configFilename: string
  ): Promise<TConfigJson | undefined> {
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

      return loadedConfigJson;
    } else {
      heftConfiguration.terminal.writeVerboseLine(
        `Config file "${actionConfigurationFilePath}" doesn't exit. Skipping.`
      );

      return undefined;
    }
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
