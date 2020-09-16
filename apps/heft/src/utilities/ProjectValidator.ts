// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';

import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { Constants } from './Constants';
import { FileSystem, LegacyAdapters } from '@rushstack/node-core-library';

const ALLOWED_HEFT_DATA_FOLDER_FILES: Set<string> = new Set<string>();
const ALLOWED_HEFT_DATA_FOLDER_SUBFOLDERS: Set<string> = new Set<string>([Constants.buildCacheFolderName]);

export class ProjectValidator {
  public static async validateProjectFoldersAsync(heftConfiguration: HeftConfiguration): Promise<void> {
    await ProjectValidator._scanHeftDataFolderAsync(heftConfiguration);
  }

  private static async _scanHeftDataFolderAsync(heftConfiguration: HeftConfiguration): Promise<void> {
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
      throw new Error(
        `Found unexpected items in the "${Constants.projectHeftFolderName}" ` +
          `folder: ${disallowedItemNames.join(', ')}. If any of these are config files, they ` +
          `should go in the project's "${Constants.projectConfigFolderName}" folder.`
      );
    }
  }
}
