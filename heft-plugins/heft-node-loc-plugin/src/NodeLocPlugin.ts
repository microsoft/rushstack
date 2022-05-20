// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import type {
  HeftConfiguration,
  HeftSession,
  IBuildStageContext,
  IHeftPlugin,
  IPreCompileSubstage,
  ScopedLogger
} from '@rushstack/heft';
import { ConfigurationFile, PathResolutionMethod } from '@rushstack/heft-config-file';
import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';
import {
  TypingsGenerator as LocTypingsGenerator,
  ITypingsGeneratorOptions as ILocTypingsGeneratorOptions,
  ILocalizationFile
} from '@rushstack/localization-plugin';

import { Async } from './utilities/Async';

export interface INodeLocConfigurationJson {
  srcFolder: string;
  generatedTsFolder: string;
  exportAsDefault?: boolean;
  stringsOutputFolders?: string[];
}

const PLUGIN_NAME: string = 'NodeLocPlugin';
const PLUGIN_SCHEMA_PATH: string = `${__dirname}/schemas/node-loc-plugin.schema.json`;
const NODE_LOC_CONFIGURATION_LOCATION: string = 'config/node-loc.json';

export class NodeLocPlugin implements IHeftPlugin {
  private static _locTypingsConfigurationLoader: ConfigurationFile<INodeLocConfigurationJson> | undefined;

  public readonly pluginName: string = PLUGIN_NAME;
  public readonly optionsSchema: JsonSchema = JsonSchema.fromFile(PLUGIN_SCHEMA_PATH);

  /**
   * Generate typings for localization files before TypeScript compilation.
   */
  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.preCompile.tap(PLUGIN_NAME, (preCompile: IPreCompileSubstage) => {
        preCompile.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._runLocTypingsGeneratorAsync(heftSession, heftConfiguration, build.properties.watchMode);
        });
      });
    });
  }

  private async _runLocTypingsGeneratorAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    isWatchMode: boolean
  ): Promise<void> {
    const logger: ScopedLogger = heftSession.requestScopedLogger('loc-typings-generator');
    const locTypingsConfiguration: INodeLocConfigurationJson | undefined =
      await this._loadLocTypingsConfigurationAsync(heftConfiguration, logger);
    if (locTypingsConfiguration) {
      const locTypingsGeneratorOptions: ILocTypingsGeneratorOptions = {
        srcFolder: locTypingsConfiguration.srcFolder,
        generatedTsFolder: locTypingsConfiguration.generatedTsFolder,
        exportAsDefault: locTypingsConfiguration.exportAsDefault
      };

      if (locTypingsConfiguration.stringsOutputFolders) {
        locTypingsGeneratorOptions.onLocFileParsed = async (
          locFilePath: string,
          locFile: ILocalizationFile
        ) => {
          const locFileStrings: Record<string, string> = {};
          for (const [stringName, { value }] of Object.entries(locFile)) {
            locFileStrings[stringName] = value;
          }

          const sourceFileRelativePath: string = path.relative(
            locTypingsConfiguration.srcFolder,
            locFilePath
          );
          const locFileJson: string = JsonFile.stringify(locFileStrings);
          await Promise.all(
            locTypingsConfiguration.stringsOutputFolders!.map(async (stringsOutputFolder) => {
              const stringsOutputFilePath: string = `${stringsOutputFolder}/${sourceFileRelativePath}`;
              await FileSystem.writeFileAsync(stringsOutputFilePath, locFileJson, {
                ensureFolderExists: true
              });
            })
          );
        };
      }

      const locTypingsGenerator: LocTypingsGenerator = new LocTypingsGenerator(locTypingsGeneratorOptions);

      await locTypingsGenerator.generateTypingsAsync();
      if (isWatchMode) {
        Async.runWatcherWithErrorHandling(async () => await locTypingsGenerator.runWatcherAsync(), logger);
      }
    }
  }

  private async _loadLocTypingsConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    logger: ScopedLogger
  ): Promise<INodeLocConfigurationJson | undefined> {
    const { buildFolder } = heftConfiguration;
    return await NodeLocPlugin._getLocTypingsConfigurationLoader().tryLoadConfigurationFileForProjectAsync(
      logger.terminal,
      buildFolder,
      heftConfiguration.rigConfig
    );
  }

  private static _getLocTypingsConfigurationLoader(): ConfigurationFile<INodeLocConfigurationJson> {
    if (!NodeLocPlugin._locTypingsConfigurationLoader) {
      NodeLocPlugin._locTypingsConfigurationLoader = new ConfigurationFile<INodeLocConfigurationJson>({
        projectRelativeFilePath: NODE_LOC_CONFIGURATION_LOCATION,
        jsonSchemaPath: PLUGIN_SCHEMA_PATH,
        jsonPathMetadata: {
          '$.generatedTsFolder.*': {
            pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
          },
          '$.srcFolder.*': {
            pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
          }
        }
      });
    }
    return NodeLocPlugin._locTypingsConfigurationLoader;
  }
}
