// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, FileSystemStats } from '@rushstack/node-core-library';
import { Tap } from 'tapable';

import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import {
  IBuildStageContext,
  IBundleSubstage,
  ICompileSubstage,
  IPostBuildSubstage,
  IPreCompileSubstage
} from '../stages/BuildStage';
import { HeftConfigFiles } from '../utilities/HeftConfigFiles';
import { Async } from '../utilities/Async';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';

const PLUGIN_NAME: string = 'CopyPlugin';

export interface ICopySpecifier {
  sourcePath: string;
  destinationPath: string;
  hardlinkInsteadOfCopy?: boolean;
}

export interface ICopyConfiguration {
  buildStage: {
    beforePreCompile?: ICopySpecifier[];
    beforeCompile?: ICopySpecifier[];
    beforeBundle?: ICopySpecifier[];
    beforePostBuild?: ICopySpecifier[];
    afterPostBuild?: ICopySpecifier[];
  };
}

const MAX_RECURSIVE_PARALLELISM: number = 50;

export class CopyPlugin implements IHeftPlugin {
  public pluginName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration, options?: never): void {
    let copyConfiguration: ICopyConfiguration;

    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.loadStageConfiguration.tapPromise(PLUGIN_NAME, async () => {
        try {
          copyConfiguration = await HeftConfigFiles.copyConfigurationFileLoader.loadConfigurationFileAsync(
            path.resolve(heftConfiguration.buildFolder, 'config', 'copy.json')
          );
        } catch (e) {
          if (!FileSystem.isNotExistError) {
            throw e;
          }
        }
      });

      const beforeTap: Tap = {
        name: PLUGIN_NAME,
        stage: Number.MIN_SAFE_INTEGER / 2 // This should give us some certainty that this will run before other plugins
      } as Tap; /* the typings are wrong here */

      const afterTap: Tap = {
        name: PLUGIN_NAME,
        stage: Number.MAX_SAFE_INTEGER / 2 // This should give us some certainty that this will run after other plugins
      } as Tap; /* the typings are wrong here */

      const logger: ScopedLogger = heftSession.requestScopedLogger('copy');

      build.hooks.preCompile.tap(PLUGIN_NAME, (preCompile: IPreCompileSubstage) => {
        if (copyConfiguration.buildStage.beforePreCompile?.length) {
          preCompile.hooks.run.tapPromise(beforeTap, async () => {
            await this._doCopyForStageAsync(logger, copyConfiguration.buildStage.beforePreCompile!);
          });
        }
      });

      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        if (copyConfiguration.buildStage.beforeCompile?.length) {
          compile.hooks.run.tapPromise(beforeTap, async () => {
            await this._doCopyForStageAsync(logger, copyConfiguration.buildStage.beforeCompile!);
          });
        }
      });

      build.hooks.bundle.tap(PLUGIN_NAME, (bundle: IBundleSubstage) => {
        if (copyConfiguration.buildStage.beforeBundle?.length) {
          bundle.hooks.run.tapPromise(beforeTap, async () => {
            await this._doCopyForStageAsync(logger, copyConfiguration.buildStage.beforeBundle!);
          });
        }
      });

      build.hooks.postBuild.tap(PLUGIN_NAME, (postBuild: IPostBuildSubstage) => {
        if (copyConfiguration.buildStage.beforePostBuild?.length) {
          postBuild.hooks.run.tapPromise(beforeTap, async () => {
            await this._doCopyForStageAsync(logger, copyConfiguration.buildStage.beforePostBuild!);
          });
        }

        if (copyConfiguration.buildStage.afterPostBuild?.length) {
          postBuild.hooks.run.tapPromise(afterTap, async () => {
            await this._doCopyForStageAsync(logger, copyConfiguration.buildStage.beforePostBuild!);
          });
        }
      });
    });
  }

  private async _doCopyForStageAsync(
    logger: ScopedLogger,
    stageCopyConfiguration: ICopySpecifier[]
  ): Promise<void> {
    let copyCount: number = 0;
    let linkCount: number = 0;

    await Async.forEachLimitAsync(
      stageCopyConfiguration,
      MAX_RECURSIVE_PARALLELISM,
      async (copy: ICopySpecifier) => {
        let destinationStatistics: FileSystemStats | undefined = undefined;
        try {
          destinationStatistics = await FileSystem.getStatisticsAsync(copy.destinationPath);
        } catch (e) {
          if (!FileSystem.isNotExistError(e)) {
            throw e;
          }
        }

        if (destinationStatistics?.isDirectory()) {
          await FileSystem.deleteFolderAsync(copy.destinationPath);
        } else {
          await FileSystem.deleteFileAsync(copy.destinationPath);
        }

        const count: number = await this._createLinksOrCopiesRecursive(
          copy.sourcePath,
          copy.destinationPath,
          !!copy.hardlinkInsteadOfCopy
        );

        if (copy.hardlinkInsteadOfCopy) {
          linkCount += count;
        } else {
          copyCount += count;
        }
      }
    );

    logger.terminal.writeVerboseLine(`Copied ${copyCount} files.`);
    logger.terminal.writeVerboseLine(`Linked ${linkCount} files.`);
  }

  private async _createLinksOrCopiesRecursive(
    sourcePath: string,
    destinationPath: string,
    hardlinkInsteadOfCopy: boolean
  ): Promise<number> {
    let copyCount: number = 0;
    const targetStats: FileSystemStats = await FileSystem.getStatisticsAsync(sourcePath);
    if (targetStats.isDirectory()) {
      await FileSystem.ensureFolderAsync(destinationPath);
      const folderContents: string[] = await FileSystem.readFolderAsync(sourcePath);
      await Async.forEachLimitAsync(folderContents, MAX_RECURSIVE_PARALLELISM, async (folderElementName) => {
        // eslint-disable-next-line require-atomic-updates
        copyCount += await this._createLinksOrCopiesRecursive(
          path.join(destinationPath, folderElementName),
          path.join(sourcePath, folderElementName),
          hardlinkInsteadOfCopy
        );
      });
    } else {
      if (hardlinkInsteadOfCopy) {
        await FileSystem.createHardLinkAsync({ newLinkPath: destinationPath, linkTargetPath: sourcePath });
      } else {
        await FileSystem.copyFileAsync({ sourcePath: sourcePath, destinationPath: destinationPath });
      }

      copyCount++;
    }

    return copyCount;
  }
}
