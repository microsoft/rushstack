// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as chokidar from 'chokidar';
import * as path from 'path';
import glob from 'fast-glob';
import { performance } from 'perf_hooks';
import { AlreadyExistsBehavior, FileSystem } from '@rushstack/node-core-library';
import { TapOptions } from 'tapable';

import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { Async } from '../utilities/Async';
import {
  IHeftEventActions,
  CoreConfigFiles,
  HeftEvent,
  IExtendedSharedCopyConfiguration
} from '../utilities/CoreConfigFiles';
import {
  IBuildStageContext,
  IBundleSubstage,
  ICompileSubstage,
  IPostBuildSubstage,
  IPreCompileSubstage
} from '../stages/BuildStage';
import { Constants } from '../utilities/Constants';

const PLUGIN_NAME: string = 'CopyFilesPlugin';
const HEFT_STAGE_TAP: TapOptions<'promise'> = {
  name: PLUGIN_NAME,
  stage: Number.MAX_SAFE_INTEGER / 2 // This should give us some certainty that this will run after other plugins
};

interface ICopyFileDescriptor {
  sourceFilePath: string;
  destinationFilePaths: string[];
  hardlink: boolean;
}

export interface ICopyFilesOptions {
  buildFolder: string;
  copyConfigurations: IExtendedSharedCopyConfiguration[];
  logger: ScopedLogger;
  watchMode: boolean;
}

export interface ICopyFilesResult {
  copiedFileCount: number;
  linkedFileCount: number;
}

export class CopyFilesPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      const logger: ScopedLogger = heftSession.requestScopedLogger('copy-files');
      build.hooks.preCompile.tap(PLUGIN_NAME, (preCompile: IPreCompileSubstage) => {
        preCompile.hooks.run.tapPromise(HEFT_STAGE_TAP, async () => {
          await this._runCopyFilesForHeftEvent(HeftEvent.preCompile, logger, heftConfiguration);
        });
      });

      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        compile.hooks.run.tapPromise(HEFT_STAGE_TAP, async () => {
          await this._runCopyFilesForHeftEvent(HeftEvent.compile, logger, heftConfiguration);
        });
      });

      build.hooks.bundle.tap(PLUGIN_NAME, (bundle: IBundleSubstage) => {
        bundle.hooks.run.tapPromise(HEFT_STAGE_TAP, async () => {
          await this._runCopyFilesForHeftEvent(HeftEvent.bundle, logger, heftConfiguration);
        });
      });

      build.hooks.postBuild.tap(PLUGIN_NAME, (postBuild: IPostBuildSubstage) => {
        postBuild.hooks.run.tapPromise(HEFT_STAGE_TAP, async () => {
          await this._runCopyFilesForHeftEvent(HeftEvent.postBuild, logger, heftConfiguration);
        });
      });
    });
  }

  private async _runCopyFilesForHeftEvent(
    heftEvent: HeftEvent,
    logger: ScopedLogger,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    const eventActions: IHeftEventActions = await CoreConfigFiles.getConfigConfigFileEventActionsAsync(
      logger.terminal,
      heftConfiguration
    );

    const copyConfigurations: IExtendedSharedCopyConfiguration[] = [];
    for (const copyFilesEventAction of eventActions.copyFiles.get(heftEvent) || []) {
      copyConfigurations.push(...copyFilesEventAction.copyOperations);
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

    const { copiedFileCount, linkedFileCount } = await this.copyFilesAsync(copyDescriptors);
    const duration: number = performance.now() - startTime;
    logger.terminal.writeLine(
      `Copied ${copiedFileCount} file${copiedFileCount === 1 ? '' : 's'} and ` +
        `linked ${linkedFileCount} file${linkedFileCount === 1 ? '' : 's'} in ${Math.round(duration)}ms`
    );

    // Then enter watch mode if requested
    if (options.watchMode) {
      await this._runWatchAsync(options);
    }
  }

  protected async copyFilesAsync(copyDescriptors: ICopyFileDescriptor[]): Promise<ICopyFilesResult> {
    if (copyDescriptors.length === 0) {
      return { copiedFileCount: 0, linkedFileCount: 0 };
    }

    let copiedFileCount: number = 0;
    let linkedFileCount: number = 0;
    await Async.forEachLimitAsync(
      copyDescriptors,
      Constants.maxParallelism,
      async (copyDescriptor: ICopyFileDescriptor) => {
        if (copyDescriptor.hardlink) {
          const hardlinkPromises: Promise<void>[] = copyDescriptor.destinationFilePaths.map(
            (destinationFilePath) => {
              return FileSystem.createHardLinkAsync({
                linkTargetPath: copyDescriptor.sourceFilePath,
                newLinkPath: destinationFilePath,
                alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
              });
            }
          );
          await Promise.all(hardlinkPromises);

          linkedFileCount++;
        } else {
          // If it's a copy, we will call the copy function
          if (copyDescriptor.destinationFilePaths.length === 1) {
            await FileSystem.copyFileAsync({
              sourcePath: copyDescriptor.sourceFilePath,
              destinationPath: copyDescriptor.destinationFilePaths[0],
              alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
            });
          } else {
            await FileSystem.copyFileToManyAsync({
              sourcePath: copyDescriptor.sourceFilePath,
              destinationPaths: copyDescriptor.destinationFilePaths,
              alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
            });
          }

          copiedFileCount++;
        }
      }
    );

    return {
      copiedFileCount,
      linkedFileCount
    };
  }

  private async _getCopyFileDescriptorsAsync(
    buildFolder: string,
    copyConfigurations: IExtendedSharedCopyConfiguration[]
  ): Promise<ICopyFileDescriptor[]> {
    // Create a map to deduplicate and prevent double-writes. The key in this map is the copy/link destination
    // file path
    const destinationCopyDescriptors: Map<string, ICopyFileDescriptor> = new Map();
    // And a map to contain the actual results. The key in this map is the copy/link source file path
    const sourceCopyDescriptors: Map<string, ICopyFileDescriptor> = new Map();

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
      for (const destinationFolderRelativePath of copyConfiguration.destinationFolders) {
        for (const sourceFileRelativePath of sourceFileRelativePaths) {
          // Only include the relative path from the sourceFolder if flatten is false
          const resolvedSourceFilePath: string = path.join(resolvedSourceFolderPath, sourceFileRelativePath);
          const resolvedDestinationFilePath: string = path.resolve(
            buildFolder,
            destinationFolderRelativePath,
            copyConfiguration.flatten ? '.' : path.dirname(sourceFileRelativePath),
            path.basename(sourceFileRelativePath)
          );

          // Throw if a duplicate copy target with a different source or options is specified
          const existingDestinationCopyDescriptor:
            | ICopyFileDescriptor
            | undefined = destinationCopyDescriptors.get(resolvedDestinationFilePath);
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

          // Finally, add to the map and default hardlink to false
          let sourceCopyDescriptor: ICopyFileDescriptor | undefined = sourceCopyDescriptors.get(
            resolvedSourceFilePath
          );
          if (!sourceCopyDescriptor) {
            sourceCopyDescriptor = {
              sourceFilePath: resolvedSourceFilePath,
              destinationFilePaths: [resolvedDestinationFilePath],
              hardlink: !!copyConfiguration.hardlink
            };
            sourceCopyDescriptors.set(resolvedSourceFilePath, sourceCopyDescriptor);
          } else {
            sourceCopyDescriptor.destinationFilePaths.push(resolvedDestinationFilePath);
          }

          // Add to other map to allow deduping
          destinationCopyDescriptors.set(resolvedDestinationFilePath, sourceCopyDescriptor);
        }
      }
    }

    // We're done with the map, grab the values and return
    return Array.from(sourceCopyDescriptors.values());
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
        const resolvedDestinationFolderPaths: string[] = copyConfiguration.destinationFolders.map(
          (destinationFolder) => {
            return path.join(buildFolder, destinationFolder);
          }
        );

        const watcher: chokidar.FSWatcher = chokidar.watch(globsToWatch, {
          cwd: resolvedSourceFolderPath,
          ignoreInitial: true,
          ignored: copyConfiguration.excludeGlobs
        });

        const copyAsset: (assetPath: string) => Promise<void> = async (assetPath: string) => {
          const { copiedFileCount, linkedFileCount } = await this.copyFilesAsync([
            {
              sourceFilePath: path.join(resolvedSourceFolderPath, assetPath),
              destinationFilePaths: resolvedDestinationFolderPaths.map((resolvedDestinationFolderPath) => {
                return path.join(
                  resolvedDestinationFolderPath,
                  copyConfiguration.flatten ? path.basename(assetPath) : assetPath
                );
              }),
              hardlink: !!copyConfiguration.hardlink
            }
          ]);
          logger.terminal.writeLine(
            copyConfiguration.hardlink
              ? `Linked ${linkedFileCount} file${linkedFileCount === 1 ? '' : 's'}`
              : `Copied ${copiedFileCount} file${copiedFileCount === 1 ? '' : 's'}`
          );
        };

        watcher.on('add', copyAsset);
        watcher.on('change', copyAsset);
        watcher.on('unlink', (assetPath) => {
          let deleteCount: number = 0;
          for (const resolvedDestinationFolder of resolvedDestinationFolderPaths) {
            FileSystem.deleteFile(path.resolve(resolvedDestinationFolder, assetPath));
            deleteCount++;
          }
          logger.terminal.writeLine(`Deleted ${deleteCount} file${deleteCount === 1 ? '' : 's'}`);
        });
      }
    }

    return new Promise(() => {
      /* never resolve */
    });
  }
}
