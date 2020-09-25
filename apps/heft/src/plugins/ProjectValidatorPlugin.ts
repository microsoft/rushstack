// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import { FileSystem, LegacyAdapters } from '@rushstack/node-core-library';

import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { Constants } from '../utilities/Constants';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { HeftSession } from '../pluginFramework/HeftSession';
import { IHeftLifecycle } from '../pluginFramework/HeftLifecycle';

const ALLOWED_HEFT_DATA_FOLDER_FILES: Set<string> = new Set<string>();
const ALLOWED_HEFT_DATA_FOLDER_SUBFOLDERS: Set<string> = new Set<string>([Constants.buildCacheFolderName]);

const PLUGIN_NAME: string = 'ProjectValidatorPlugin';

/**
 * This plugin is a place to do generic project-level validation. For example, ensuring that only expected
 * files are in the ".heft" folder (i.e. - legacy config files aren't still there)
 */
export class ProjectValidatorPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.heftLifecycle.tap(PLUGIN_NAME, (heftLifecycle: IHeftLifecycle) => {
      heftLifecycle.hooks.toolStart.tapPromise(PLUGIN_NAME, async () => {
        const logger: ScopedLogger = heftSession.requestScopedLogger('project-validation');
        await this._scanHeftDataFolderAsync(logger, heftConfiguration);
      });
    });
  }

  private async _scanHeftDataFolderAsync(
    logger: ScopedLogger,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    // TODO: Replace this with a FileSystem API
    let heftDataFolderContents: fs.Dirent[];
    try {
      // Use this instead of fs.promises to avoid a warning in older versions of Node
      heftDataFolderContents = await LegacyAdapters.convertCallbackToPromise(
        fs.readdir,
        heftConfiguration.projectHeftDataFolder,
        {
          withFileTypes: true
        }
      );
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      } else {
        return;
      }
    }

    const disallowedItemNames: string[] = [];
    for (const folderItem of heftDataFolderContents) {
      const itemName: string = folderItem.name;
      if (folderItem.isDirectory()) {
        if (!ALLOWED_HEFT_DATA_FOLDER_SUBFOLDERS.has(itemName)) {
          disallowedItemNames.push(`"${itemName}/"`);
        }
      } else {
        if (!ALLOWED_HEFT_DATA_FOLDER_FILES.has(itemName)) {
          disallowedItemNames.push(`"${itemName}"`);
        }
      }
    }

    if (disallowedItemNames.length > 0) {
      logger.emitWarning(
        new Error(
          `Found unexpected items in the "${Constants.projectHeftFolderName}" ` +
            `folder: ${disallowedItemNames.join(', ')}. If any of these are config files, they ` +
            `should go in the project's "${Constants.projectConfigFolderName}" folder.`
        )
      );
    }
  }
}
