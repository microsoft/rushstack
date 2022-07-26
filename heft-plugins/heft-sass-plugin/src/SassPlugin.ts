// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'path';
import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftPlugin,
  IHeftTaskCleanHookOptions,
  IHeftTaskRunHookOptions,
  IScopedLogger
} from '@rushstack/heft';
import { ConfigurationFile } from '@rushstack/heft-config-file';

import { ISassConfiguration, SassProcessor } from './SassProcessor';
import { Async } from './utilities/Async';

export interface ISassConfigurationJson extends Partial<ISassConfiguration> {}

const PLUGIN_NAME: string = 'SassPlugin';
const PLUGIN_SCHEMA_PATH: string = `${__dirname}/schemas/heft-sass-plugin.schema.json`;
const SASS_CONFIGURATION_LOCATION: string = 'config/sass.json';

export default class SassPlugin implements IHeftPlugin {
  private static _sassConfigurationLoader: ConfigurationFile<ISassConfigurationJson> | undefined;

  /**
   * Generate typings for Sass files before TypeScript compilation.
   */
  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    taskSession.hooks.clean.tapPromise(PLUGIN_NAME, async (cleanOptions: IHeftTaskCleanHookOptions) => {
      const sassConfiguration: ISassConfiguration = await this._loadSassConfigurationAsync(
        heftConfiguration,
        taskSession.logger
      );
      cleanOptions.addDeleteOperations({ sourcePath: sassConfiguration.generatedTsFolder });
      for (const secondaryGeneratedTsFolder of sassConfiguration.secondaryGeneratedTsFolders || []) {
        cleanOptions.addDeleteOperations({ sourcePath: secondaryGeneratedTsFolder });
      }
      for (const cssOutputFolder of sassConfiguration.cssOutputFolders || []) {
        cleanOptions.addDeleteOperations({ sourcePath: cssOutputFolder });
      }
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
    const sassTypingsGenerator: SassProcessor = new SassProcessor({ sassConfiguration });
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

    // Set defaults if no configuration file or option was found
    return {
      srcFolder: `${buildFolder}/src`,
      generatedTsFolder: `${buildFolder}/temp/sass-ts`,
      exportAsDefault: true,
      fileExtensions: ['.sass', '.scss', '.css'],
      importIncludePaths: [`${buildFolder}/node_modules`, `${buildFolder}/src`],
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
