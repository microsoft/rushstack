// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftTaskPlugin,
  IHeftTaskRunIncrementalHookOptions,
  IWatchedFileState
} from '@rushstack/heft';
import type { ITerminal } from '@rushstack/terminal';

import { JsonSchemaTypingsGenerator } from './JsonSchemaTypingsGenerator';

const PLUGIN_NAME: 'json-schema-typings-plugin' = 'json-schema-typings-plugin';

// TODO: Replace this with usage of this plugin after this plugin is published
export interface IJsonSchemaTypingsPluginOptions {
  srcFolder?: string;
  generatedTsFolders?: string[];
}

export default class JsonSchemaTypingsPlugin implements IHeftTaskPlugin<IJsonSchemaTypingsPluginOptions> {
  /**
   * Generate typings for JSON Schemas.
   */
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IJsonSchemaTypingsPluginOptions
  ): void {
    const {
      logger: { terminal },
      hooks: { run, runIncremental }
    } = taskSession;
    const { buildFolderPath } = heftConfiguration;
    const { srcFolder = 'src', generatedTsFolders = ['temp/schemas-ts'] } = options;

    const resolvedTsFolders: string[] = [];
    for (const generatedTsFolder of generatedTsFolders) {
      resolvedTsFolders.push(`${buildFolderPath}/${generatedTsFolder}`);
    }

    const [generatedTsFolder, ...secondaryGeneratedTsFolders] = resolvedTsFolders;

    const typingsGenerator: JsonSchemaTypingsGenerator = new JsonSchemaTypingsGenerator({
      srcFolder: `${buildFolderPath}/${srcFolder}`,
      generatedTsFolder,
      secondaryGeneratedTsFolders,
      terminal
    });

    run.tapPromise(PLUGIN_NAME, async () => {
      await this._runTypingsGeneratorAsync(typingsGenerator, terminal, undefined);
    });

    runIncremental.tapPromise(
      PLUGIN_NAME,
      async (runIncrementalOptions: IHeftTaskRunIncrementalHookOptions) => {
        await this._runTypingsGeneratorAsync(typingsGenerator, terminal, runIncrementalOptions);
      }
    );
  }

  private async _runTypingsGeneratorAsync(
    typingsGenerator: JsonSchemaTypingsGenerator,
    terminal: ITerminal,
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

    terminal.writeLine('Generating typings for JSON schemas...');
    await typingsGenerator.generateTypingsAsync(changedRelativeFilePaths);
  }
}
