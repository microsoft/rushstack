// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'path';
import { FileSystem } from '@rushstack/node-core-library';
import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftPlugin,
  IScopedLogger,
  IHeftTaskCleanHookOptions,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions
} from '@rushstack/heft';
import { ConfigurationFile } from '@rushstack/heft-config-file';

import { ISassConfiguration, SassProcessor } from './SassProcessor';

export interface ISassConfigurationJson extends Partial<ISassConfiguration> {}

const PLUGIN_NAME: string = 'SassPlugin';
const PLUGIN_SCHEMA_PATH: string = `${__dirname}/schemas/heft-sass-plugin.schema.json`;
const SASS_CONFIGURATION_LOCATION: string = 'config/sass.json';

export default class SassPlugin implements IHeftPlugin {
  private static _sassConfigurationLoader: ConfigurationFile<ISassConfigurationJson> | undefined;
  private _sassConfiguration: ISassConfiguration | undefined;
  private _sassProcessor: SassProcessor | undefined;

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
      await this._runSassTypingsGeneratorAsync(taskSession, heftConfiguration);
    });

    taskSession.hooks.runIncremental.tapPromise(
      PLUGIN_NAME,
      async (runIncrementalOptions: IHeftTaskRunIncrementalHookOptions) => {
        await this._runSassTypingsGeneratorAsync(taskSession, heftConfiguration, runIncrementalOptions);
      }
    );
  }

  private async _runSassTypingsGeneratorAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    runIncrementalOptions?: IHeftTaskRunIncrementalHookOptions
  ): Promise<void> {
    taskSession.logger.terminal.writeVerboseLine('Starting sass typings generation...');
    const sassProcessor: SassProcessor = await this._loadSassProcessorAsync(
      heftConfiguration,
      taskSession.logger
    );
    // If we have the incremental options, use them to determine which files to process.
    // Otherwise, process all files. The typings generator also provides the file paths
    // as relative paths from the sourceFolderPath.
    let changedFilePaths: string[] | undefined;
    if (runIncrementalOptions) {
      changedFilePaths = [];
      const filePaths: string[] = runIncrementalOptions.globChangedFiles(sassProcessor.inputFileGlob, {
        cwd: sassProcessor.sourceFolderPath,
        ignore: Array.from(sassProcessor.ignoredFileGlobs)
      });
      const deleteFilePromises: Promise<void>[] = [];
      for (const filePath of filePaths) {
        // Filter out and delete any files that are removed and all their output files
        const absoluteFilePath: string = path.join(sassProcessor.sourceFolderPath, filePath);
        if (runIncrementalOptions.changedFiles.get(absoluteFilePath)!.version === undefined) {
          const deletePromises: Promise<void>[] = sassProcessor
            .getOutputFilePaths(filePath)
            .map(async (outputFilePath) => {
              await FileSystem.deleteFileAsync(outputFilePath);
            });
          for (const deletePromise of deletePromises) {
            deleteFilePromises.push(deletePromise);
          }
        } else {
          changedFilePaths.push(filePath);
        }
      }
      await Promise.all(deleteFilePromises);
    }

    await sassProcessor.generateTypingsAsync(changedFilePaths);
    taskSession.logger.terminal.writeLine('Generated sass typings');
  }

  private async _loadSassProcessorAsync(
    heftConfiguration: HeftConfiguration,
    logger: IScopedLogger
  ): Promise<SassProcessor> {
    if (!this._sassProcessor) {
      const sassConfiguration: ISassConfiguration = await this._loadSassConfigurationAsync(
        heftConfiguration,
        logger
      );
      this._sassProcessor = new SassProcessor({
        sassConfiguration,
        buildFolderPath: heftConfiguration.buildFolderPath
      });
    }
    return this._sassProcessor;
  }

  private async _loadSassConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    logger: IScopedLogger
  ): Promise<ISassConfiguration> {
    if (!this._sassConfiguration) {
      const { buildFolderPath } = heftConfiguration;
      if (!SassPlugin._sassConfigurationLoader) {
        SassPlugin._sassConfigurationLoader = new ConfigurationFile<ISassConfigurationJson>({
          projectRelativeFilePath: SASS_CONFIGURATION_LOCATION,
          jsonSchemaPath: PLUGIN_SCHEMA_PATH
        });
      }

      const sassConfigurationJson: ISassConfigurationJson | undefined =
        await SassPlugin._sassConfigurationLoader.tryLoadConfigurationFileForProjectAsync(
          logger.terminal,
          buildFolderPath,
          heftConfiguration.rigConfig
        );
      if (sassConfigurationJson) {
        if (sassConfigurationJson.srcFolder) {
          sassConfigurationJson.srcFolder = path.resolve(buildFolderPath, sassConfigurationJson.srcFolder);
        }

        if (sassConfigurationJson.generatedTsFolder) {
          sassConfigurationJson.generatedTsFolder = path.resolve(
            buildFolderPath,
            sassConfigurationJson.generatedTsFolder
          );
        }

        function resolveFolderArray(folders: string[] | undefined): void {
          if (folders) {
            for (let i: number = 0; i < folders.length; i++) {
              folders[i] = path.resolve(buildFolderPath, folders[i]);
            }
          }
        }

        resolveFolderArray(sassConfigurationJson.cssOutputFolders);
        resolveFolderArray(sassConfigurationJson.secondaryGeneratedTsFolders);
      }

      // Set defaults if no configuration file or option was found
      this._sassConfiguration = {
        srcFolder: `${buildFolderPath}/src`,
        generatedTsFolder: `${buildFolderPath}/temp/sass-ts`,
        exportAsDefault: true,
        fileExtensions: ['.sass', '.scss', '.css'],
        importIncludePaths: [`${buildFolderPath}/node_modules`, `${buildFolderPath}/src`],
        ...sassConfigurationJson
      };
    }

    return this._sassConfiguration;
  }
}
