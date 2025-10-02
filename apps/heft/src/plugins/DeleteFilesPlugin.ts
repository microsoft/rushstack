// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as fs from 'node:fs';

import { FileSystem, Async } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { Constants } from '../utilities/Constants';
import {
  getFileSelectionSpecifierPathsAsync,
  asAbsoluteFileSelectionSpecifier,
  type IFileSelectionSpecifier
} from './FileGlobSpecifier';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type { IHeftTaskSession, IHeftTaskFileOperations } from '../pluginFramework/HeftTaskSession';

/**
 * Used to specify a selection of source files to delete from the specified source folder.
 *
 * @public
 */
export interface IDeleteOperation extends IFileSelectionSpecifier {}

interface IDeleteFilesPluginOptions {
  deleteOperations: IDeleteOperation[];
}

interface IGetPathsToDeleteResult {
  filesToDelete: Set<string>;
  foldersToDelete: Set<string>;
}

async function _getPathsToDeleteAsync(
  rootFolderPath: string,
  deleteOperations: Iterable<IDeleteOperation>
): Promise<IGetPathsToDeleteResult> {
  const result: IGetPathsToDeleteResult = {
    filesToDelete: new Set<string>(),
    foldersToDelete: new Set<string>()
  };

  await Async.forEachAsync(
    deleteOperations,
    async (deleteOperation: IDeleteOperation) => {
      const absoluteSpecifier: IDeleteOperation = asAbsoluteFileSelectionSpecifier(
        rootFolderPath,
        deleteOperation
      );

      // Glob the files under the source path and add them to the set of files to delete
      const sourcePaths: Map<string, fs.Dirent> = await getFileSelectionSpecifierPathsAsync({
        fileGlobSpecifier: absoluteSpecifier,
        includeFolders: true
      });
      for (const [sourcePath, dirent] of sourcePaths) {
        // If the sourcePath is a folder, add it to the foldersToDelete set. Otherwise, add it to
        // the filesToDelete set. Symlinks and junctions are treated as files, and thus will fall
        // into the filesToDelete set.
        if (dirent.isDirectory()) {
          result.foldersToDelete.add(sourcePath);
        } else {
          result.filesToDelete.add(sourcePath);
        }
      }
    },
    { concurrency: Constants.maxParallelism }
  );

  return result;
}

export async function deleteFilesAsync(
  rootFolderPath: string,
  deleteOperations: Iterable<IDeleteOperation>,
  terminal: ITerminal
): Promise<void> {
  const pathsToDelete: IGetPathsToDeleteResult = await _getPathsToDeleteAsync(
    rootFolderPath,
    deleteOperations
  );
  await _deleteFilesInnerAsync(pathsToDelete, terminal);
}

async function _deleteFilesInnerAsync(
  pathsToDelete: IGetPathsToDeleteResult,
  terminal: ITerminal
): Promise<void> {
  let deletedFiles: number = 0;
  let deletedFolders: number = 0;

  const { filesToDelete, foldersToDelete } = pathsToDelete;

  await Async.forEachAsync(
    filesToDelete,
    async (pathToDelete: string) => {
      try {
        await FileSystem.deleteFileAsync(pathToDelete, { throwIfNotExists: true });
        terminal.writeVerboseLine(`Deleted "${pathToDelete}".`);
        deletedFiles++;
      } catch (error) {
        // If it doesn't exist, we can ignore the error.
        if (!FileSystem.isNotExistError(error)) {
          throw error;
        }
      }
    },
    { concurrency: Constants.maxParallelism }
  );

  // Reverse the list of matching folders. Assuming that the list of folders came from
  // the globber, the folders will be specified in tree-walk order, so by reversing the
  // list we delete the deepest folders first and avoid not-exist errors for subfolders
  // of an already-deleted parent folder.
  const reversedFoldersToDelete: string[] = Array.from(foldersToDelete).reverse();

  // Clear out any folders that were encountered during the file deletion process. This
  // will recursively delete the folder and it's contents. There are two scenarios that
  // this handles:
  // - Deletions of empty folder structures (ex. when the delete glob is '**/*')
  // - Deletions of folders that still contain files (ex. when the delete glob is 'lib')
  // In the latter scenario, the count of deleted files will not be tracked. However,
  // this is a fair trade-off for the performance benefit of not having to glob the
  // folder structure again.
  await Async.forEachAsync(
    reversedFoldersToDelete,
    async (folderToDelete: string) => {
      try {
        await FileSystem.deleteFolderAsync(folderToDelete);
        terminal.writeVerboseLine(`Deleted folder "${folderToDelete}".`);
        deletedFolders++;
      } catch (error) {
        // If it doesn't exist, we can ignore the error.
        if (!FileSystem.isNotExistError(error)) {
          throw error;
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

const PLUGIN_NAME: 'delete-files-plugin' = 'delete-files-plugin';

export default class DeleteFilesPlugin implements IHeftTaskPlugin<IDeleteFilesPluginOptions> {
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IDeleteFilesPluginOptions
  ): void {
    taskSession.hooks.registerFileOperations.tap(
      PLUGIN_NAME,
      (fileOperations: IHeftTaskFileOperations): IHeftTaskFileOperations => {
        for (const deleteOperation of pluginOptions.deleteOperations) {
          fileOperations.deleteOperations.add(deleteOperation);
        }
        return fileOperations;
      }
    );
  }
}
