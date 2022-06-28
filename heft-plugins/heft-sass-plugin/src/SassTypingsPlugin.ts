// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftPlugin,
  IHeftTaskCleanHookOptions,
  IHeftTaskRunHookOptions,
  IScopedLogger
} from '@rushstack/heft';
import { ConfigurationFile, PathResolutionMethod } from '@rushstack/heft-config-file';

import { ISassConfiguration, SassTypingsGenerator } from './SassTypingsGenerator';
import { Async } from './utilities/Async';

export interface ISassConfigurationJson extends ISassConfiguration {}

const PLUGIN_NAME: string = 'SassTypingsPlugin';
const PLUGIN_SCHEMA_PATH: string = `${__dirname}/schemas/heft-sass-plugin.schema.json`;
const SASS_CONFIGURATION_LOCATION: string = 'config/sass.json';

export default class SassTypingsPlugin implements IHeftPlugin {
  private static _sassConfigurationLoader: ConfigurationFile<ISassConfigurationJson> | undefined;

  /**
   * Generate typings for Sass files before TypeScript compilation.
   */
  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    taskSession.hooks.clean.tapPromise(PLUGIN_NAME, async (cleanOptions: IHeftTaskCleanHookOptions) => {
      // No-op. Currently relies on the TypeScript plugin to clean up the generated typings.
    });

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      // TODO: Handle watch mode
      await this._runSassTypingsGeneratorAsync(taskSession, heftConfiguration, false);
    });
  }

  private async _runSassTypingsGeneratorAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    isWatchMode: boolean
  ): Promise<void> {
    const sassConfiguration: ISassConfiguration = await this._loadSassConfigurationAsync(
      heftConfiguration,
      taskSession.logger
    );
    const sassTypingsGenerator: SassTypingsGenerator = new SassTypingsGenerator({
      buildFolder: heftConfiguration.buildFolder,
      sassConfiguration
    });

    await sassTypingsGenerator.generateTypingsAsync();
    if (isWatchMode) {
      Async.runWatcherWithErrorHandling(
        async () => await sassTypingsGenerator.runWatcherAsync(),
        taskSession.logger
      );
    }
  }

  private async _loadSassConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    logger: IScopedLogger
  ): Promise<ISassConfiguration> {
    const { buildFolder } = heftConfiguration;
    const sassConfigurationJson: ISassConfigurationJson | undefined =
      await SassTypingsPlugin._getSassConfigurationLoader().tryLoadConfigurationFileForProjectAsync(
        logger.terminal,
        buildFolder,
        heftConfiguration.rigConfig
      );

    return {
      ...sassConfigurationJson
    };
  }

  private static _getSassConfigurationLoader(): ConfigurationFile<ISassConfigurationJson> {
    if (!SassTypingsPlugin._sassConfigurationLoader) {
      SassTypingsPlugin._sassConfigurationLoader = new ConfigurationFile<ISassConfigurationJson>({
        projectRelativeFilePath: SASS_CONFIGURATION_LOCATION,
        jsonSchemaPath: PLUGIN_SCHEMA_PATH,
        jsonPathMetadata: {
          '$.importIncludePaths.*': {
            pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
          },
          '$.generatedTsFolder.*': {
            pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
          },
          '$.srcFolder.*': {
            pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
          },
          '$.cssOutputFolders.*': {
            pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
          }
        }
      });
    }
    return SassTypingsPlugin._sassConfigurationLoader;
  }
}
