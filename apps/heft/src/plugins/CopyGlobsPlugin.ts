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

const PLUGIN_NAME: string = 'CopyGlobsPlugin';
const HEFT_STAGE_TAP: TapOptions<'promise'> = {
  name: PLUGIN_NAME,
  stage: Number.MAX_SAFE_INTEGER / 2 // This should give us some certainty that this will run after other plugins
};

const MAX_PARALLELISM: number = 100;

export class CopyGlobsPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    const logger: ScopedLogger = heftSession.requestScopedLogger('copy-globs');
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
    for (const copyFilesEventAction of eventActions.copyGlobs.get(heftEvent) || []) {
      for (const globPattern of copyFilesEventAction.globsToCopy) {
        const resolvedSourceFilePaths: string[] = await this._resolvePathAsync(
          globPattern,
          heftConfiguration.buildFolder
        );
        for (const resolvedSourceFilePath of resolvedSourceFilePaths) {
          let resolvedTargetPathsMap: Map<string, boolean> | undefined = fileOperationMap.get(
            resolvedSourceFilePath
          );
          if (!resolvedTargetPathsMap) {
            resolvedTargetPathsMap = new Map<string, boolean>();
            fileOperationMap.set(resolvedSourceFilePath, resolvedTargetPathsMap);
          }

          for (const targetFolder of copyFilesEventAction.targetFolders) {
            resolvedTargetPathsMap.set(
              path.resolve(
                heftConfiguration.buildFolder,
                targetFolder,
                path.basename(resolvedSourceFilePath)
              ),
              copyFilesEventAction.hardlink || false
            );
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
      logger.terminal.writeLine(`Linked ${linkedFiles} files`);
    }
    if (copiedFiles > 0) {
      logger.terminal.writeLine(`Copied ${copiedFiles} files`);
    }
  }

  private async _resolvePathAsync(globPattern: string, buildFolder: string): Promise<string[]> {
    if (globEscape(globPattern) !== globPattern) {
      const expandedGlob: string[] = await LegacyAdapters.convertCallbackToPromise(glob, globPattern, {
        cwd: buildFolder
      });

      const result: string[] = [];
      for (const pathFromGlob of expandedGlob) {
        result.push(path.resolve(buildFolder, pathFromGlob));
      }

      return result;
    } else {
      return [path.resolve(buildFolder, globPattern)];
    }
  }
}
