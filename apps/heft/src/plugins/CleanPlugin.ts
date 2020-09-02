// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';

import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { ICleanStageContext } from '../stages/CleanStage';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';

const PLUGIN_NAME: string = 'CleanPlugin';

export class CleanPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.clean.tap(PLUGIN_NAME, (clean: ICleanStageContext) => {
      const logger: ScopedLogger = heftSession.requestScopedLogger('clean');

      clean.hooks.deletePath.tapPromise(PLUGIN_NAME, async (pathToDelete: string) => {
        await this._deletePath(logger, pathToDelete);
      });
    });
  }

  private _deletePath(logger: ScopedLogger, pathToDelete: string): void {
    try {
      FileSystem.deleteFile(pathToDelete, { throwIfNotExists: true });
      logger.terminal.writeVerboseLine(`Deleted "${pathToDelete}"`);
    } catch (error) {
      if (FileSystem.exists(pathToDelete)) {
        FileSystem.deleteFolder(pathToDelete);
        logger.terminal.writeVerboseLine(`Deleted folder "${pathToDelete}"`);
      }
    }
  }
}
