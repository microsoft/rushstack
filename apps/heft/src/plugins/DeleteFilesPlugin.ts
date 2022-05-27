// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, Async } from '@rushstack/node-core-library';

import { Constants } from '../utilities/Constants';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type { HeftTaskSession, IHeftTaskRunHookOptions } from '../pluginFramework/HeftTaskSession';
import { getRelativeFilePathsAsync, IFileGlobSpecifier } from './FileGlobSpecifier';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';

/**
 * Used to specify a selection of source files to delete from the specified source folder.
 *
 * @public
 */
export interface IDeleteOperation extends IFileGlobSpecifier {}

interface IDeleteFilesPluginOptions {
  deleteOperations: IDeleteOperation[];
}

export class DeleteFilesPlugin implements IHeftTaskPlugin<IDeleteFilesPluginOptions> {
  public readonly accessor?: object | undefined;

  public apply(
    taskSession: HeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IDeleteFilesPluginOptions
  ): void {
    taskSession.hooks.run.tapPromise(taskSession.taskName, async (runOptions: IHeftTaskRunHookOptions) => {
      await DeleteFilesPlugin.deleteFilesAsync(pluginOptions.deleteOperations, taskSession.logger);
    });
  }

  public static async deleteFilesAsync(
    deleteOperations: IDeleteOperation[],
    logger: ScopedLogger
  ): Promise<void> {
    let deletedFiles: number = 0;
    let deletedFolders: number = 0;

    const pathsToDelete: Set<string> = new Set();

    await Async.forEachAsync(
      deleteOperations,
      async (deleteOperation: IDeleteOperation) => {
        if (
          !deleteOperation.fileExtensions?.length &&
          !deleteOperation.includeGlobs?.length &&
          !deleteOperation.excludeGlobs?.length
        ) {
          // We can optimize for folder deletions by not globbing if there are no file extensions or globs
          pathsToDelete.add(deleteOperation.sourceFolder);
          return;
        }

        const sourceFileRelativePaths: Set<string> = await getRelativeFilePathsAsync(deleteOperation);
        for (const sourceFileRelativePath of sourceFileRelativePaths) {
          pathsToDelete.add(path.resolve(deleteOperation.sourceFolder, sourceFileRelativePath));
        }
      },
      { concurrency: Constants.maxParallelism }
    );

    await Async.forEachAsync(
      pathsToDelete,
      async (pathToDelete: string) => {
        try {
          await FileSystem.deleteFileAsync(pathToDelete, { throwIfNotExists: true });
          logger.terminal.writeVerboseLine(`Deleted "${pathToDelete}"`);
          deletedFiles++;
        } catch (error) {
          // If it doesn't exist, we can ignore the error
          if (!FileSystem.isNotExistError(error)) {
            // Happens when trying to delete a folder as if it was a file
            if (FileSystem.isUnlinkNotPermittedError(error)) {
              await FileSystem.deleteFolderAsync(pathToDelete);
              logger.terminal.writeVerboseLine(`Deleted folder "${pathToDelete}"`);
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
      logger.terminal.writeLine(
        `Deleted ${deletedFiles} file${deletedFiles !== 1 ? 's' : ''} ` +
          `and ${deletedFolders} folder${deletedFolders !== 1 ? 's' : ''}`
      );
    }
  }
}

export default new DeleteFilesPlugin() as IHeftTaskPlugin<IDeleteFilesPluginOptions>;
