// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as chokidar from 'chokidar';
import * as path from 'path';
import glob from 'fast-glob';
import { performance } from 'perf_hooks';
import { AlreadyExistsBehavior, FileSystem, Async } from '@rushstack/node-core-library';

import { HeftAsync } from '../utilities/HeftAsync';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { HeftEventPluginBase } from '../pluginFramework/HeftEventPluginBase';
import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import {
  IExtendedSharedCopyConfiguration,
  IHeftEventActions,
  IHeftConfigurationCopyFilesEventAction,
  HeftEvent
} from '../utilities/CoreConfigFiles';
import { IBuildStageProperties } from '../stages/BuildStage';
import { Constants } from '../utilities/Constants';

interface ICopyFileDescriptor {
  sourceFilePath: string;
  destinationFilePath: string;
  hardlink: boolean;
}

export interface IResolvedDestinationCopyConfiguration extends IExtendedSharedCopyConfiguration {
  /**
   * Fully-qualified folder paths to which files should be copied.
   */
  resolvedDestinationFolderPaths: string[];
}

export interface ICopyFilesOptions {
  buildFolder: string;
  copyConfigurations: IResolvedDestinationCopyConfiguration[];
  logger: ScopedLogger;
  watchMode: boolean;
}

export interface ICopyFilesResult {
  copiedFileCount: number;
  linkedFileCount: number;
}

export class CopyFilesPlugin extends HeftEventPluginBase<IHeftConfigurationCopyFilesEventAction> {
  public readonly pluginName: string = 'CopyFilesPlugin';
  protected eventActionName: keyof IHeftEventActions = 'copyFiles';
  protected loggerName: string = 'copy-files';

  /**
   * @override
   */
  protected async handleBuildEventActionsAsync(
    heftEvent: HeftEvent,
    heftEventActions: IHeftConfigurationCopyFilesEventAction[],
    logger: ScopedLogger,
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    properties: IBuildStageProperties
  ): Promise<void> {
    await this._runCopyFilesForHeftEventActions(heftEventActions, logger, heftConfiguration);
  }

  private async _runCopyFilesForHeftEventActions(
    heftEventActions: IHeftConfigurationCopyFilesEventAction[],
    logger: ScopedLogger,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    const copyConfigurations: IResolvedDestinationCopyConfiguration[] = [];
    for (const copyFilesEventAction of heftEventActions) {
      for (const copyOperation of copyFilesEventAction.copyOperations) {
        copyConfigurations.push({
          ...copyOperation,
          resolvedDestinationFolderPaths: copyOperation.destinationFolders.map((destinationFolder) =>
            path.join(heftConfiguration.buildFolder, destinationFolder)
          )
        });
      }
    }

    await this.runCopyAsync({
      buildFolder: heftConfiguration.buildFolder,
      copyConfigurations,
      logger,
      watchMode: false
    });
  }

  protected async runCopyAsync(options: ICopyFilesOptions): Promise<void> {
    const { logger, buildFolder, copyConfigurations } = options;

    const startTime: number = performance.now();
    const copyDescriptors: ICopyFileDescriptor[] = await this._getCopyFileDescriptorsAsync(
      buildFolder,
      copyConfigurations
    );

    if (copyDescriptors.length === 0) {
      // No need to run copy and print to console
      return;
    }

    const { copiedFileCount, linkedFileCount } = await this._copyFilesAsync(copyDescriptors);
    const duration: number = performance.now() - startTime;
    logger.terminal.writeLine(
      `Copied ${copiedFileCount} file${copiedFileCount === 1 ? '' : 's'} and ` +
        `linked ${linkedFileCount} file${linkedFileCount === 1 ? '' : 's'} in ${Math.round(duration)}ms`
    );

    // Then enter watch mode if requested
    if (options.watchMode) {
      HeftAsync.runWatcherWithErrorHandling(async () => await this._runWatchAsync(options), logger);
    }
  }

  private async _copyFilesAsync(copyDescriptors: ICopyFileDescriptor[]): Promise<ICopyFilesResult> {
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
        } else {
          copiedFileCount++;
          await FileSystem.copyFileAsync({
            sourcePath: copyDescriptor.sourceFilePath,
            destinationPath: copyDescriptor.destinationFilePath,
            alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
          });
        }
      },
      { concurrency: Constants.maxParallelism }
    );

    return {
      copiedFileCount,
      linkedFileCount
    };
  }

  private async _getCopyFileDescriptorsAsync(
    buildFolder: string,
    copyConfigurations: IResolvedDestinationCopyConfiguration[]
  ): Promise<ICopyFileDescriptor[]> {
    const processedCopyDescriptors: ICopyFileDescriptor[] = [];

    // Create a map to deduplicate and prevent double-writes
    // resolvedDestinationFilePath -> descriptor
    const destinationCopyDescriptors: Map<string, ICopyFileDescriptor> = new Map();

    for (const copyConfiguration of copyConfigurations) {
      // Resolve the source folder path which is where the glob will be run from
      const resolvedSourceFolderPath: string = path.resolve(buildFolder, copyConfiguration.sourceFolder);
      const sourceFileRelativePaths: Set<string> = new Set<string>(
        await glob(this._getIncludedGlobPatterns(copyConfiguration), {
          cwd: resolvedSourceFolderPath,
          ignore: copyConfiguration.excludeGlobs,
          dot: true,
          onlyFiles: true
        })
      );

      // Dedupe and throw if a double-write is detected
      for (const destinationFolderPath of copyConfiguration.resolvedDestinationFolderPaths) {
        for (const sourceFileRelativePath of sourceFileRelativePaths) {
          // Only include the relative path from the sourceFolder if flatten is false
          const resolvedSourceFilePath: string = path.join(resolvedSourceFolderPath, sourceFileRelativePath);
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
              `Cannot copy different files to the same destination "${resolvedDestinationFilePath}"`
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
    }

    // We're done with the map, grab the values and return
    return processedCopyDescriptors;
  }

  private _getIncludedGlobPatterns(copyConfiguration: IExtendedSharedCopyConfiguration): string[] {
    const patternsToGlob: Set<string> = new Set<string>();

    // Glob file extensions with a specific glob to increase perf
    const escapedFileExtensions: Set<string> = new Set<string>();
    for (const fileExtension of copyConfiguration.fileExtensions || []) {
      let escapedFileExtension: string;
      if (fileExtension.charAt(0) === '.') {
        escapedFileExtension = fileExtension.substr(1);
      } else {
        escapedFileExtension = fileExtension;
      }

      escapedFileExtension = glob.escapePath(escapedFileExtension);
      escapedFileExtensions.add(escapedFileExtension);
    }

    if (escapedFileExtensions.size > 1) {
      patternsToGlob.add(`**/*.{${Array.from(escapedFileExtensions).join(',')}}`);
    } else if (escapedFileExtensions.size === 1) {
      patternsToGlob.add(`**/*.${Array.from(escapedFileExtensions)[0]}`);
    }

    // Now include the other globs as well
    for (const include of copyConfiguration.includeGlobs || []) {
      patternsToGlob.add(include);
    }

    return Array.from(patternsToGlob);
  }

  private async _runWatchAsync(options: ICopyFilesOptions): Promise<void> {
    const { buildFolder, copyConfigurations, logger } = options;

    for (const copyConfiguration of copyConfigurations) {
      // Obtain the glob patterns to provide to the watcher
      const globsToWatch: string[] = this._getIncludedGlobPatterns(copyConfiguration);
      if (globsToWatch.length) {
        const resolvedSourceFolderPath: string = path.join(buildFolder, copyConfiguration.sourceFolder);

        const watcher: chokidar.FSWatcher = chokidar.watch(globsToWatch, {
          cwd: resolvedSourceFolderPath,
          ignoreInitial: true,
          ignored: copyConfiguration.excludeGlobs
        });

        const copyAsset: (relativeAssetPath: string) => Promise<void> = async (relativeAssetPath: string) => {
          const { copiedFileCount, linkedFileCount } = await this._copyFilesAsync(
            copyConfiguration.resolvedDestinationFolderPaths.map((resolvedDestinationFolderPath) => {
              return {
                sourceFilePath: path.join(resolvedSourceFolderPath, relativeAssetPath),
                destinationFilePath: path.join(
                  resolvedDestinationFolderPath,
                  copyConfiguration.flatten ? path.basename(relativeAssetPath) : relativeAssetPath
                ),
                hardlink: !!copyConfiguration.hardlink
              };
            })
          );
          logger.terminal.writeLine(
            copyConfiguration.hardlink
              ? `Linked ${linkedFileCount} file${linkedFileCount === 1 ? '' : 's'}`
              : `Copied ${copiedFileCount} file${copiedFileCount === 1 ? '' : 's'}`
          );
        };

        const deleteAsset: (relativeAssetPath: string) => Promise<void> = async (relativeAssetPath) => {
          const deletePromises: Promise<void>[] = copyConfiguration.resolvedDestinationFolderPaths.map(
            (resolvedDestinationFolderPath) =>
              FileSystem.deleteFileAsync(path.resolve(resolvedDestinationFolderPath, relativeAssetPath))
          );
          await Promise.all(deletePromises);
          logger.terminal.writeLine(
            `Deleted ${deletePromises.length} file${deletePromises.length === 1 ? '' : 's'}`
          );
        };

        watcher.on('add', copyAsset);
        watcher.on('change', copyAsset);
        watcher.on('unlink', deleteAsset);
      }
    }

    return new Promise(() => {
      /* never resolve */
    });
  }
}
