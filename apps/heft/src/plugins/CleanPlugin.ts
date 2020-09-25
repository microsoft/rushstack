// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as glob from 'glob';
import * as globEscape from 'glob-escape';
import { FileSystem, LegacyAdapters } from '@rushstack/node-core-library';

import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { ICleanStageContext } from '../stages/CleanStage';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { IHeftEventActions, ConfigFile } from '../utilities/ConfigFile';
import { Async } from '../utilities/Async';

const PLUGIN_NAME: string = 'CleanPlugin';

export class CleanPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.clean.tap(PLUGIN_NAME, (clean: ICleanStageContext) => {
      const logger: ScopedLogger = heftSession.requestScopedLogger('clean');

      clean.hooks.run.tapPromise(PLUGIN_NAME, async () => {
        await this._runDeleteForHeftEvent('clean', logger, heftConfiguration, clean.properties.pathsToDelete);
      });
    });
  }

  private async _runDeleteForHeftEvent(
    heftEventName: string,
    logger: ScopedLogger,
    heftConfiguration: HeftConfiguration,
    additionalPathsToDelete?: Set<string>
  ): Promise<void> {
    let deletedFiles: number = 0;
    let deletedFolders: number = 0;

    const eventActions: IHeftEventActions = await ConfigFile.getConfigConfigFileEventActionsAsync(
      heftConfiguration
    );

    const pathsToDelete: Set<string> = new Set<string>(additionalPathsToDelete);
    for (const deleteGlobsEventAction of eventActions.deleteGlobs) {
      if (deleteGlobsEventAction.heftEvent === heftEventName) {
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
    }

    await Async.forEachLimitAsync(Array.from(pathsToDelete), 100, async (pathToDelete) => {
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
    });

    if (deletedFiles > 0 || deletedFolders > 0) {
      logger.terminal.writeLine(`Deleted ${deletedFiles} files and ${deletedFolders} folders`);
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
