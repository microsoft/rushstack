// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { AlreadyExistsBehavior, FileSystem, Async } from '@rushstack/node-core-library';

import { Constants } from '../utilities/Constants';
import { getRelativeFilePathsAsync, type IFileGlobSpecifier } from './FileGlobSpecifier';
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
export interface ICopyOperation extends IFileGlobSpecifier {
  /**
   * Absolute paths to folder(s) which files should be copied to.
   */
  destinationFolders: string[];

  /**
   * Copy only the file and discard the relative path from the source folder.
   */
  flatten?: boolean;

  /**
   * Hardlink files instead of copying.
   */
  hardlink?: boolean;
}

interface ICopyFilesPluginOptions {
  copyOperations: ICopyOperation[];
}

interface ICopyFilesResult {
  copiedFileCount: number;
  linkedFileCount: number;
}

interface ICopyFileDescriptor {
  sourceFilePath: string;
  destinationFilePath: string;
  hardlink: boolean;
}

export async function copyFilesAsync(copyOperations: ICopyOperation[], logger: IScopedLogger): Promise<void> {
  const copyDescriptors: ICopyFileDescriptor[] = await _getCopyFileDescriptorsAsync(copyOperations);
  if (copyDescriptors.length === 0) {
    // No need to run copy and print to console
    return;
  }

  const { copiedFileCount, linkedFileCount } = await _copyFilesInnerAsync(copyDescriptors, logger);
  logger.terminal.writeLine(
    `Copied ${copiedFileCount} file${copiedFileCount === 1 ? '' : 's'} and ` +
      `linked ${linkedFileCount} file${linkedFileCount === 1 ? '' : 's'}`
  );

  // TODO: Handle watch mode
  // Then enter watch mode if requested
  // if (options.watchMode) {
  //   HeftAsync.runWatcherWithErrorHandling(async () => await this._runWatchAsync(options), logger);
  // }
}

async function _getCopyFileDescriptorsAsync(
  copyConfigurations: ICopyOperation[]
): Promise<ICopyFileDescriptor[]> {
  const processedCopyDescriptors: ICopyFileDescriptor[] = [];

  // Create a map to deduplicate and prevent double-writes
  // resolvedDestinationFilePath -> descriptor
  const destinationCopyDescriptors: Map<string, ICopyFileDescriptor> = new Map();

  await Async.forEachAsync(
    copyConfigurations,
    async (copyConfiguration: ICopyOperation) => {
      const sourceFileRelativePaths: Set<string> = await getRelativeFilePathsAsync(copyConfiguration);

      // Dedupe and throw if a double-write is detected
      for (const destinationFolderPath of copyConfiguration.destinationFolders) {
        for (const sourceFileRelativePath of sourceFileRelativePaths) {
          // Only include the relative path from the sourceFolder if flatten is false
          const resolvedSourceFilePath: string = path.join(
            copyConfiguration.sourceFolder,
            sourceFileRelativePath
          );
          const resolvedDestinationFilePath: string = path.resolve(
            destinationFolderPath,
            copyConfiguration.flatten ? '.' : path.dirname(sourceFileRelativePath),
            path.basename(sourceFileRelativePath)
          );

          // Throw if a duplicate copy target with a different source or options is specified
          const existingDestinationCopyDescriptor: ICopyFileDescriptor | undefined =
            destinationCopyDescriptors.get(resolvedDestinationFilePath);
          if (existingDestinationCopyDescriptor) {
            if (
              existingDestinationCopyDescriptor.sourceFilePath === resolvedSourceFilePath &&
              existingDestinationCopyDescriptor.hardlink === !!copyConfiguration.hardlink
            ) {
              // Found a duplicate, avoid adding again
              continue;
            }
            throw new Error(
              `Cannot copy multiple files to the same destination "${resolvedDestinationFilePath}"`
            );
          }

          // Finally, default hardlink to false, add to the result, and add to the map for deduping
          const processedCopyDescriptor: ICopyFileDescriptor = {
            sourceFilePath: resolvedSourceFilePath,
            destinationFilePath: resolvedDestinationFilePath,
            hardlink: !!copyConfiguration.hardlink
          };
          processedCopyDescriptors.push(processedCopyDescriptor);
          destinationCopyDescriptors.set(resolvedDestinationFilePath, processedCopyDescriptor);
        }
      }
    },
    { concurrency: Constants.maxParallelism }
  );

  // We're done with the map, grab the values and return
  return processedCopyDescriptors;
}

async function _copyFilesInnerAsync(
  copyDescriptors: ICopyFileDescriptor[],
  logger: IScopedLogger
): Promise<ICopyFilesResult> {
  if (copyDescriptors.length === 0) {
    return { copiedFileCount: 0, linkedFileCount: 0 };
  }

  let copiedFileCount: number = 0;
  let linkedFileCount: number = 0;
  await Async.forEachAsync(
    copyDescriptors,
    async (copyDescriptor: ICopyFileDescriptor) => {
      if (copyDescriptor.hardlink) {
        linkedFileCount++;
        await FileSystem.createHardLinkAsync({
          linkTargetPath: copyDescriptor.sourceFilePath,
          newLinkPath: copyDescriptor.destinationFilePath,
          alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
        });
        logger.terminal.writeVerboseLine(
          `Linked "${copyDescriptor.sourceFilePath}" to "${copyDescriptor.destinationFilePath}"`
        );
      } else {
        copiedFileCount++;
        await FileSystem.copyFileAsync({
          sourcePath: copyDescriptor.sourceFilePath,
          destinationPath: copyDescriptor.destinationFilePath,
          alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
        });
        logger.terminal.writeVerboseLine(
          `Copied "${copyDescriptor.sourceFilePath}" to "${copyDescriptor.destinationFilePath}"`
        );
      }
    },
    { concurrency: Constants.maxParallelism }
  );

  return { copiedFileCount, linkedFileCount };
}

export default class CopyFilesPlugin implements IHeftTaskPlugin<ICopyFilesPluginOptions> {
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: ICopyFilesPluginOptions
  ): void {
    taskSession.hooks.run.tapPromise(taskSession.taskName, async (runOptions: IHeftTaskRunHookOptions) => {
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
