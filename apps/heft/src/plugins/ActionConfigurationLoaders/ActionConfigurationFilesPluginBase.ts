// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonSchema, FileSystem, JsonFile } from '@rushstack/node-core-library';

import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { Clean, HeftSession, Build } from '../../pluginFramework/HeftSession';
import { ISharedCopyStaticAssetsConfiguration } from '../../cli/actions/BuildAction';

interface IConfigurationJsonBase {}

interface ICleanConfigurationJson extends IConfigurationJsonBase {
  pathsToDelete: string[];
}

interface ICopyStaticAssetsConfigurationJson
  extends IConfigurationJsonBase,
    ISharedCopyStaticAssetsConfiguration {}

export abstract class ActionConfigurationFilesPluginBase implements IHeftPlugin {
  private static _schemaCache: Map<string, JsonSchema> = new Map<string, JsonSchema>();

  public abstract displayName: string;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.clean.tap(this.displayName, (clean: Clean) => {
      clean.hooks.loadActionConfiguration.tapPromise(this.displayName, async () => {
        const cleanActionConfiguration:
          | ICleanConfigurationJson
          | undefined = await this._getConfigDataByNameAsync(heftConfiguration, 'clean');

        if (cleanActionConfiguration) {
          clean.pathsToDelete.push(...cleanActionConfiguration.pathsToDelete);
        }
      });
    });

    heftSession.hooks.build.tap(this.displayName, (build: Build) => {
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

            if (copyStaticAssetsConfiguration.includeGlobs) {
              if (!compile.copyStaticAssetsConfiguration.includeGlobs) {
                compile.copyStaticAssetsConfiguration.includeGlobs = [];
              }

              compile.copyStaticAssetsConfiguration.includeGlobs.push(
                ...copyStaticAssetsConfiguration.includeGlobs
              );
            }

            if (copyStaticAssetsConfiguration.excludeGlobs) {
              if (!compile.copyStaticAssetsConfiguration.excludeGlobs) {
                compile.copyStaticAssetsConfiguration.excludeGlobs = [];
              }

              compile.copyStaticAssetsConfiguration.excludeGlobs.push(
                ...copyStaticAssetsConfiguration.excludeGlobs
              );
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
