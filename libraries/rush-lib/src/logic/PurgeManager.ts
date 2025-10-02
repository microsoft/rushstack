// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { Colorize } from '@rushstack/terminal';

import { AsyncRecycler } from '../utilities/AsyncRecycler';
import type { RushConfiguration } from '../api/RushConfiguration';
import { RushConstants } from './RushConstants';
import type { RushGlobalFolder } from '../api/RushGlobalFolder';

/**
 * This class implements the logic for "rush purge"
 */
export class PurgeManager {
  private _rushConfiguration: RushConfiguration;
  private _rushGlobalFolder: RushGlobalFolder;
  private _rushUserFolderRecycler: AsyncRecycler;

  public readonly commonTempFolderRecycler: AsyncRecycler;

  public constructor(rushConfiguration: RushConfiguration, rushGlobalFolder: RushGlobalFolder) {
    this._rushConfiguration = rushConfiguration;
    this._rushGlobalFolder = rushGlobalFolder;

    const commonAsyncRecyclerPath: string = path.join(
      this._rushConfiguration.commonTempFolder,
      RushConstants.rushRecyclerFolderName
    );
    this.commonTempFolderRecycler = new AsyncRecycler(commonAsyncRecyclerPath);

    const rushUserAsyncRecyclerPath: string = path.join(
      this._rushGlobalFolder.path,
      RushConstants.rushRecyclerFolderName
    );
    this._rushUserFolderRecycler = new AsyncRecycler(rushUserAsyncRecyclerPath);
  }

  /**
   * Performs the AsyncRecycler.deleteAll() operation.  This should be called before
   * the PurgeManager instance is disposed.
   */
  public async startDeleteAllAsync(): Promise<void> {
    await Promise.all([
      this.commonTempFolderRecycler.startDeleteAllAsync(),
      this._rushUserFolderRecycler.startDeleteAllAsync()
    ]);
  }

  /**
   * Delete everything from the common/temp folder
   */
  public purgeNormal(): void {
    // Delete everything under common\temp except for the recycler folder itself
    // eslint-disable-next-line no-console
    console.log('Purging ' + this._rushConfiguration.commonTempFolder);

    this.commonTempFolderRecycler.moveAllItemsInFolder(
      this._rushConfiguration.commonTempFolder,
      this._getMembersToExclude(this._rushConfiguration.commonTempFolder, true)
    );
  }

  /**
   * In addition to performing the purgeNormal() operation, this method also cleans the
   * .rush folder in the user's home directory.
   */
  public purgeUnsafe(): void {
    this.purgeNormal();

    // We will delete everything under ~/.rush/ except for the recycler folder itself
    // eslint-disable-next-line no-console
    console.log('Purging ' + this._rushGlobalFolder.path);

    // If Rush itself is running under a folder such as  ~/.rush/node-v4.5.6/rush-1.2.3,
    // we cannot delete that folder.

    // First purge the node-specific folder, e.g. ~/.rush/node-v4.5.6/* except for rush-1.2.3:
    this._rushUserFolderRecycler.moveAllItemsInFolder(
      this._rushGlobalFolder.nodeSpecificPath,
      this._getMembersToExclude(this._rushGlobalFolder.nodeSpecificPath, true)
    );

    // Then purge the the global folder, e.g. ~/.rush/* except for node-v4.5.6
    this._rushUserFolderRecycler.moveAllItemsInFolder(
      this._rushGlobalFolder.path,
      this._getMembersToExclude(this._rushGlobalFolder.path, false)
    );

    if (
      this._rushConfiguration.isPnpm &&
      this._rushConfiguration.pnpmOptions.pnpmStore === 'global' &&
      this._rushConfiguration.pnpmOptions.pnpmStorePath
    ) {
      // eslint-disable-next-line no-console
      console.warn(Colorize.yellow(`Purging the global pnpm-store`));
      this._rushUserFolderRecycler.moveAllItemsInFolder(this._rushConfiguration.pnpmOptions.pnpmStorePath);
    }
  }

  private _getMembersToExclude(folderToRecycle: string, showWarning: boolean): string[] {
    // Don't recycle the recycler
    const membersToExclude: string[] = [RushConstants.rushRecyclerFolderName];

    // If the current process is running inside one of the folders, don't recycle that either
    // Example: "/home/user/.rush/rush-1.2.3/lib/example.js"
    const currentFolderPath: string = path.resolve(__dirname);

    // Example:
    // folderToRecycle = "/home/user/.rush/node-v4.5.6"
    // relative =  "rush-1.2.3/lib/example.js"
    const relative: string = path.relative(folderToRecycle, currentFolderPath);

    // (The result can be an absolute path if the two folders are on different drive letters)
    if (!path.isAbsolute(relative)) {
      // Get the first path segment:
      const firstPart: string = relative.split(/[\\\/]/)[0];
      if (firstPart.length > 0 && firstPart !== '..') {
        membersToExclude.push(firstPart);

        if (showWarning) {
          // Warn that we won't dispose this folder
          // eslint-disable-next-line no-console
          console.log(
            Colorize.yellow(
              "The active process's folder will not be deleted: " + path.join(folderToRecycle, firstPart)
            )
          );
        }
      }
    }

    return membersToExclude;
  }
}
