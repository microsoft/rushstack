// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { AlreadyExistsBehavior, FileSystem, Async } from '@rushstack/node-core-library';

import { Constants } from '../utilities/Constants';
import { getFilePathsAsync, type IFileSelectionSpecifier } from './FileGlobSpecifier';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type { IHeftTaskSession, IHeftTaskRunHookOptions } from '../pluginFramework/HeftTaskSession';
import type { IScopedLogger } from '../pluginFramework/logging/ScopedLogger';

/**
 * Used to specify a selection of files to copy from a specific source folder to one
 * or more destination folders.
 *
 * @public
 */
export interface ICopyOperation extends IFileSelectionSpecifier {
  /**
   * Absolute paths to folder(s) which files or folders should be copied to.
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

interface ICopyFilesPluginOptions {
  copyOperations: ICopyOperation[];
}

interface ICopyFilesResult {
  copiedFolderOrFileCount: number;
  linkedFileCount: number;
}

interface ICopyDescriptor {
  sourcePath: string;
  destinationPath: string;
  hardlink: boolean;
}

export async function copyFilesAsync(copyOperations: ICopyOperation[], logger: IScopedLogger): Promise<void> {
  const copyDescriptors: ICopyDescriptor[] = await _getCopyDescriptorsAsync(copyOperations);
  if (copyDescriptors.length === 0) {
    // No need to run copy and print to console
    return;
  }

  const { copiedFolderOrFileCount, linkedFileCount } = await _copyFilesInnerAsync(copyDescriptors, logger);
  const folderOrFilesPlural: string = copiedFolderOrFileCount === 1 ? '' : 's';
  logger.terminal.writeLine(
    `Copied ${copiedFolderOrFileCount} folder${folderOrFilesPlural} or file${folderOrFilesPlural} and ` +
      `linked ${linkedFileCount} file${linkedFileCount === 1 ? '' : 's'}`
  );

  // TODO: Handle watch mode
  // Then enter watch mode if requested
  // if (options.watchMode) {
  //   HeftAsync.runWatcherWithErrorHandling(async () => await this._runWatchAsync(options), logger);
  // }
}

async function _getCopyDescriptorsAsync(copyConfigurations: ICopyOperation[]): Promise<ICopyDescriptor[]> {
  const processedCopyDescriptors: ICopyDescriptor[] = [];

  // Create a map to deduplicate and prevent double-writes
  // resolvedDestinationFilePath -> descriptor
  const destinationCopyDescriptors: Map<string, ICopyDescriptor> = new Map();

  await Async.forEachAsync(
    copyConfigurations,
    async (copyConfiguration: ICopyOperation) => {
      let sourceFolder: string | undefined;
      let sourceFilePaths: Set<string> | undefined;
      if (
        !copyConfiguration.fileExtensions?.length &&
        !copyConfiguration.includeGlobs?.length &&
        !copyConfiguration.excludeGlobs?.length
      ) {
        sourceFolder = path.dirname(copyConfiguration.sourcePath);
        if (copyConfiguration.hardlink) {
          // Specify a glob to match all files in the folder, since folders cannot be hardlinked.
          // Perform globbing from one folder up, so that we create the folder in the destination.
          try {
            sourceFilePaths = await getFilePathsAsync({
              ...copyConfiguration,
              sourcePath: sourceFolder,
              includeGlobs: [`${path.basename(copyConfiguration.sourcePath)}/**/*`]
            });
          } catch (error) {
            if (FileSystem.isNotDirectoryError(error)) {
              // The source path is a file, not a folder. Handled below.
            } else {
              throw error;
            }
          }
        }

        // Still not set, either it's not a hardlink or it's a file.
        if (!sourceFilePaths) {
          sourceFilePaths = new Set([copyConfiguration.sourcePath]);
        }
      } else {
        // Assume the source path is a folder
        sourceFolder = copyConfiguration.sourcePath;
        sourceFilePaths = await getFilePathsAsync(copyConfiguration);
      }

      // Dedupe and throw if a double-write is detected
      for (const destinationFolderPath of copyConfiguration.destinationFolders) {
        for (const sourceFilePath of sourceFilePaths!) {
          const sourceFileRelativePath: string = path.relative(sourceFolder!, sourceFilePath);

          // Only include the relative path from the sourceFolder if flatten is false
          const resolvedDestinationPath: string = path.resolve(
            destinationFolderPath,
            copyConfiguration.flatten ? path.basename(sourceFileRelativePath) : sourceFileRelativePath
          );

          // Throw if a duplicate copy target with a different source or options is specified
          const existingDestinationCopyDescriptor: ICopyDescriptor | undefined =
            destinationCopyDescriptors.get(resolvedDestinationPath);
          if (existingDestinationCopyDescriptor) {
            if (
              existingDestinationCopyDescriptor.sourcePath === sourceFilePath &&
              existingDestinationCopyDescriptor.hardlink === !!copyConfiguration.hardlink
            ) {
              // Found a duplicate, avoid adding again
              continue;
            }
            throw new Error(
              `Cannot copy multiple files to the same destination "${resolvedDestinationPath}"`
            );
          }

          // Finally, default hardlink to false, add to the result, and add to the map for deduping
          const processedCopyDescriptor: ICopyDescriptor = {
            sourcePath: sourceFilePath,
            destinationPath: resolvedDestinationPath,
            hardlink: !!copyConfiguration.hardlink
          };
          processedCopyDescriptors.push(processedCopyDescriptor);
          destinationCopyDescriptors.set(resolvedDestinationPath, processedCopyDescriptor);
        }
      }
    },
    { concurrency: Constants.maxParallelism }
  );

  // We're done with the map, grab the values and return
  return processedCopyDescriptors;
}

async function _copyFilesInnerAsync(
  copyDescriptors: ICopyDescriptor[],
  logger: IScopedLogger
): Promise<ICopyFilesResult> {
  if (copyDescriptors.length === 0) {
    return { copiedFolderOrFileCount: 0, linkedFileCount: 0 };
  }

  let copiedFolderOrFileCount: number = 0;
  let linkedFileCount: number = 0;
  await Async.forEachAsync(
    copyDescriptors,
    async (copyDescriptor: ICopyDescriptor) => {
      if (copyDescriptor.hardlink) {
        linkedFileCount++;
        await FileSystem.createHardLinkAsync({
          linkTargetPath: copyDescriptor.sourcePath,
          newLinkPath: copyDescriptor.destinationPath,
          alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
        });
        logger.terminal.writeVerboseLine(
          `Linked "${copyDescriptor.sourcePath}" to "${copyDescriptor.destinationPath}"`
        );
      } else {
        copiedFolderOrFileCount++;
        await FileSystem.copyFilesAsync({
          sourcePath: copyDescriptor.sourcePath,
          destinationPath: copyDescriptor.destinationPath,
          alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
        });
        logger.terminal.writeVerboseLine(
          `Copied "${copyDescriptor.sourcePath}" to "${copyDescriptor.destinationPath}"`
        );
      }
    },
    { concurrency: Constants.maxParallelism }
  );

  return { copiedFolderOrFileCount, linkedFileCount };
}

export default class CopyFilesPlugin implements IHeftTaskPlugin<ICopyFilesPluginOptions> {
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: ICopyFilesPluginOptions
  ): void {
    taskSession.hooks.run.tapPromise(taskSession.taskName, async (runOptions: IHeftTaskRunHookOptions) => {
      // TODO: Remove once improved heft-config-file is used
      for (const copyOperation of pluginOptions.copyOperations) {
        if (!path.isAbsolute(copyOperation.sourcePath)) {
          copyOperation.sourcePath = path.resolve(heftConfiguration.buildFolder, copyOperation.sourcePath);
        }
        const destinationFolders: string[] = [];
        for (const destinationFolder of copyOperation.destinationFolders) {
          if (!path.isAbsolute(destinationFolder)) {
            destinationFolders.push(path.resolve(heftConfiguration.buildFolder, destinationFolder));
          }
        }
        copyOperation.destinationFolders = destinationFolders;
      }
      await copyFilesAsync(pluginOptions.copyOperations, taskSession.logger);
    });
  }

  // TODO: Handle watch mode
  // private async _runWatchAsync(options: ICopyFilesOptions): Promise<void> {
  //   const { buildFolder, copyConfigurations, logger } = options;

  //   for (const copyConfiguration of copyConfigurations) {
  //     // Obtain the glob patterns to provide to the watcher
  //     const globsToWatch: string[] = this._getIncludedGlobPatterns(copyConfiguration);
  //     if (globsToWatch.length) {
  //       const resolvedSourceFolderPath: string = path.join(buildFolder, copyConfiguration.sourceFolder);

  //       const watcher: chokidar.FSWatcher = chokidar.watch(globsToWatch, {
  //         cwd: resolvedSourceFolderPath,
  //         ignoreInitial: true,
  //         ignored: copyConfiguration.excludeGlobs
  //       });

  //       const copyAsset: (relativeAssetPath: string) => Promise<void> = async (relativeAssetPath: string) => {
  //         const { copiedFileCount, linkedFileCount } = await this._copyFilesAsync(
  //           copyConfiguration.resolvedDestinationFolderPaths.map((resolvedDestinationFolderPath) => {
  //             return {
  //               sourceFilePath: path.join(resolvedSourceFolderPath, relativeAssetPath),
  //               destinationFilePath: path.join(
  //                 resolvedDestinationFolderPath,
  //                 copyConfiguration.flatten ? path.basename(relativeAssetPath) : relativeAssetPath
  //               ),
  //               hardlink: !!copyConfiguration.hardlink
  //             };
  //           })
  //         );
  //         logger.terminal.writeLine(
  //           copyConfiguration.hardlink
  //             ? `Linked ${linkedFileCount} file${linkedFileCount === 1 ? '' : 's'}`
  //             : `Copied ${copiedFileCount} file${copiedFileCount === 1 ? '' : 's'}`
  //         );
  //       };

  //       const deleteAsset: (relativeAssetPath: string) => Promise<void> = async (relativeAssetPath) => {
  //         const deletePromises: Promise<void>[] = copyConfiguration.resolvedDestinationFolderPaths.map(
  //           (resolvedDestinationFolderPath) =>
  //             FileSystem.deleteFileAsync(path.resolve(resolvedDestinationFolderPath, relativeAssetPath))
  //         );
  //         await Promise.all(deletePromises);
  //         logger.terminal.writeLine(
  //           `Deleted ${deletePromises.length} file${deletePromises.length === 1 ? '' : 's'}`
  //         );
  //       };

  //       watcher.on('add', copyAsset);
  //       watcher.on('change', copyAsset);
  //       watcher.on('unlink', deleteAsset);
  //     }
  //   }

  //   return new Promise(() => {
  //     /* never resolve */
  //   });
  // }
}
