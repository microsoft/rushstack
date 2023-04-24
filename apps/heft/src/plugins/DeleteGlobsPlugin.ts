// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import glob from 'glob';
import { FileSystem, LegacyAdapters, Async } from '@rushstack/node-core-library';

import { HeftEventPluginBase } from '../pluginFramework/HeftEventPluginBase';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import {
  IHeftEventActions,
  HeftEvent,
  IHeftConfigurationDeleteGlobsEventAction
} from '../utilities/CoreConfigFiles';
import { ICleanStageProperties } from '../stages/CleanStage';
import { IBuildStageProperties } from '../stages/BuildStage';
import { Constants } from '../utilities/Constants';

const globEscape: (unescaped: string) => string = require('glob-escape'); // No @types/glob-escape package exists

export class DeleteGlobsPlugin extends HeftEventPluginBase<IHeftConfigurationDeleteGlobsEventAction> {
  public readonly pluginName: string = 'DeleteGlobsPlugin';
  protected eventActionName: keyof IHeftEventActions = 'deleteGlobs';
  protected loggerName: string = 'delete-globs';

  /**
   * @override
   */
  protected async handleCleanEventActionsAsync(
    heftEvent: HeftEvent,
    heftEventActions: IHeftConfigurationDeleteGlobsEventAction[],
    logger: ScopedLogger,
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    properties: ICleanStageProperties
  ): Promise<void> {
    await this._runDeleteForHeftEventActions(
      heftEventActions,
      logger,
      heftConfiguration,
      properties.pathsToDelete
    );
  }

  /**
   * @override
   */
  protected async handleBuildEventActionsAsync(
    heftEvent: HeftEvent,
    heftEventActions: IHeftConfigurationDeleteGlobsEventAction[],
    logger: ScopedLogger,
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    properties: IBuildStageProperties
  ): Promise<void> {
    await this._runDeleteForHeftEventActions(heftEventActions, logger, heftConfiguration);
  }

  private async _runDeleteForHeftEventActions(
    heftEventActions: IHeftConfigurationDeleteGlobsEventAction[],
    logger: ScopedLogger,
    heftConfiguration: HeftConfiguration,
    additionalPathsToDelete?: Set<string>
  ): Promise<void> {
    let deletedFiles: number = 0;
    let deletedFolders: number = 0;

    const pathsToDelete: Set<string> = new Set<string>(additionalPathsToDelete);
    for (const deleteGlobsEventAction of heftEventActions) {
      for (const globPattern of deleteGlobsEventAction.globsToDelete) {
        const resolvedPaths: string[] = await this._resolvePathAsync(
          globPattern,
          heftConfiguration.buildFolder
        );
        for (const resolvedPath of resolvedPaths) {
          pathsToDelete.add(resolvedPath);
        }
      }
    }

    await Async.forEachAsync(
      pathsToDelete,
      async (pathToDelete) => {
        try {
          FileSystem.deleteFile(pathToDelete, { throwIfNotExists: true });
          logger.terminal.writeVerboseLine(`Deleted "${pathToDelete}"`);
          deletedFiles++;
        } catch (error) {
          if (FileSystem.exists(pathToDelete)) {
            FileSystem.deleteFolder(pathToDelete);
            logger.terminal.writeVerboseLine(`Deleted folder "${pathToDelete}"`);
            deletedFolders++;
          }
        }
      },
      { concurrency: Constants.maxParallelism }
    );

    if (deletedFiles > 0 || deletedFolders > 0) {
      logger.terminal.writeLine(
        `Deleted ${deletedFiles} file${deletedFiles !== 1 ? 's' : ''} ` +
          `and ${deletedFolders} folder${deletedFolders !== 1 ? 's' : ''}`
      );
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
