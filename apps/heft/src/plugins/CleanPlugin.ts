// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, Terminal } from '@rushstack/node-core-library';

import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { ICleanStageContext } from '../stages/CleanStage';

const PLUGIN_NAME: string = 'CleanPlugin';

export class CleanPlugin implements IHeftPlugin {
  public readonly displayName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.clean.tap(PLUGIN_NAME, (clean: ICleanStageContext) => {
      clean.hooks.deletePath.tapPromise(PLUGIN_NAME, async (pathToDelete: string) => {
        await this._deletePath(heftConfiguration.terminal, pathToDelete);
      });
    });
  }

  private _deletePath(terminal: Terminal, pathToDelete: string): void {
    try {
      FileSystem.deleteFile(pathToDelete, { throwIfNotExists: true });
      terminal.writeVerboseLine(`Deleted "${pathToDelete}"`);
    } catch (error) {
      if (FileSystem.exists(pathToDelete)) {
        FileSystem.deleteFolder(pathToDelete);
        terminal.writeVerboseLine(`Deleted folder "${pathToDelete}"`);
      }
    }
  }
}
