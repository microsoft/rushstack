// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  HeftConfiguration,
  IHeftTaskPlugin,
  IHeftTaskRunIncrementalHookOptions,
  IHeftTaskSession,
  IScopedLogger,
  IWatchedFileState
} from '@rushstack/heft';
import { TypingsGenerator } from '@rushstack/localization-utilities';

import type { HeftLocalizationTypingsPluginOptions as ILocalizationTypingsPluginOptions } from './schemas/heft-localization-typings-plugin.schema.json.d.ts';

const PLUGIN_NAME: 'localization-typings-plugin' = 'localization-typings-plugin';

export default class LocalizationTypingsPlugin implements IHeftTaskPlugin<ILocalizationTypingsPluginOptions> {
  public apply(
    taskSession: IHeftTaskSession,
    { slashNormalizedBuildFolderPath }: HeftConfiguration,
    options?: ILocalizationTypingsPluginOptions
  ): void {
    const {
      srcFolder,
      generatedTsFolder,
      stringNamesToIgnore,
      secondaryGeneratedTsFolders: secondaryGeneratedTsFoldersFromOptions,
      trimmedJsonOutputFolders: trimmedJsonOutputFoldersFromOptions
    } = options ?? {};

    let secondaryGeneratedTsFolders: string[] | undefined;
    if (secondaryGeneratedTsFoldersFromOptions) {
      secondaryGeneratedTsFolders = [];
      for (const secondaryGeneratedTsFolder of secondaryGeneratedTsFoldersFromOptions) {
        secondaryGeneratedTsFolders.push(`${slashNormalizedBuildFolderPath}/${secondaryGeneratedTsFolder}`);
      }
    }

    let trimmedJsonOutputFolders: string[] | undefined;
    if (trimmedJsonOutputFoldersFromOptions) {
      trimmedJsonOutputFolders = [];
      for (const trimmedJsonOutputFolder of trimmedJsonOutputFoldersFromOptions) {
        trimmedJsonOutputFolders.push(`${slashNormalizedBuildFolderPath}/${trimmedJsonOutputFolder}`);
      }
    }

    const logger: IScopedLogger = taskSession.logger;
    const stringNamesToIgnoreSet: Set<string> | undefined = stringNamesToIgnore
      ? new Set(stringNamesToIgnore)
      : undefined;

    const typingsGenerator: TypingsGenerator = new TypingsGenerator({
      ...options,
      srcFolder: `${slashNormalizedBuildFolderPath}/${srcFolder ?? 'src'}`,
      generatedTsFolder: `${slashNormalizedBuildFolderPath}/${generatedTsFolder ?? 'temp/loc-ts'}`,
      terminal: logger.terminal,
      ignoreString: stringNamesToIgnoreSet
        ? (filePath: string, stringName: string) => stringNamesToIgnoreSet.has(stringName)
        : undefined,
      secondaryGeneratedTsFolders
    });

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async () => {
      await this._runLocalizationTypingsGeneratorAsync(typingsGenerator, logger, undefined);
    });

    taskSession.hooks.runIncremental.tapPromise(
      PLUGIN_NAME,
      async (runIncrementalOptions: IHeftTaskRunIncrementalHookOptions) => {
        await this._runLocalizationTypingsGeneratorAsync(typingsGenerator, logger, runIncrementalOptions);
      }
    );
  }

  private async _runLocalizationTypingsGeneratorAsync(
    typingsGenerator: TypingsGenerator,
    { terminal }: IScopedLogger,
    runIncrementalOptions: IHeftTaskRunIncrementalHookOptions | undefined
  ): Promise<void> {
    // If we have the incremental options, use them to determine which files to process.
    // Otherwise, process all files. The typings generator also provides the file paths
    // as relative paths from the sourceFolderPath.
    let changedRelativeFilePaths: string[] | undefined;
    if (runIncrementalOptions) {
      changedRelativeFilePaths = [];
      const relativeFilePaths: Map<string, IWatchedFileState> = await runIncrementalOptions.watchGlobAsync(
        typingsGenerator.inputFileGlob,
        {
          cwd: typingsGenerator.sourceFolderPath,
          ignore: Array.from(typingsGenerator.ignoredFileGlobs),
          absolute: false
        }
      );
      for (const [relativeFilePath, { changed }] of relativeFilePaths) {
        if (changed) {
          changedRelativeFilePaths.push(relativeFilePath);
        }
      }
      if (changedRelativeFilePaths.length === 0) {
        return;
      }
    }

    terminal.writeLine('Generating localization typings...');
    await typingsGenerator.generateTypingsAsync(changedRelativeFilePaths);
  }
}
