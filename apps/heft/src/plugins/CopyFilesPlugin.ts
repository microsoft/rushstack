// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { AlreadyExistsBehavior, FileSystem, Async } from '@rushstack/node-core-library';

import { Constants } from '../utilities/Constants';
import { REMOVED_CHANGE_STATE } from '../cli/HeftActionRunner';
import { getFilePathsAsync, type IFileSelectionSpecifier } from './FileGlobSpecifier';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type {
  IHeftTaskSession,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions,
  IChangedFileState
} from '../pluginFramework/HeftTaskSession';
import type { IScopedLogger } from '../pluginFramework/logging/ScopedLogger';

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

interface ICopyFilesPluginOptions {
  copyOperations: ICopyOperation[];
}

interface ICopyDescriptor {
  sourcePath: string;
  destinationPath: string;
  hardlink: boolean;
}

export async function copyFilesAsync(copyOperations: ICopyOperation[], logger: IScopedLogger): Promise<void> {
  const copyDescriptors: ICopyDescriptor[] = await _getCopyDescriptorsAsync(copyOperations);
  await _copyFilesInnerAsync(copyDescriptors, logger);
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
              `Cannot copy multiple files to the same destination ` +
                `${JSON.stringify(resolvedDestinationPath)}.`
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
): Promise<void> {
  if (copyDescriptors.length === 0) {
    return;
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
          `Linked ${JSON.stringify(copyDescriptor.sourcePath)} to ` +
            `${JSON.stringify(copyDescriptor.destinationPath)}.`
        );
      } else {
        copiedFolderOrFileCount++;
        await FileSystem.copyFilesAsync({
          sourcePath: copyDescriptor.sourcePath,
          destinationPath: copyDescriptor.destinationPath,
          alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
        });
        logger.terminal.writeVerboseLine(
          `Copied ${JSON.stringify(copyDescriptor.sourcePath)} to ` +
            `${JSON.stringify(copyDescriptor.destinationPath)}.`
        );
      }
    },
    { concurrency: Constants.maxParallelism }
  );

  const folderOrFilesPlural: string = copiedFolderOrFileCount === 1 ? '' : 's';
  logger.terminal.writeLine(
    `Copied ${copiedFolderOrFileCount} folder${folderOrFilesPlural} or file${folderOrFilesPlural} and ` +
      `linked ${linkedFileCount} file${linkedFileCount === 1 ? '' : 's'}`
  );
}

function _resolveCopyOperationPaths(
  heftConfiguration: HeftConfiguration,
  copyOperations: Iterable<ICopyOperation>
): void {
  for (const copyOperation of copyOperations) {
    if (!path.isAbsolute(copyOperation.sourcePath)) {
      copyOperation.sourcePath = path.resolve(heftConfiguration.buildFolderPath, copyOperation.sourcePath);
    }
    const destinationFolders: string[] = [];
    for (const destinationFolder of copyOperation.destinationFolders) {
      if (!path.isAbsolute(destinationFolder)) {
        destinationFolders.push(path.resolve(heftConfiguration.buildFolderPath, destinationFolder));
      }
    }
    copyOperation.destinationFolders = destinationFolders;
  }
}

export default class CopyFilesPlugin implements IHeftTaskPlugin<ICopyFilesPluginOptions> {
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: ICopyFilesPluginOptions
  ): void {
    // TODO: Remove once improved heft-config-file is used to resolve paths
    _resolveCopyOperationPaths(heftConfiguration, pluginOptions.copyOperations);

    taskSession.hooks.run.tapPromise(taskSession.taskName, async (runOptions: IHeftTaskRunHookOptions) => {
      await copyFilesAsync(pluginOptions.copyOperations, taskSession.logger);
    });

    const impactedFileStates: Map<string, IChangedFileState> = new Map();
    taskSession.hooks.runIncremental.tapPromise(
      taskSession.taskName,
      async (runIncrementalOptions: IHeftTaskRunIncrementalHookOptions) => {
        // TODO: Allow the copy descriptors to be resolved from a static list of files so
        // that we don't have to query the file system for each copy operation
        const copyDescriptors: ICopyDescriptor[] = await _getCopyDescriptorsAsync(
          pluginOptions.copyOperations
        );
        const incrementalCopyDescriptors: ICopyDescriptor[] = [];

        // Cycle through the copy descriptors and check for incremental changes
        for (const copyDescriptor of copyDescriptors) {
          const changedFileState: IChangedFileState | undefined = runIncrementalOptions.changedFiles.get(
            copyDescriptor.sourcePath
          );
          // We only care if the file has changed, ignore if not found or deleted
          if (changedFileState && changedFileState.version !== REMOVED_CHANGE_STATE) {
            const impactedFileState: IChangedFileState | undefined = impactedFileStates.get(
              copyDescriptor.sourcePath
            );
            if (!impactedFileState || impactedFileState.version !== changedFileState.version) {
              // If we haven't seen this file before or it's version has changed, copy it
              incrementalCopyDescriptors.push(copyDescriptor);
            }
          }
        }

        await _copyFilesInnerAsync(incrementalCopyDescriptors, taskSession.logger);

        // Update the copied file states with the new versions
        for (const copyDescriptor of incrementalCopyDescriptors) {
          impactedFileStates.set(
            copyDescriptor.sourcePath,
            runIncrementalOptions.changedFiles.get(copyDescriptor.sourcePath)!
          );
        }
      }
    );
  }
}
