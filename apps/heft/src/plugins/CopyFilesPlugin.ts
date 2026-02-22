// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';
import type * as fs from 'node:fs';
import * as path from 'node:path';

import { AlreadyExistsBehavior, FileSystem, Async } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { Constants } from '../utilities/Constants';
import {
  asAbsoluteFileSelectionSpecifier,
  getFileSelectionSpecifierPathsAsync,
  type IFileSelectionSpecifier
} from './FileGlobSpecifier';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type { IHeftTaskSession, IHeftTaskFileOperations } from '../pluginFramework/HeftTaskSession';
import type { WatchFileSystemAdapter } from '../utilities/WatchFileSystemAdapter';
import {
  type IIncrementalBuildInfo,
  makePathRelative,
  tryReadBuildInfoAsync,
  writeBuildInfoAsync
} from '../pluginFramework/IncrementalBuildInfo';
import type {
  CopyFilesHeftTaskEventOptions as ICopyFilesPluginOptions,
  CopyOperationBase as ICopyOperationBase
} from '../schemas/copy-files-options.schema.json.d.ts';

export type { ICopyOperationBase };

/**
 * Used to specify a selection of files to copy from a specific source folder to one
 * or more destination folders.
 *
 * @public
 */
export interface ICopyOperation extends IFileSelectionSpecifier, ICopyOperationBase {}

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

interface ICopyDescriptor {
  sourcePath: string;
  destinationPath: string;
  hardlink: boolean;
}

export function asAbsoluteCopyOperation(
  rootFolderPath: string,
  copyOperation: ICopyOperation
): ICopyOperation {
  const absoluteCopyOperation: ICopyOperation = asAbsoluteFileSelectionSpecifier(
    rootFolderPath,
    copyOperation
  );
  absoluteCopyOperation.destinationFolders = copyOperation.destinationFolders.map((folder) =>
    path.resolve(rootFolderPath, folder)
  );
  return absoluteCopyOperation;
}

export function asRelativeCopyOperation(
  rootFolderPath: string,
  copyOperation: ICopyOperation
): ICopyOperation {
  return {
    ...copyOperation,
    destinationFolders: copyOperation.destinationFolders.map((folder) =>
      makePathRelative(folder, rootFolderPath)
    ),
    sourcePath: copyOperation.sourcePath && makePathRelative(copyOperation.sourcePath, rootFolderPath)
  };
}

export async function copyFilesAsync(
  copyOperations: Iterable<ICopyOperation>,
  terminal: ITerminal,
  buildInfoPath: string,
  configHash: string,
  watchFileSystemAdapter?: WatchFileSystemAdapter
): Promise<void> {
  const copyDescriptorByDestination: Map<string, ICopyDescriptor> = await _getCopyDescriptorsAsync(
    copyOperations,
    watchFileSystemAdapter
  );

  await _copyFilesInnerAsync(copyDescriptorByDestination, configHash, buildInfoPath, terminal);
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
  configHash: string,
  buildInfoPath: string,
  terminal: ITerminal
): Promise<void> {
  if (copyDescriptors.size === 0) {
    return;
  }

  let oldBuildInfo: IIncrementalBuildInfo | undefined = await tryReadBuildInfoAsync(buildInfoPath);
  if (oldBuildInfo && oldBuildInfo.configHash !== configHash) {
    terminal.writeVerboseLine(`File copy configuration changed, discarding incremental state.`);
    oldBuildInfo = undefined;
  }

  // Since in watch mode only changed files will get passed in, need to ensure that all files from
  // the previous build are still tracked.
  const inputFileVersions: Map<string, string> = new Map(oldBuildInfo?.inputFileVersions);

  const buildInfo: IIncrementalBuildInfo = {
    configHash,
    inputFileVersions
  };

  const allInputFiles: Set<string> = new Set();
  for (const copyDescriptor of copyDescriptors.values()) {
    allInputFiles.add(copyDescriptor.sourcePath);
  }

  await Async.forEachAsync(
    allInputFiles,
    async (inputFilePath: string) => {
      const fileContent: Buffer = await FileSystem.readFileToBufferAsync(inputFilePath);
      const fileHash: string = createHash('sha256').update(fileContent).digest('base64');
      inputFileVersions.set(inputFilePath, fileHash);
    },
    {
      concurrency: Constants.maxParallelism
    }
  );

  const copyDescriptorsWithWork: ICopyDescriptor[] = [];
  for (const copyDescriptor of copyDescriptors.values()) {
    const { sourcePath } = copyDescriptor;

    const sourceFileHash: string | undefined = inputFileVersions.get(sourcePath);
    if (!sourceFileHash) {
      throw new Error(`Missing hash for input file: ${sourcePath}`);
    }

    if (oldBuildInfo?.inputFileVersions.get(sourcePath) === sourceFileHash) {
      continue;
    }

    copyDescriptorsWithWork.push(copyDescriptor);
  }

  if (copyDescriptorsWithWork.length === 0) {
    terminal.writeLine('All requested file copy operations are up to date. Nothing to do.');
    return;
  }

  let copiedFileCount: number = 0;
  let linkedFileCount: number = 0;
  await Async.forEachAsync(
    copyDescriptorsWithWork,
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
        copiedFileCount++;
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

  terminal.writeLine(
    `Copied ${copiedFileCount} file${copiedFileCount === 1 ? '' : 's'} and ` +
      `linked ${linkedFileCount} file${linkedFileCount === 1 ? '' : 's'}`
  );

  await writeBuildInfoAsync(buildInfo, buildInfoPath);
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
