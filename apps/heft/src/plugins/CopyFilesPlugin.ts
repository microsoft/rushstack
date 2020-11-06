// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import glob from 'glob';
import { performance } from 'perf_hooks';
import { AlreadyExistsBehavior, FileSystem, LegacyAdapters } from '@rushstack/node-core-library';
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

const globEscape: (unescaped: string[]) => string[] = require('glob-escape'); // No @types/glob-escape package exists

const PLUGIN_NAME: string = 'CopyFilesPlugin';
const HEFT_STAGE_TAP: TapOptions<'promise'> = {
  name: PLUGIN_NAME,
  stage: Number.MAX_SAFE_INTEGER / 2 // This should give us some certainty that this will run after other plugins
};

const MAX_PARALLELISM: number = 100;

export interface ICopyFileDescriptor {
  sourceFilePath: string;
  destinationFilePath: string;
  hardlink: boolean;
}

export interface ICopyFilesOptions {
  buildFolder: string;
  copyConfigurations: IExtendedSharedCopyConfiguration[];
  logger: ScopedLogger;
}

export class CopyFilesPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    const logger: ScopedLogger = heftSession.requestScopedLogger('copy-files');
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
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
      logger
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

    const [copyCount, hardlinkCount] = await this.copyFilesAsync(copyDescriptors);
    const duration: number = performance.now() - startTime;
    logger.terminal.writeLine(
      `Copied ${copyCount} file${copyCount === 1 ? '' : 's'} and linked ${hardlinkCount} ` +
        `file${hardlinkCount === 1 ? '' : 's'} in ${Math.round(duration)}ms`
    );
  }

  protected async copyFilesAsync(copyDescriptors: ICopyFileDescriptor[]): Promise<[number, number]> {
    if (copyDescriptors.length === 0) {
      return [0, 0];
    }

    let copyCount: number = 0;
    let hardlinkCount: number = 0;
    await Async.forEachLimitAsync(
      copyDescriptors,
      MAX_PARALLELISM,
      async (copyDescriptor: ICopyFileDescriptor) => {
        if (copyDescriptor.hardlink) {
          // Hardlink doesn't allow passing in overwrite param, so delete ourselves
          try {
            await FileSystem.deleteFileAsync(copyDescriptor.destinationFilePath, { throwIfNotExists: true });
          } catch (e) {
            if (!FileSystem.isFileDoesNotExistError(e)) {
              throw e;
            }
            // Since the file doesn't exist, the parent folder may also not exist
            await FileSystem.ensureFolderAsync(path.dirname(copyDescriptor.destinationFilePath));
          }

          await FileSystem.createHardLinkAsync({
            linkTargetPath: copyDescriptor.sourceFilePath,
            newLinkPath: copyDescriptor.destinationFilePath
          });
          hardlinkCount++;
        } else {
          // If it's a copy, simply call the copy function
          await FileSystem.copyFileAsync({
            sourcePath: copyDescriptor.sourceFilePath,
            destinationPath: copyDescriptor.destinationFilePath,
            alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
          });
          copyCount++;
        }
      }
    );

    return [copyCount, hardlinkCount];
  }

  private async _getCopyFileDescriptorsAsync(
    buildFolder: string,
    copyConfigurations: IExtendedSharedCopyConfiguration[]
  ): Promise<ICopyFileDescriptor[]> {
    // Create a map to deduplicate and prevent double-writes
    // resolvedDestinationFilePath -> [resolvedSourceFilePath, hardlink]
    const destinationCopyDescriptors: Map<string, ICopyFileDescriptor> = new Map();

    for (const copyConfiguration of copyConfigurations) {
      // Resolve the source folder path which is where the glob will be run from
      const resolvedSourceFolderPath: string = path.resolve(buildFolder, copyConfiguration.sourceFolder);

      // Glob extensions with a specific glob to increase perf
      let sourceFileRelativePaths: Set<string>;
      if (copyConfiguration.fileExtensions?.length) {
        const escapedExtensions: string[] = globEscape(copyConfiguration.fileExtensions);
        const pattern: string = `**/*+(${escapedExtensions.join('|')})`;
        sourceFileRelativePaths = await this._expandGlobPatternAsync(
          resolvedSourceFolderPath,
          pattern,
          copyConfiguration.excludeGlobs
        );
      } else {
        sourceFileRelativePaths = new Set<string>();
      }

      // Now include the other glob as well
      for (const include of copyConfiguration.includeGlobs || []) {
        const explicitlyIncludedPaths: Set<string> = await this._expandGlobPatternAsync(
          resolvedSourceFolderPath,
          include,
          copyConfiguration.excludeGlobs
        );

        for (const explicitlyIncludedPath of explicitlyIncludedPaths) {
          sourceFileRelativePaths.add(explicitlyIncludedPath);
        }
      }

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
          const existingCopyDescriptor: ICopyFileDescriptor | undefined = destinationCopyDescriptors.get(
            resolvedDestinationFilePath
          );
          if (existingCopyDescriptor) {
            if (
              existingCopyDescriptor.sourceFilePath === resolvedSourceFilePath &&
              existingCopyDescriptor.hardlink === !!copyConfiguration.hardlink
            ) {
              // Found a duplicate, avoid adding again
              continue;
            }
            throw new Error(
              `Cannot copy different files to the same destination "${resolvedDestinationFilePath}"`
            );
          }

          // Finally, add to the map and default hardlink to false
          destinationCopyDescriptors.set(resolvedDestinationFilePath, {
            sourceFilePath: resolvedSourceFilePath,
            destinationFilePath: resolvedDestinationFilePath,
            hardlink: !!copyConfiguration.hardlink
          });
        }
      }
    }

    // We're done with the map, grab the values and return
    return Array.from(destinationCopyDescriptors.values());
  }

  private async _expandGlobPatternAsync(
    resolvedSourceFolderPath: string,
    pattern: string,
    exclude: string[] | undefined
  ): Promise<Set<string>> {
    const results: string[] = await LegacyAdapters.convertCallbackToPromise(glob, pattern, {
      cwd: resolvedSourceFolderPath,
      nodir: true,
      ignore: exclude
    });

    return new Set<string>(results);
  }
}
