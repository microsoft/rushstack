// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, Async } from '@rushstack/node-core-library';

import { Constants } from '../utilities/Constants';
import { getRelativeFilePathsAsync, type IFileGlobSpecifier } from './FileGlobSpecifier';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type { IHeftTaskSession, IHeftTaskRunHookOptions } from '../pluginFramework/HeftTaskSession';
import type { IScopedLogger } from '../pluginFramework/logging/ScopedLogger';

/**
 * Used to specify a selection of source files to delete from the specified source folder.
 *
 * @public
 */
export interface IDeleteOperation extends IFileGlobSpecifier {}

interface IDeleteFilesPluginOptions {
  deleteOperations: IDeleteOperation[];
}

export async function deleteFilesAsync(
  deleteOperations: IDeleteOperation[],
  logger: IScopedLogger
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
        // If it doesn't exist, we can ignore the error.
        if (!FileSystem.isNotExistError(error)) {
          // When we encounter an error relating to deleting a directory as if it was a file,
          // attempt to delete the folder. Windows throws the unlink not permitted error, while
          // linux throws the EISDIR error.
          if (FileSystem.isUnlinkNotPermittedError(error) || FileSystem.isDirectoryError(error)) {
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

export default class DeleteFilesPlugin implements IHeftTaskPlugin<IDeleteFilesPluginOptions> {
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IDeleteFilesPluginOptions
  ): void {
    taskSession.hooks.run.tapPromise(taskSession.taskName, async (runOptions: IHeftTaskRunHookOptions) => {
      await deleteFilesAsync(pluginOptions.deleteOperations, taskSession.logger);
    });
  }
}
