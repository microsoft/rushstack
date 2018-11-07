// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as path from 'path';

import { AsyncRecycler } from '../utilities/AsyncRecycler';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConstants } from '../logic/RushConstants';
import { RushGlobalFolder } from '../api/RushGlobalFolder';

/**
 * This class implements the logic for "rush purge"
 */
export class PurgeManager {
  private _rushConfiguration: RushConfiguration;
  private _rushGlobalFolder: RushGlobalFolder;
  private _commonTempFolderRecycler: AsyncRecycler;
  private _rushUserFolderRecycler: AsyncRecycler;

  public constructor(rushConfiguration: RushConfiguration, rushGlobalFolder: RushGlobalFolder) {
    this._rushConfiguration = rushConfiguration;
    this._rushGlobalFolder = rushGlobalFolder;

    const commonAsyncRecyclerPath: string = path.join(
      this._rushConfiguration.commonTempFolder,
      RushConstants.rushRecyclerFolderName
    );
    this._commonTempFolderRecycler = new AsyncRecycler(commonAsyncRecyclerPath);

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
  public deleteAll(): void {
    this._commonTempFolderRecycler.deleteAll();
    this._rushUserFolderRecycler.deleteAll();
  }

  public get commonTempFolderRecycler(): AsyncRecycler {
    return this._commonTempFolderRecycler;
  }

  /**
   * Delete everything from the common/temp folder
   */
  public purgeNormal(): void {
    // Delete everything under common\temp except for the recycler folder itself
    console.log('Purging ' + this._rushConfiguration.commonTempFolder);

    this._commonTempFolderRecycler.moveAllItemsInFolder(this._rushConfiguration.commonTempFolder,
      this._getMembersToExclude(this._rushConfiguration.commonTempFolder));
  }

  /**
   * In addition to performing the purgeNormal() operation, this method also cleans the
   * .rush folder in the user's home directory.
   */
  public purgeUnsafe(): void {
    this.purgeNormal();

    // Also delete everything under ~/.rush/node-v4.5.6/ except for the recycler folder itself
    console.log('Purging ' + this._rushGlobalFolder.nodeSpecificPath);
    this._rushUserFolderRecycler.moveAllItemsInFolder(this._rushGlobalFolder.nodeSpecificPath,
      this._getMembersToExclude(this._rushGlobalFolder.nodeSpecificPath));
  }

  private _getMembersToExclude(folderToRecycle: string): string[] {
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

        // Warn that we won't dispose this folder
        console.log(colors.yellow('The active process\'s folder will not be deleted: '
          + path.join(folderToRecycle, firstPart)));
      }
    }

    return membersToExclude;
  }
}
