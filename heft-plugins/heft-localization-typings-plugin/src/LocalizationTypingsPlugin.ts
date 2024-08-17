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
import { Path } from '@rushstack/node-core-library';

export interface ILocalizationTypingsPluginOptions {
  /**
   * Setting this option wraps the typings export in a default property.
   */
  exportAsDefault?: boolean;

  /**
   * Additional folders, relative to the project root, where the generated typings should be emitted to.
   */
  secondaryGeneratedTsFolders?: string[];

  /**
   * When `exportAsDefault` is true and this option is true, the default export interface name will be inferred
   * from the filename.
   */
  inferDefaultExportInterfaceNameFromFilename?: boolean;

  /**
   * When `exportAsDefault` is true, this value is placed in a documentation comment for the
   * exported default interface. Ignored when `exportAsDefault` is false.
   */
  exportAsDefaultDocumentationComment?: string;

  /**
   * An array of string names to ignore when generating typings.
   */
  stringNamesToIgnore?: string[];
}

const PLUGIN_NAME: 'localization-typings-plugin' = 'localization-typings-plugin';

export default class LocalizationTypingsPlugin implements IHeftTaskPlugin<ILocalizationTypingsPluginOptions> {
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options?: ILocalizationTypingsPluginOptions
  ): void {
    const slashNormalizedBuildFolderPath: string = Path.convertToSlashes(heftConfiguration.buildFolderPath);

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async () => {
      await this._runLocalizationTypingsGeneratorAsync(taskSession, slashNormalizedBuildFolderPath, options);
    });

    taskSession.hooks.runIncremental.tapPromise(
      PLUGIN_NAME,
      async (runIncrementalOptions: IHeftTaskRunIncrementalHookOptions) => {
        await this._runLocalizationTypingsGeneratorAsync(
          taskSession,
          slashNormalizedBuildFolderPath,
          options,
          runIncrementalOptions
        );
      }
    );
  }

  private async _runLocalizationTypingsGeneratorAsync(
    taskSession: IHeftTaskSession,
    slashNormalizedBuildFolderPath: string,
    {
      exportAsDefault,
      secondaryGeneratedTsFolders: secondaryGeneratedTsFoldersFromOptions,
      exportAsDefaultDocumentationComment,
      inferDefaultExportInterfaceNameFromFilename,
      stringNamesToIgnore
    }: ILocalizationTypingsPluginOptions | undefined = {},
    runIncrementalOptions?: IHeftTaskRunIncrementalHookOptions
  ): Promise<void> {
    const logger: IScopedLogger = taskSession.logger;
    const generatedTsFolderPath: string = `${slashNormalizedBuildFolderPath}/temp/loc-ts`;

    let secondaryGeneratedTsFolders: string[] | undefined;
    if (secondaryGeneratedTsFoldersFromOptions) {
      secondaryGeneratedTsFolders = [];
      for (const secondaryGeneratedTsFolder of secondaryGeneratedTsFoldersFromOptions) {
        secondaryGeneratedTsFolders.push(`${slashNormalizedBuildFolderPath}/${secondaryGeneratedTsFolder}`);
      }
    }

    const resxTypingsGenerator: TypingsGenerator = new TypingsGenerator({
      srcFolder: `${slashNormalizedBuildFolderPath}/src`,
      generatedTsFolder: generatedTsFolderPath,
      terminal: logger.terminal,
      ignoreString: stringNamesToIgnore
        ? (stringName: string) => stringNamesToIgnore.includes(stringName)
        : undefined,
      exportAsDefault,
      secondaryGeneratedTsFolders,
      exportAsDefaultDocumentationComment,
      inferDefaultExportInterfaceNameFromFilename
    });

    // If we have the incremental options, use them to determine which files to process.
    // Otherwise, process all files. The typings generator also provides the file paths
    // as relative paths from the sourceFolderPath.
    let changedRelativeFilePaths: string[] | undefined;
    if (runIncrementalOptions) {
      changedRelativeFilePaths = [];
      const relativeFilePaths: Map<string, IWatchedFileState> = await runIncrementalOptions.watchGlobAsync(
        resxTypingsGenerator.inputFileGlob,
        {
          cwd: resxTypingsGenerator.sourceFolderPath,
          ignore: Array.from(resxTypingsGenerator.ignoredFileGlobs),
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

    taskSession.logger.terminal.writeLine('Generating localization typings...');
    await resxTypingsGenerator.generateTypingsAsync(changedRelativeFilePaths);
  }
}
