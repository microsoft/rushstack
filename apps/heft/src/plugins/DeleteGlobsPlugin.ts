// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import glob from 'glob';
import { FileSystem, LegacyAdapters, Async, ITerminal } from '@rushstack/node-core-library';

import { Constants } from '../utilities/Constants';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type { HeftTaskSession, IHeftTaskRunHookOptions } from '../pluginFramework/HeftTaskSession';

// No @types/glob-escape package exists
const globEscape: (unescaped: string) => string = require('glob-escape');

interface IDeleteGlobsPluginOptions {
  globsToDelete: string[];
}

export class DeleteGlobsPlugin implements IHeftTaskPlugin<IDeleteGlobsPluginOptions> {
  public readonly accessor?: object | undefined;

  public apply(
    taskSession: HeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IDeleteGlobsPluginOptions
  ): void {
    taskSession.hooks.run.tapAsync(taskSession.taskName, async (runOptions: IHeftTaskRunHookOptions) => {
      await this._deleteGlobsAsync(taskSession.logger.terminal, heftConfiguration, pluginOptions);
    });
  }

  private async _deleteGlobsAsync(
    terminal: ITerminal,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IDeleteGlobsPluginOptions,
    additionalPathsToDelete?: string[]
  ): Promise<void> {
    let deletedFiles: number = 0;
    let deletedFolders: number = 0;

    const pathsToDelete: Set<string> = new Set<string>(additionalPathsToDelete);
    await Async.forEachAsync(
      pluginOptions.globsToDelete,
      async (globPattern: string) => {
        const resolvedPaths: string[] = await this._resolvePathAsync(
          globPattern,
          heftConfiguration.buildFolder
        );
        for (const resolvedPath of resolvedPaths) {
          pathsToDelete.add(resolvedPath);
        }
      },
      { concurrency: Constants.maxParallelism }
    );

    await Async.forEachAsync(
      pathsToDelete,
      async (pathToDelete: string) => {
        try {
          await FileSystem.deleteFileAsync(pathToDelete, { throwIfNotExists: true });
          terminal.writeVerboseLine(`Deleted "${pathToDelete}"`);
          deletedFiles++;
        } catch (error) {
          // If it doesn't exist, we can ignore the error
          if (!FileSystem.isNotExistError(error)) {
            // Happens when trying to delete a folder as if it was a file
            if (FileSystem.isUnlinkNotPermittedError(error)) {
              await FileSystem.deleteFolderAsync(pathToDelete);
              terminal.writeVerboseLine(`Deleted folder "${pathToDelete}"`);
              deletedFolders++;
            } else {
              throw error;
            }
          }
        }
      },
      { concurrency: Constants.maxParallelism }
    );

    if (deletedFiles > 0 || deletedFolders > 0) {
      terminal.writeLine(
        `Deleted ${deletedFiles} file${deletedFiles !== 1 ? 's' : ''} ` +
          `and ${deletedFolders} folder${deletedFolders !== 1 ? 's' : ''}`
      );
    }
  }

  private async _resolvePathAsync(globPattern: string, buildFolder: string): Promise<string[]> {
    if (globEscape(globPattern) !== globPattern) {
      const expandedGlob: string[] = await LegacyAdapters.convertCallbackToPromise(glob, globPattern, {
        cwd: buildFolder
      });

      const result: string[] = [];
      for (const pathFromGlob of expandedGlob) {
        result.push(path.resolve(buildFolder, pathFromGlob));
      }

      return result;
    } else {
      return [path.resolve(buildFolder, globPattern)];
    }
  }
}

export default new DeleteGlobsPlugin() as IHeftTaskPlugin<IDeleteGlobsPluginOptions>;
