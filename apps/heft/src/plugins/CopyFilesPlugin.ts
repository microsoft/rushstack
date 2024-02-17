// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as fs from 'fs';
import * as path from 'path';
import { AlreadyExistsBehavior, FileSystem, Async } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { Constants } from '../utilities/Constants';
import {
  normalizeFileSelectionSpecifier,
  getFileSelectionSpecifierPathsAsync,
  type IFileSelectionSpecifier
} from './FileGlobSpecifier';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type { IHeftTaskSession, IHeftTaskFileOperations } from '../pluginFramework/HeftTaskSession';
import type { WatchFileSystemAdapter } from '../utilities/WatchFileSystemAdapter';

/**
 * Used to specify a selection of files to copy from a specific source folder to one
 * or more destination folders.
 *
 * @public
 */
export interface ICopyOperation extends IFileSelectionSpecifier {
  /**
   * Absolute paths to folders which files or folders should be copied to.
   */
  destinationFolders: string[];

  /**
   * Copy only the file and discard the relative path from the source folder.
   */
  flatten?: boolean;

  /**
   * Hardlink files instead of copying.
   *
   * @remarks
   * If the sourcePath is a folder, the contained directory structure will be re-created
   * and all files will be individually hardlinked. This means that folders will be new
   * filesystem entities and will have separate folder metadata, while the contained files
   * will maintain normal hardlink behavior. This is done since folders do not have a
   * cross-platform equivalent of a hardlink, and since file symlinks provide fundamentally
   * different functionality in comparison to hardlinks.
   */
  hardlink?: boolean;
}

/**
 * Used to specify a selection of files to copy from a specific source folder to one
 * or more destination folders.
 *
 * @public
 */
export interface IIncrementalCopyOperation extends ICopyOperation {
  /**
   * If true, the file will be copied only if the source file is contained in the
   * IHeftTaskRunIncrementalHookOptions.changedFiles map.
   */
  onlyIfChanged?: boolean;
}

interface ICopyFilesPluginOptions {
  copyOperations: ICopyOperation[];
}

interface ICopyDescriptor {
  sourcePath: string;
  destinationPath: string;
  hardlink: boolean;
}

export function normalizeCopyOperation(rootFolderPath: string, copyOperation: ICopyOperation): void {
  normalizeFileSelectionSpecifier(rootFolderPath, copyOperation);
  copyOperation.destinationFolders = copyOperation.destinationFolders.map((x) =>
    path.resolve(rootFolderPath, x)
  );
}

export async function copyFilesAsync(
  copyOperations: Iterable<ICopyOperation>,
  terminal: ITerminal,
  watchFileSystemAdapter?: WatchFileSystemAdapter
): Promise<void> {
  const copyDescriptorByDestination: Map<string, ICopyDescriptor> = await _getCopyDescriptorsAsync(
    copyOperations,
    watchFileSystemAdapter
  );

  await _copyFilesInnerAsync(copyDescriptorByDestination, terminal);
}

async function _getCopyDescriptorsAsync(
  copyConfigurations: Iterable<ICopyOperation>,
  fileSystemAdapter: WatchFileSystemAdapter | undefined
): Promise<Map<string, ICopyDescriptor>> {
  // Create a map to deduplicate and prevent double-writes
  // resolvedDestinationFilePath -> descriptor
  const copyDescriptorByDestination: Map<string, ICopyDescriptor> = new Map();

  await Async.forEachAsync(
    copyConfigurations,
    async (copyConfiguration: ICopyOperation) => {
      // "sourcePath" is required to be a folder. To copy a single file, put the parent folder in "sourcePath"
      // and the filename in "includeGlobs".
      const sourceFolder: string = copyConfiguration.sourcePath!;
      const sourceFiles: Map<string, fs.Dirent> = await getFileSelectionSpecifierPathsAsync({
        fileGlobSpecifier: copyConfiguration,
        fileSystemAdapter
      });

      // Dedupe and throw if a double-write is detected
      for (const destinationFolderPath of copyConfiguration.destinationFolders) {
        // We only need to care about the keys of the map since we know all the keys are paths to files
        for (const sourceFilePath of sourceFiles.keys()) {
          // Only include the relative path from the sourceFolder if flatten is false
          const resolvedDestinationPath: string = path.resolve(
            destinationFolderPath,
            copyConfiguration.flatten
              ? path.basename(sourceFilePath)
              : path.relative(sourceFolder, sourceFilePath)
          );

          // Throw if a duplicate copy target with a different source or options is specified
          const existingDestinationCopyDescriptor: ICopyDescriptor | undefined =
            copyDescriptorByDestination.get(resolvedDestinationPath);
          if (existingDestinationCopyDescriptor) {
            if (
              existingDestinationCopyDescriptor.sourcePath === sourceFilePath &&
              existingDestinationCopyDescriptor.hardlink === !!copyConfiguration.hardlink
            ) {
              // Found a duplicate, avoid adding again
              continue;
            }
            throw new Error(
              `Cannot copy multiple files to the same destination "${resolvedDestinationPath}".`
            );
          }

          // Finally, default hardlink to false, add to the result, and add to the map for deduping
          const processedCopyDescriptor: ICopyDescriptor = {
            sourcePath: sourceFilePath,
            destinationPath: resolvedDestinationPath,
            hardlink: !!copyConfiguration.hardlink
          };

          copyDescriptorByDestination.set(resolvedDestinationPath, processedCopyDescriptor);
        }
      }
    },
    { concurrency: Constants.maxParallelism }
  );

  return copyDescriptorByDestination;
}

async function _copyFilesInnerAsync(
  copyDescriptors: Map<string, ICopyDescriptor>,
  terminal: ITerminal
): Promise<void> {
  if (copyDescriptors.size === 0) {
    return;
  }

  let copiedFolderOrFileCount: number = 0;
  let linkedFileCount: number = 0;
  await Async.forEachAsync(
    copyDescriptors.values(),
    async (copyDescriptor: ICopyDescriptor) => {
      if (copyDescriptor.hardlink) {
        linkedFileCount++;
        await FileSystem.createHardLinkAsync({
          linkTargetPath: copyDescriptor.sourcePath,
          newLinkPath: copyDescriptor.destinationPath,
          alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
        });
        terminal.writeVerboseLine(
          `Linked "${copyDescriptor.sourcePath}" to "${copyDescriptor.destinationPath}".`
        );
      } else {
        copiedFolderOrFileCount++;
        await FileSystem.copyFilesAsync({
          sourcePath: copyDescriptor.sourcePath,
          destinationPath: copyDescriptor.destinationPath,
          alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
        });
        terminal.writeVerboseLine(
          `Copied "${copyDescriptor.sourcePath}" to "${copyDescriptor.destinationPath}".`
        );
      }
    },
    { concurrency: Constants.maxParallelism }
  );

  const folderOrFilesPlural: string = copiedFolderOrFileCount === 1 ? '' : 's';
  terminal.writeLine(
    `Copied ${copiedFolderOrFileCount} folder${folderOrFilesPlural} or file${folderOrFilesPlural} and ` +
      `linked ${linkedFileCount} file${linkedFileCount === 1 ? '' : 's'}`
  );
}

const PLUGIN_NAME: 'copy-files-plugin' = 'copy-files-plugin';

export default class CopyFilesPlugin implements IHeftTaskPlugin<ICopyFilesPluginOptions> {
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: ICopyFilesPluginOptions
  ): void {
    taskSession.hooks.registerFileOperations.tap(
      PLUGIN_NAME,
      (operations: IHeftTaskFileOperations): IHeftTaskFileOperations => {
        for (const operation of pluginOptions.copyOperations) {
          operations.copyOperations.add(operation);
        }
        return operations;
      }
    );
  }
}
