// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import path from 'node:path';

import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftPlugin,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions,
  IWatchedFileState,
  ConfigurationFile
} from '@rushstack/heft';

import { type ICssOutputFolder, type ISassProcessorOptions, SassProcessor } from './SassProcessor';
import sassConfigSchema from './schemas/heft-sass-plugin.schema.json';

export interface ISassConfigurationJson {
  srcFolder?: string;
  generatedTsFolder?: string;
  cssOutputFolders?: (string | ICssOutputFolder)[];
  secondaryGeneratedTsFolders?: string[];
  exportAsDefault?: boolean;
  fileExtensions?: string[];
  nonModuleFileExtensions?: string[];
  silenceDeprecations?: string[];
}

const PLUGIN_NAME: 'sass-plugin' = 'sass-plugin';
const SASS_CONFIGURATION_LOCATION: string = 'config/sass.json';

const SASS_CONFIGURATION_FILE_SPECIFICATION: ConfigurationFile.IProjectConfigurationFileSpecification<ISassConfigurationJson> =
  {
    projectRelativeFilePath: SASS_CONFIGURATION_LOCATION,
    jsonSchemaObject: sassConfigSchema
  };

export default class SassPlugin implements IHeftPlugin {
  /**
   * Generate typings for Sass files before TypeScript compilation.
   */
  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    const { numberOfCores, slashNormalizedBuildFolderPath, rigConfig } = heftConfiguration;
    const { logger, tempFolderPath } = taskSession;

    const { terminal } = logger;

    let sassProcessorPromise: Promise<SassProcessor> | undefined;
    function initializeSassProcessor(): Promise<SassProcessor> {
      if (sassProcessorPromise) {
        return sassProcessorPromise;
      }

      return (sassProcessorPromise = (async (): Promise<SassProcessor> => {
        const sassConfigurationJson: ISassConfigurationJson | undefined =
          await heftConfiguration.tryLoadProjectConfigurationFileAsync(
            SASS_CONFIGURATION_FILE_SPECIFICATION,
            terminal
          );

        const {
          generatedTsFolder = 'temp/sass-ts',
          srcFolder = 'src',
          cssOutputFolders,
          secondaryGeneratedTsFolders,
          exportAsDefault = true,
          fileExtensions,
          nonModuleFileExtensions,
          silenceDeprecations
        } = sassConfigurationJson || {};

        function resolveFolder(folder: string): string {
          return path.resolve(slashNormalizedBuildFolderPath, folder);
        }

        const sassProcessorOptions: ISassProcessorOptions = {
          buildFolder: slashNormalizedBuildFolderPath,
          concurrency: numberOfCores,
          dtsOutputFolders: [generatedTsFolder, ...(secondaryGeneratedTsFolders || [])].map(resolveFolder),
          logger,
          exportAsDefault,
          srcFolder: resolveFolder(srcFolder),
          fileExtensions,
          nonModuleFileExtensions,
          cssOutputFolders: cssOutputFolders?.map((folder: string | ICssOutputFolder) => {
            const folderPath: string = typeof folder === 'string' ? folder : folder.folder;
            const shimType: 'commonjs' | 'esm' | undefined =
              typeof folder === 'string' ? undefined : folder.shimType;
            return {
              folder: resolveFolder(folderPath),
              shimType
            };
          }),
          silenceDeprecations
        };

        const sassProcessor: SassProcessor = new SassProcessor(sassProcessorOptions);

        await sassProcessor.loadCacheAsync(tempFolderPath);

        return sassProcessor;
      })());
    }

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      terminal.writeLine(`Initializing SASS compiler...`);
      const sassProcessor: SassProcessor = await initializeSassProcessor();

      terminal.writeLine(`Scanning for SCSS files...`);
      const files: string[] = await runOptions.globAsync(sassProcessor.inputFileGlob, {
        absolute: true,
        ignore: sassProcessor.ignoredFileGlobs,
        cwd: sassProcessor.sourceFolderPath
      });

      const fileSet: Set<string> = new Set();
      for (const file of files) {
        // Using path.resolve to normalize slashes
        fileSet.add(path.resolve(file));
      }

      await sassProcessor.compileFilesAsync(fileSet);
      terminal.writeLine(`Finished compiling.`);
    });

    taskSession.hooks.runIncremental.tapPromise(
      PLUGIN_NAME,
      async (runOptions: IHeftTaskRunIncrementalHookOptions) => {
        terminal.writeLine(`Initializing SASS compiler...`);
        const sassProcessor: SassProcessor = await initializeSassProcessor();

        terminal.writeLine(`Scanning for SCSS files...`);
        const changedFiles: Map<string, IWatchedFileState> = await runOptions.watchGlobAsync(
          sassProcessor.inputFileGlob,
          {
            absolute: true,
            cwd: sassProcessor.sourceFolderPath,
            ignore: sassProcessor.ignoredFileGlobs
          }
        );

        const modifiedFiles: Set<string> = new Set();
        for (const [file, { changed }] of changedFiles) {
          if (changed) {
            modifiedFiles.add(file);
          }
        }
        terminal.writeLine(`Compiling ${modifiedFiles.size} changed SCSS files...`);

        await sassProcessor.compileFilesAsync(modifiedFiles);
        terminal.writeLine(`Finished compiling.`);
      }
    );
  }
}
