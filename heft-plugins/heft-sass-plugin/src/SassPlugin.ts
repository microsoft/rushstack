// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'path';
import type {
  HeftConfiguration,
  HeftSession,
  IBuildStageContext,
  IHeftPlugin,
  IPreCompileSubstage,
  ScopedLogger
} from '@rushstack/heft';
import { ConfigurationFile } from '@rushstack/heft-config-file';
import { JsonSchema } from '@rushstack/node-core-library';

import { ISassConfiguration, SassProcessor } from './SassProcessor';
import { Async } from './utilities/Async';

export interface ISassConfigurationJson extends ISassConfiguration {}

const PLUGIN_NAME: string = 'SassTypingsPlugin';
const PLUGIN_SCHEMA_PATH: string = `${__dirname}/schemas/heft-sass-plugin.schema.json`;
const SASS_CONFIGURATION_LOCATION: string = 'config/sass.json';

export class SassPlugin implements IHeftPlugin {
  private static _sassConfigurationLoader: ConfigurationFile<ISassConfigurationJson> | undefined;

  public readonly pluginName: string = PLUGIN_NAME;
  public readonly optionsSchema: JsonSchema = JsonSchema.fromFile(PLUGIN_SCHEMA_PATH);

  /**
   * Generate typings for Sass files before TypeScript compilation.
   */
  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.preCompile.tap(PLUGIN_NAME, (preCompile: IPreCompileSubstage) => {
        preCompile.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._runSassTypingsGeneratorAsync(
            heftSession,
            heftConfiguration,
            build.properties.watchMode
          );
        });
      });
    });
  }

  private async _runSassTypingsGeneratorAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    isWatchMode: boolean
  ): Promise<void> {
    const logger: ScopedLogger = heftSession.requestScopedLogger('sass-typings-generator');
    const sassConfiguration: ISassConfiguration = await this._loadSassConfigurationAsync(
      heftConfiguration,
      logger
    );
    const sassTypingsGenerator: SassProcessor = new SassProcessor({
      buildFolder: heftConfiguration.buildFolder,
      sassConfiguration
    });

    await sassTypingsGenerator.generateTypingsAsync();
    if (isWatchMode) {
      Async.runWatcherWithErrorHandling(async () => await sassTypingsGenerator.runWatcherAsync(), logger);
    }
  }

  private async _loadSassConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    logger: ScopedLogger
  ): Promise<ISassConfiguration> {
    const { buildFolder } = heftConfiguration;
    const sassConfigurationJson: ISassConfigurationJson | undefined =
      await SassPlugin._getSassConfigurationLoader().tryLoadConfigurationFileForProjectAsync(
        logger.terminal,
        buildFolder,
        heftConfiguration.rigConfig
      );

    if (sassConfigurationJson) {
      if (sassConfigurationJson.srcFolder) {
        sassConfigurationJson.srcFolder = path.resolve(buildFolder, sassConfigurationJson.srcFolder);
      }

      if (sassConfigurationJson.generatedTsFolder) {
        sassConfigurationJson.generatedTsFolder = path.resolve(
          buildFolder,
          sassConfigurationJson.generatedTsFolder
        );
      }

      function resolveFolderArray(folders: string[] | undefined): void {
        if (folders) {
          for (let i: number = 0; i < folders.length; i++) {
            folders[i] = path.resolve(buildFolder, folders[i]);
          }
        }
      }

      resolveFolderArray(sassConfigurationJson.cssOutputFolders);
      resolveFolderArray(sassConfigurationJson.secondaryGeneratedTsFolders);
    }

    return {
      ...sassConfigurationJson
    };
  }

  private static _getSassConfigurationLoader(): ConfigurationFile<ISassConfigurationJson> {
    if (!SassPlugin._sassConfigurationLoader) {
      SassPlugin._sassConfigurationLoader = new ConfigurationFile<ISassConfigurationJson>({
        projectRelativeFilePath: SASS_CONFIGURATION_LOCATION,
        jsonSchemaPath: PLUGIN_SCHEMA_PATH
      });
    }
    return SassPlugin._sassConfigurationLoader;
  }
}
