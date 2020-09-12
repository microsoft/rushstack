// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { ConfigurationFile, InheritanceType, PathResolutionMethod } from '@rushstack/heft-config-file';

import { IPluginConfigurationJson } from '../pluginFramework/PluginManager';
import { ICopyStaticAssetsConfigurationJson } from '../plugins/CopyStaticAssetsPlugin';
import { IApiExtractorPluginConfiguration } from '../plugins/ApiExtractorPlugin/ApiExtractorPlugin';
import { ITypeScriptConfigurationJson } from '../plugins/TypeScriptPlugin/TypeScriptPlugin';
import { ICleanConfigurationJson } from '../stages/CleanStage';

export class HeftConfigFiles {
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

  public static get pluginConfigFileLoader(): ConfigurationFile<IPluginConfigurationJson> {
    if (!HeftConfigFiles._pluginConfigFileLoader) {
      const schemaPath: string = path.join(__dirname, '..', 'schemas', 'plugins.schema.json');
      HeftConfigFiles._pluginConfigFileLoader = new ConfigurationFile<IPluginConfigurationJson>({
        jsonSchemaPath: schemaPath,
        propertyInheritanceTypes: { plugins: InheritanceType.append },
        jsonPathMetadata: {
          '$.plugins.*.plugin': {
            pathResolutionMethod: PathResolutionMethod.NodeResolve
          }
        }
      });
    }

    return HeftConfigFiles._pluginConfigFileLoader;
  }

  public static get copyStaticAssetsConfigurationLoader(): ConfigurationFile<
    ICopyStaticAssetsConfigurationJson
  > {
    if (!HeftConfigFiles._copyStaticAssetsConfigurationLoader) {
      const schemaPath: string = path.resolve(__dirname, '..', 'schemas', 'copy-static-assets.schema.json');
      HeftConfigFiles._copyStaticAssetsConfigurationLoader = new ConfigurationFile<
        ICopyStaticAssetsConfigurationJson
      >({ jsonSchemaPath: schemaPath });
    }

    return HeftConfigFiles._copyStaticAssetsConfigurationLoader;
  }

  public static get apiExtractorTaskConfigurationLoader(): ConfigurationFile<
    IApiExtractorPluginConfiguration
  > {
    if (!HeftConfigFiles._apiExtractorTaskConfigurationLoader) {
      const schemaPath: string = path.resolve(__dirname, '..', 'schemas', 'api-extractor-task.schema.json');
      HeftConfigFiles._apiExtractorTaskConfigurationLoader = new ConfigurationFile<
        IApiExtractorPluginConfiguration
      >({ jsonSchemaPath: schemaPath });
    }

    return HeftConfigFiles._apiExtractorTaskConfigurationLoader;
  }

  public static get typeScriptConfigurationFileLoader(): ConfigurationFile<ITypeScriptConfigurationJson> {
    if (!HeftConfigFiles._typeScriptConfigurationFileLoader) {
      const schemaPath: string = path.resolve(__dirname, '..', 'schemas', 'typescript.schema.json');
      HeftConfigFiles._typeScriptConfigurationFileLoader = new ConfigurationFile<
        ITypeScriptConfigurationJson
      >({ jsonSchemaPath: schemaPath });
    }

    return HeftConfigFiles._typeScriptConfigurationFileLoader;
  }

  public static get cleanConfigurationFileLoader(): ConfigurationFile<ICleanConfigurationJson> {
    if (!HeftConfigFiles._cleanConfigurationFileLoader) {
      const schemaPath: string = path.resolve(__dirname, '..', 'schemas', 'clean.schema.json');
      HeftConfigFiles._cleanConfigurationFileLoader = new ConfigurationFile<ICleanConfigurationJson>({
        jsonSchemaPath: schemaPath,
        jsonPathMetadata: {
          '$.pathsToDelete.*': {
            pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
          }
        }
      });
    }

    return HeftConfigFiles._cleanConfigurationFileLoader;
  }
}
