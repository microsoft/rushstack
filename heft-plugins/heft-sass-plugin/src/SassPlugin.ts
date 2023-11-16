// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Path } from '@rushstack/node-core-library';
import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftPlugin,
  IScopedLogger,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions,
  IWatchedFileState
} from '@rushstack/heft';
import { ConfigurationFile } from '@rushstack/heft-config-file';

import { type ISassConfiguration, SassProcessor } from './SassProcessor';
import sassConfigSchema from './schemas/heft-sass-plugin.schema.json';

export interface ISassConfigurationJson extends Partial<ISassConfiguration> {}

const PLUGIN_NAME: 'sass-plugin' = 'sass-plugin';
const SASS_CONFIGURATION_LOCATION: string = 'config/sass.json';

export default class SassPlugin implements IHeftPlugin {
  private static _sassConfigurationLoader: ConfigurationFile<ISassConfigurationJson> | undefined;
  private _sassConfiguration: ISassConfiguration | undefined;
  private _sassProcessor: SassProcessor | undefined;

  /**
   * Generate typings for Sass files before TypeScript compilation.
   */
  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    const slashNormalizedBuildFolderPath: string = Path.convertToSlashes(heftConfiguration.buildFolderPath);

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      await this._runSassTypingsGeneratorAsync(
        taskSession,
        heftConfiguration,
        slashNormalizedBuildFolderPath
      );
    });

    taskSession.hooks.runIncremental.tapPromise(
      PLUGIN_NAME,
      async (runIncrementalOptions: IHeftTaskRunIncrementalHookOptions) => {
        await this._runSassTypingsGeneratorAsync(
          taskSession,
          heftConfiguration,
          slashNormalizedBuildFolderPath,
          runIncrementalOptions
        );
      }
    );
  }

  private async _runSassTypingsGeneratorAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    slashNormalizedBuildFolderPath: string,
    runIncrementalOptions?: IHeftTaskRunIncrementalHookOptions
  ): Promise<void> {
    taskSession.logger.terminal.writeVerboseLine('Starting sass typings generation...');
    const sassProcessor: SassProcessor = await this._loadSassProcessorAsync(
      heftConfiguration,
      slashNormalizedBuildFolderPath,
      taskSession.logger
    );
    // If we have the incremental options, use them to determine which files to process.
    // Otherwise, process all files. The typings generator also provides the file paths
    // as relative paths from the sourceFolderPath.
    let changedRelativeFilePaths: string[] | undefined;
    if (runIncrementalOptions) {
      changedRelativeFilePaths = [];
      const relativeFilePaths: Map<string, IWatchedFileState> = await runIncrementalOptions.watchGlobAsync(
        sassProcessor.inputFileGlob,
        {
          cwd: sassProcessor.sourceFolderPath,
          ignore: Array.from(sassProcessor.ignoredFileGlobs),
          absolute: false
        }
      );

      for (const [relativePath, { changed }] of relativeFilePaths) {
        if (changed) {
          changedRelativeFilePaths.push(relativePath);
        }
      }

      if (changedRelativeFilePaths.length === 0) {
        return;
      }
    }

    taskSession.logger.terminal.writeLine('Generating sass typings...');
    await sassProcessor.generateTypingsAsync(changedRelativeFilePaths);
    taskSession.logger.terminal.writeLine('Generated sass typings');
  }

  private async _loadSassProcessorAsync(
    heftConfiguration: HeftConfiguration,
    slashNormalizedBuildFolderPath: string,
    logger: IScopedLogger
  ): Promise<SassProcessor> {
    if (!this._sassProcessor) {
      const sassConfiguration: ISassConfiguration = await this._loadSassConfigurationAsync(
        heftConfiguration,
        slashNormalizedBuildFolderPath,
        logger
      );
      this._sassProcessor = new SassProcessor({
        sassConfiguration,
        buildFolder: slashNormalizedBuildFolderPath
      });
    }
    return this._sassProcessor;
  }

  private async _loadSassConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    slashNormalizedBuildFolderPath: string,
    logger: IScopedLogger
  ): Promise<ISassConfiguration> {
    if (!this._sassConfiguration) {
      if (!SassPlugin._sassConfigurationLoader) {
        SassPlugin._sassConfigurationLoader = new ConfigurationFile({
          projectRelativeFilePath: SASS_CONFIGURATION_LOCATION,
          jsonSchemaObject: sassConfigSchema
        });
      }

      const sassConfigurationJson: ISassConfigurationJson | undefined =
        await SassPlugin._sassConfigurationLoader.tryLoadConfigurationFileForProjectAsync(
          logger.terminal,
          slashNormalizedBuildFolderPath,
          heftConfiguration.rigConfig
        );
      if (sassConfigurationJson) {
        if (sassConfigurationJson.srcFolder) {
          sassConfigurationJson.srcFolder = `${slashNormalizedBuildFolderPath}/${sassConfigurationJson.srcFolder}`;
        }

        if (sassConfigurationJson.generatedTsFolder) {
          sassConfigurationJson.generatedTsFolder = `${slashNormalizedBuildFolderPath}/${sassConfigurationJson.generatedTsFolder}`;
        }

        function resolveFolderArray(folders: string[] | undefined): void {
          if (folders) {
            for (let i: number = 0; i < folders.length; i++) {
              folders[i] = `${slashNormalizedBuildFolderPath}/${folders[i]}`;
            }
          }
        }

        resolveFolderArray(sassConfigurationJson.cssOutputFolders);
        resolveFolderArray(sassConfigurationJson.secondaryGeneratedTsFolders);
      }

      // Set defaults if no configuration file or option was found
      this._sassConfiguration = {
        srcFolder: `${slashNormalizedBuildFolderPath}/src`,
        generatedTsFolder: `${slashNormalizedBuildFolderPath}/temp/sass-ts`,
        exportAsDefault: true,
        fileExtensions: ['.sass', '.scss', '.css'],
        importIncludePaths: [
          `${slashNormalizedBuildFolderPath}/node_modules`,
          `${slashNormalizedBuildFolderPath}/src`
        ],
        ...sassConfigurationJson
      };
    }

    return this._sassConfiguration;
  }
}
