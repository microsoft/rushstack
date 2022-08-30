// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, Async } from '@rushstack/node-core-library';

import { Constants } from '../utilities/Constants';
import { getFilePathsAsync, type IFileSelectionSpecifier } from './FileGlobSpecifier';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type { IHeftTaskSession, IHeftTaskRunHookOptions } from '../pluginFramework/HeftTaskSession';
import type { IScopedLogger } from '../pluginFramework/logging/ScopedLogger';

/**
 * Used to specify a selection of source files to delete from the specified source folder.
 *
 * @public
 */
export interface IDeleteOperation extends IFileSelectionSpecifier {}

interface IDeleteFilesPluginOptions {
  deleteOperations: IDeleteOperation[];
}

async function _getPathsToDeleteAsync(deleteOperations: Iterable<IDeleteOperation>): Promise<Set<string>> {
  const pathsToDelete: Set<string> = new Set();
  await Async.forEachAsync(
    deleteOperations,
    async (deleteOperation: IDeleteOperation) => {
      if (
        !deleteOperation.fileExtensions?.length &&
        !deleteOperation.includeGlobs?.length &&
        !deleteOperation.excludeGlobs?.length
      ) {
        // If no globs or file extensions are provided add the path to the set of paths to delete
        pathsToDelete.add(deleteOperation.sourcePath);
      } else {
        // Glob the files under the source path and add them to the set of files to delete
        const sourceFilePaths: Set<string> = await getFilePathsAsync(deleteOperation);
        for (const sourceFilePath of sourceFilePaths) {
          pathsToDelete.add(sourceFilePath);
        }
      }
    },
    { concurrency: Constants.maxParallelism }
  );

  return pathsToDelete;
}

export async function deleteFilesAsync(
  deleteOperations: IDeleteOperation[],
  logger: IScopedLogger
): Promise<void> {
  const pathsToDelete: Set<string> = await _getPathsToDeleteAsync(deleteOperations);
  await _deleteFilesInnerAsync(pathsToDelete, logger);
}

async function _deleteFilesInnerAsync(pathsToDelete: Set<string>, logger: IScopedLogger): Promise<void> {
  let deletedFiles: number = 0;
  let deletedFolders: number = 0;
  await Async.forEachAsync(
    pathsToDelete,
    async (pathToDelete: string) => {
      try {
        await FileSystem.deleteFileAsync(pathToDelete, { throwIfNotExists: true });
        logger.terminal.writeVerboseLine(`Deleted ${JSON.stringify(pathToDelete)}.`);
        deletedFiles++;
      } catch (error) {
        // If it doesn't exist, we can ignore the error.
        if (!FileSystem.isNotExistError(error)) {
          // When we encounter an error relating to deleting a directory as if it was a file,
          // attempt to delete the folder. Windows throws the unlink not permitted error, while
          // linux throws the EISDIR error.
          if (FileSystem.isUnlinkNotPermittedError(error) || FileSystem.isDirectoryError(error)) {
            await FileSystem.deleteFolderAsync(pathToDelete);
            logger.terminal.writeVerboseLine(`Deleted folder ${JSON.stringify(pathToDelete)}.`);
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

function _resolveDeleteOperationPaths(
  heftConfiguration: HeftConfiguration,
  deleteOperations: Iterable<IDeleteOperation>
): void {
  for (const copyOperation of deleteOperations) {
    if (!path.isAbsolute(copyOperation.sourcePath)) {
      copyOperation.sourcePath = path.resolve(heftConfiguration.buildFolderPath, copyOperation.sourcePath);
    }
  }
}

export default class DeleteFilesPlugin implements IHeftTaskPlugin<IDeleteFilesPluginOptions> {
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IDeleteFilesPluginOptions
  ): void {
    // TODO: Remove once improved heft-config-file is used
    _resolveDeleteOperationPaths(heftConfiguration, pluginOptions.deleteOperations);

    taskSession.hooks.run.tapPromise(taskSession.taskName, async (runOptions: IHeftTaskRunHookOptions) => {
      await deleteFilesAsync(pluginOptions.deleteOperations, taskSession.logger);
    });
  }
}
