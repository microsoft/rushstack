// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { ConfigurationFile, InheritanceType, PathResolutionMethod } from '@rushstack/heft-config-file';

import { IPluginConfigurationJson } from '../pluginFramework/PluginManager';
import { ICopyStaticAssetsConfigurationJson } from '../plugins/CopyStaticAssetsPlugin';
import { IApiExtractorPluginConfiguration } from '../plugins/ApiExtractorPlugin/ApiExtractorPlugin';
import { ITypeScriptConfigurationJson } from '../plugins/TypeScriptPlugin/TypeScriptPlugin';
import { ICleanConfigurationJson } from '../stages/CleanStage';
import { HeftConfiguration } from '../configuration/HeftConfiguration';

export interface IHeftConfigurationJson {}

export class ConfigFile {
  private static _heftConfigFileLoader: ConfigurationFile<IHeftConfigurationJson> | undefined;

  private static _pluginConfigFileLoader: ConfigurationFile<IPluginConfigurationJson> | undefined;
  private static _copyStaticAssetsConfigurationLoader:
    | ConfigurationFile<ICopyStaticAssetsConfigurationJson>
    | undefined;
  private static _apiExtractorTaskConfigurationLoader:
    | ConfigurationFile<IApiExtractorPluginConfiguration>
    | undefined;
  private static _typeScriptConfigurationFileLoader:
    | ConfigurationFile<ITypeScriptConfigurationJson>
    | undefined;
  private static _cleanConfigurationFileLoader: ConfigurationFile<ICleanConfigurationJson> | undefined;

  public static get heftConfigFileLoader(): ConfigurationFile<IHeftConfigurationJson> {
    if (!ConfigFile._heftConfigFileLoader) {
      const schemaPath: string = path.join(__dirname, '..', 'schemas', 'heft.schema.json');
      ConfigFile._heftConfigFileLoader = new ConfigurationFile<IPluginConfigurationJson>({
        jsonSchemaPath: schemaPath
      });
    }

    return ConfigFile._heftConfigFileLoader;
  }

  public static async loadHeftConfigFileFromDefaultLocationAsync(
    heftConfiguration: HeftConfiguration
  ): Promise<IHeftConfigurationJson> {
    return await ConfigFile.heftConfigFileLoader.loadConfigurationFileAsync(
      path.resolve(heftConfiguration.projectConfigFolder, 'heft.json')
    );
  }

  public static get pluginConfigFileLoader(): ConfigurationFile<IPluginConfigurationJson> {
    if (!ConfigFile._pluginConfigFileLoader) {
      const schemaPath: string = path.join(__dirname, '..', 'schemas', 'plugins.schema.json');
      ConfigFile._pluginConfigFileLoader = new ConfigurationFile<IPluginConfigurationJson>({
        jsonSchemaPath: schemaPath,
        propertyInheritanceTypes: { plugins: InheritanceType.append },
        jsonPathMetadata: {
          '$.plugins.*.plugin': {
            pathResolutionMethod: PathResolutionMethod.NodeResolve
          }
        }
      });
    }

    return ConfigFile._pluginConfigFileLoader;
  }

  public static get copyStaticAssetsConfigurationLoader(): ConfigurationFile<
    ICopyStaticAssetsConfigurationJson
  > {
    if (!ConfigFile._copyStaticAssetsConfigurationLoader) {
      const schemaPath: string = path.resolve(__dirname, '..', 'schemas', 'copy-static-assets.schema.json');
      ConfigFile._copyStaticAssetsConfigurationLoader = new ConfigurationFile<
        ICopyStaticAssetsConfigurationJson
      >({ jsonSchemaPath: schemaPath });
    }

    return ConfigFile._copyStaticAssetsConfigurationLoader;
  }

  public static get apiExtractorTaskConfigurationLoader(): ConfigurationFile<
    IApiExtractorPluginConfiguration
  > {
    if (!ConfigFile._apiExtractorTaskConfigurationLoader) {
      const schemaPath: string = path.resolve(__dirname, '..', 'schemas', 'api-extractor-task.schema.json');
      ConfigFile._apiExtractorTaskConfigurationLoader = new ConfigurationFile<
        IApiExtractorPluginConfiguration
      >({ jsonSchemaPath: schemaPath });
    }

    return ConfigFile._apiExtractorTaskConfigurationLoader;
  }

  public static get typeScriptConfigurationFileLoader(): ConfigurationFile<ITypeScriptConfigurationJson> {
    if (!ConfigFile._typeScriptConfigurationFileLoader) {
      const schemaPath: string = path.resolve(__dirname, '..', 'schemas', 'typescript.schema.json');
      ConfigFile._typeScriptConfigurationFileLoader = new ConfigurationFile<ITypeScriptConfigurationJson>({
        jsonSchemaPath: schemaPath
      });
    }

    return ConfigFile._typeScriptConfigurationFileLoader;
  }

  public static get cleanConfigurationFileLoader(): ConfigurationFile<ICleanConfigurationJson> {
    if (!ConfigFile._cleanConfigurationFileLoader) {
      const schemaPath: string = path.resolve(__dirname, '..', 'schemas', 'clean.schema.json');
      ConfigFile._cleanConfigurationFileLoader = new ConfigurationFile<ICleanConfigurationJson>({
        jsonSchemaPath: schemaPath
      });
    }

    return ConfigFile._cleanConfigurationFileLoader;
  }
}
