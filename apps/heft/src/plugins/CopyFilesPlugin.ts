// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import glob from 'glob';
import { AlreadyExistsBehavior, FileSystem, LegacyAdapters } from '@rushstack/node-core-library';
import { TapOptions } from 'tapable';

import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { IHeftEventActions, CoreConfigFiles, HeftEvent } from '../utilities/CoreConfigFiles';
import { Async } from '../utilities/Async';
import {
  IBuildStageContext,
  IBundleSubstage,
  ICompileSubstage,
  IPostBuildSubstage,
  IPreCompileSubstage
} from '../stages/BuildStage';

const globEscape: (unescaped: string) => string = require('glob-escape'); // No @types/glob-escape package exists

const PLUGIN_NAME: string = 'CopyFilesPlugin';
const HEFT_STAGE_TAP: TapOptions<'promise'> = {
  name: PLUGIN_NAME,
  stage: Number.MAX_SAFE_INTEGER / 2 // This should give us some certainty that this will run after other plugins
};

const MAX_PARALLELISM: number = 100;

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

    // Build a map to dedupe copy operations
    const fileOperationMap: Map<string, Map<string, boolean>> = new Map<string, Map<string, boolean>>();
    for (const copyFilesEventAction of eventActions.copyFiles.get(heftEvent) || []) {
      for (const copyOperation of copyFilesEventAction.copyOperations) {
        // Default the resolved sourceFolder path to the current build folder
        const resolvedSourceFolderPath: string = path.resolve(
          heftConfiguration.buildFolder,
          copyOperation.sourceFolder ?? '.'
        );
        // Run each glob against the resolved sourceFolder and flatten out the results
        const resolvedSourceFilePaths: string[] = (
          await Promise.all(
            copyOperation.includeGlobs.map((includeGlob) => {
              return this._resolvePathAsync(
                resolvedSourceFolderPath,
                includeGlob,
                copyOperation.excludeGlobs
              );
            })
          )
        ).reduce((prev: string[], curr: string[]) => {
          prev.push(...curr);
          return prev;
        }, []);

        // Determine the target path for each source file and append to the correct map
        for (const resolvedSourceFilePath of resolvedSourceFilePaths) {
          let resolvedDestinationPathsMap: Map<string, boolean> | undefined = fileOperationMap.get(
            resolvedSourceFilePath
          );
          if (!resolvedDestinationPathsMap) {
            resolvedDestinationPathsMap = new Map<string, boolean>();
            fileOperationMap.set(resolvedSourceFilePath, resolvedDestinationPathsMap);
          }

          for (const destinationFolder of copyOperation.destinationFolders) {
            // Only include the relative path from the sourceFolder if flatten is false
            const resolvedDestinationFilePath: string = path.resolve(
              heftConfiguration.buildFolder,
              destinationFolder,
              copyOperation.flatten
                ? '.'
                : path.relative(resolvedSourceFolderPath, path.dirname(resolvedSourceFilePath)),
              path.basename(resolvedSourceFilePath)
            );
            resolvedDestinationPathsMap.set(resolvedDestinationFilePath, copyOperation.hardlink || false);
          }
        }
      }
    }

    // Flatten out the map to simplify processing
    const flattenedOperationMap: [string, string, boolean][] = [];
    for (const [sourceFilePath, destinationMap] of fileOperationMap.entries()) {
      for (const [destinationFilePath, hardlink] of destinationMap.entries()) {
        flattenedOperationMap.push([sourceFilePath, destinationFilePath, hardlink]);
      }
    }

    let linkedFiles: number = 0;
    let copiedFiles: number = 0;
    await Async.forEachLimitAsync(
      flattenedOperationMap,
      MAX_PARALLELISM,
      async ([sourceFilePath, targetFilePath, hardlink]) => {
        if (hardlink) {
          // Hardlink doesn't allow passing in overwrite param, so delete ourselves
          try {
            await FileSystem.deleteFileAsync(targetFilePath);
          } catch (e) {
            if (!FileSystem.isFileDoesNotExistError(e)) {
              throw e;
            }
          }

          await FileSystem.ensureFolderAsync(path.dirname(targetFilePath));
          await FileSystem.createHardLinkAsync({
            linkTargetPath: sourceFilePath,
            newLinkPath: targetFilePath
          });
          logger.terminal.writeVerboseLine(`Linked "${sourceFilePath}" to "${targetFilePath}"`);
          linkedFiles++;
        } else {
          await FileSystem.copyFileAsync({
            sourcePath: sourceFilePath,
            destinationPath: targetFilePath,
            alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
          });
          logger.terminal.writeVerboseLine(`Copied "${sourceFilePath}" to "${targetFilePath}"`);
          copiedFiles++;
        }
      }
    );

    if (linkedFiles > 0) {
      logger.terminal.writeLine(`Linked ${linkedFiles} file${linkedFiles > 1 ? 's' : ''}`);
    }
    if (copiedFiles > 0) {
      logger.terminal.writeLine(`Copied ${copiedFiles} file${copiedFiles > 1 ? 's' : ''}`);
    }
  }

  private async _resolvePathAsync(
    sourceFolder: string,
    globPattern: string,
    excludeGlobPatterns?: string[]
  ): Promise<string[]> {
    if (globEscape(globPattern) !== globPattern) {
      const expandedGlob: string[] = await LegacyAdapters.convertCallbackToPromise(glob, globPattern, {
        cwd: sourceFolder,
        ignore: excludeGlobPatterns
      });

      const result: string[] = [];
      for (const pathFromGlob of expandedGlob) {
        result.push(path.resolve(sourceFolder, pathFromGlob));
      }

      return result;
    } else {
      return [path.resolve(sourceFolder, globPattern)];
    }
  }
}
