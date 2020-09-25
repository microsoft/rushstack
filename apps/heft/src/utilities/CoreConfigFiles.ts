// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { ConfigurationFile, InheritanceType, PathResolutionMethod } from '@rushstack/heft-config-file';

import { ICopyStaticAssetsConfigurationJson } from '../plugins/CopyStaticAssetsPlugin';
import { IApiExtractorPluginConfiguration } from '../plugins/ApiExtractorPlugin/ApiExtractorPlugin';
import { ITypeScriptConfigurationJson } from '../plugins/TypeScriptPlugin/TypeScriptPlugin';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { FileSystem } from '@rushstack/node-core-library';

export enum HeftEvent {
  clean = 'clean',
  preCompile = 'pre-compile',
  compile = 'compile',
  bundle = 'bundle',
  postBuild = 'post-build'
}

export interface IHeftConfigurationJsonEventActionBase {
  actionKind: string;
  heftEvent: 'clean' | 'pre-compile' | 'compile' | 'bundle' | 'post-build';
  actionId: string;
}

export interface IHeftConfigurationDeleteGlobsEventAction extends IHeftConfigurationJsonEventActionBase {
  actionKind: 'deleteGlobs';
  globsToDelete: string[];
}

export interface IHeftConfigurationJsonPluginSpecifier {
  plugin: string;
  options?: object;
}

export interface IHeftConfigurationJson {
  eventActions?: IHeftConfigurationJsonEventActionBase[];
  heftPlugins?: IHeftConfigurationJsonPluginSpecifier[];
}

export interface IHeftEventActions {
  deleteGlobs: Map<HeftEvent, IHeftConfigurationDeleteGlobsEventAction[]>;
}

export class CoreConfigFiles {
  private static _heftConfigFileLoader: ConfigurationFile<IHeftConfigurationJson> | undefined;

  private static _heftConfigFileEventActionsCache: Map<HeftConfiguration, IHeftEventActions> = new Map<
    HeftConfiguration,
    IHeftEventActions
  >();

  private static _copyStaticAssetsConfigurationLoader:
    | ConfigurationFile<ICopyStaticAssetsConfigurationJson>
    | undefined;
  private static _apiExtractorTaskConfigurationLoader:
    | ConfigurationFile<IApiExtractorPluginConfiguration>
    | undefined;
  private static _typeScriptConfigurationFileLoader:
    | ConfigurationFile<ITypeScriptConfigurationJson>
    | undefined;

  /**
   * Returns the loader for the `config/heft.json` config file.
   */
  public static get heftConfigFileLoader(): ConfigurationFile<IHeftConfigurationJson> {
    if (!CoreConfigFiles._heftConfigFileLoader) {
      const schemaPath: string = path.join(__dirname, '..', 'schemas', 'heft.schema.json');
      CoreConfigFiles._heftConfigFileLoader = new ConfigurationFile<IHeftConfigurationJson>({
        jsonSchemaPath: schemaPath,
        propertyInheritanceTypes: { heftPlugins: InheritanceType.append },
        jsonPathMetadata: {
          '$.heftPlugins.*.plugin': {
            pathResolutionMethod: PathResolutionMethod.NodeResolve
          }
        }
      });
    }

    return CoreConfigFiles._heftConfigFileLoader;
  }

  /**
   * Try to load the config/heft.json config file. If it doesn't exist, returns undefined
   */
  public static async tryLoadHeftConfigFileFromDefaultLocationAsync(
    heftConfiguration: HeftConfiguration
  ): Promise<IHeftConfigurationJson | undefined> {
    const heftConfigJsonPath: string = path.resolve(heftConfiguration.projectConfigFolder, 'heft.json');
    if (await FileSystem.existsAsync(heftConfigJsonPath)) {
      return await CoreConfigFiles.heftConfigFileLoader.loadConfigurationFileAsync(heftConfigJsonPath);
    } else {
      return undefined;
    }
  }

  /**
   * Gets the eventActions from config/heft.json
   */
  public static async getConfigConfigFileEventActionsAsync(
    heftConfiguration: HeftConfiguration
  ): Promise<IHeftEventActions> {
    let result: IHeftEventActions | undefined = CoreConfigFiles._heftConfigFileEventActionsCache.get(
      heftConfiguration
    );
    if (!result) {
      const heftConfigJson:
        | IHeftConfigurationJson
        | undefined = await CoreConfigFiles.tryLoadHeftConfigFileFromDefaultLocationAsync(heftConfiguration);

      result = {
        deleteGlobs: new Map<HeftEvent, IHeftConfigurationDeleteGlobsEventAction[]>()
      };
      CoreConfigFiles._heftConfigFileEventActionsCache.set(heftConfiguration, result);

      for (const eventAction of heftConfigJson?.eventActions || []) {
        switch (eventAction.actionKind) {
          case 'deleteGlobs': {
            CoreConfigFiles._addEventActionToMap(
              eventAction as IHeftConfigurationDeleteGlobsEventAction,
              result.deleteGlobs
            );
            break;
          }

          default: {
            throw new Error(
              `Unknown heft eventAction actionKind "${eventAction.actionKind}" in ` +
                `"${CoreConfigFiles.heftConfigFileLoader.getObjectSourceFilePath(eventAction)}" `
            );
          }
        }
      }
    }

    return result;
  }

  /**
   * Returns the loader for the `config/copy-static-assets.json` config file.
   */
  public static get copyStaticAssetsConfigurationLoader(): ConfigurationFile<
    ICopyStaticAssetsConfigurationJson
  > {
    if (!CoreConfigFiles._copyStaticAssetsConfigurationLoader) {
      const schemaPath: string = path.resolve(__dirname, '..', 'schemas', 'copy-static-assets.schema.json');
      CoreConfigFiles._copyStaticAssetsConfigurationLoader = new ConfigurationFile<
        ICopyStaticAssetsConfigurationJson
      >({ jsonSchemaPath: schemaPath });
    }

    return CoreConfigFiles._copyStaticAssetsConfigurationLoader;
  }

  /**
   * Returns the loader for the `config/api-extractor-task.json` config file.
   */
  public static get apiExtractorTaskConfigurationLoader(): ConfigurationFile<
    IApiExtractorPluginConfiguration
  > {
    if (!CoreConfigFiles._apiExtractorTaskConfigurationLoader) {
      const schemaPath: string = path.resolve(__dirname, '..', 'schemas', 'api-extractor-task.schema.json');
      CoreConfigFiles._apiExtractorTaskConfigurationLoader = new ConfigurationFile<
        IApiExtractorPluginConfiguration
      >({ jsonSchemaPath: schemaPath });
    }

    return CoreConfigFiles._apiExtractorTaskConfigurationLoader;
  }

  /**
   * Returns the loader for the `config/typescript.json` config file.
   */
  public static get typeScriptConfigurationFileLoader(): ConfigurationFile<ITypeScriptConfigurationJson> {
    if (!CoreConfigFiles._typeScriptConfigurationFileLoader) {
      const schemaPath: string = path.resolve(__dirname, '..', 'schemas', 'typescript.schema.json');
      CoreConfigFiles._typeScriptConfigurationFileLoader = new ConfigurationFile<
        ITypeScriptConfigurationJson
      >({
        jsonSchemaPath: schemaPath
      });
    }

    return CoreConfigFiles._typeScriptConfigurationFileLoader;
  }

  private static _addEventActionToMap<TEventAction extends IHeftConfigurationJsonEventActionBase>(
    eventAction: TEventAction,
    map: Map<HeftEvent, TEventAction[]>
  ): void {
    const heftEvent: HeftEvent = CoreConfigFiles._parseHeftEvent(eventAction);
    let eventArray: TEventAction[] | undefined = map.get(heftEvent);
    if (!eventArray) {
      eventArray = [];
      map.set(heftEvent, eventArray);
    }

    eventArray.push(eventAction);
  }

  private static _parseHeftEvent(eventAction: IHeftConfigurationJsonEventActionBase): HeftEvent {
    switch (eventAction.heftEvent) {
      case 'clean':
        return HeftEvent.clean;

      case 'pre-compile':
        return HeftEvent.preCompile;

      case 'compile':
        return HeftEvent.compile;

      case 'bundle':
        return HeftEvent.bundle;

      case 'post-build':
        return HeftEvent.postBuild;

      default:
        throw new Error(
          `Unknown heft event "${eventAction.heftEvent}" in ` +
            ` "${CoreConfigFiles.heftConfigFileLoader.getObjectSourceFilePath(eventAction)}".`
        );
    }
  }
}
