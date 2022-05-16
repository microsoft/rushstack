// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  HeftConfiguration,
  HeftSession,
  IBuildStageContext,
  IHeftPlugin,
  IPreCompileSubstage,
  ScopedLogger
} from '@rushstack/heft';
import { ConfigurationFile, PathResolutionMethod } from '@rushstack/heft-config-file';
import { JsonSchema } from '@rushstack/node-core-library';
import { TypingsGenerator as LocTypingsGenerator } from '@rushstack/localization-plugin';

import { Async } from './utilities/Async';

export interface ILocTypingsConfigurationJson {
  srcFolder: string;
  generatedTsFolder: string;
  exportAsDefault?: boolean;
}

const PLUGIN_NAME: string = 'LocTypingsPlugin';
const PLUGIN_SCHEMA_PATH: string = `${__dirname}/schemas/heft-loc-typings-plugin.schema.json`;
const LOC_TYPINGS_CONFIGURATION_LOCATION: string = 'config/loc-typings.json';

export class LocTypingsPlugin implements IHeftPlugin {
  private static _locTypingsConfigurationLoader: ConfigurationFile<ILocTypingsConfigurationJson> | undefined;

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
    const locTypingsConfiguration: ILocTypingsConfigurationJson | undefined =
      await this._loadLocTypingsConfigurationAsync(heftConfiguration, logger);
    if (locTypingsConfiguration) {
      const locTypingsGenerator: LocTypingsGenerator = new LocTypingsGenerator({
        srcFolder: locTypingsConfiguration.srcFolder,
        generatedTsFolder: locTypingsConfiguration.generatedTsFolder,
        exportAsDefault: locTypingsConfiguration.exportAsDefault
      });

      await locTypingsGenerator.generateTypingsAsync();
      if (isWatchMode) {
        Async.runWatcherWithErrorHandling(async () => await locTypingsGenerator.runWatcherAsync(), logger);
      }
    }
  }

  private async _loadLocTypingsConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    logger: ScopedLogger
  ): Promise<ILocTypingsConfigurationJson | undefined> {
    const { buildFolder } = heftConfiguration;
    return await LocTypingsPlugin._getLocTypingsConfigurationLoader().tryLoadConfigurationFileForProjectAsync(
      logger.terminal,
      buildFolder,
      heftConfiguration.rigConfig
    );
  }

  private static _getLocTypingsConfigurationLoader(): ConfigurationFile<ILocTypingsConfigurationJson> {
    if (!LocTypingsPlugin._locTypingsConfigurationLoader) {
      LocTypingsPlugin._locTypingsConfigurationLoader = new ConfigurationFile<ILocTypingsConfigurationJson>({
        projectRelativeFilePath: LOC_TYPINGS_CONFIGURATION_LOCATION,
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
    return LocTypingsPlugin._locTypingsConfigurationLoader;
  }
}
