// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { AsyncRecycler } from '../../utilities/AsyncRecycler';
import { RushConfiguration } from '../../data/RushConfiguration';
import { RushConstants } from '../../RushConstants';

/**
 * This class implements the logic for "rush purge"
 */
export class PurgeManager {
  private _rushConfiguration: RushConfiguration;
  private _commonTempFolderRecycler: AsyncRecycler;
  private _rushUserFolderRecycler: AsyncRecycler;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;

    const commonAsyncRecyclerPath: string = path.join(this._rushConfiguration.commonTempFolder,
      RushConstants.rushRecyclerFolderName);
    this._commonTempFolderRecycler = new AsyncRecycler(commonAsyncRecyclerPath);

    const rushUserAsyncRecyclerPath: string = path.join(this._rushConfiguration.rushUserFolder,
      RushConstants.rushRecyclerFolderName);
    this._rushUserFolderRecycler = new AsyncRecycler(rushUserAsyncRecyclerPath);
  }

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
      [RushConstants.rushRecyclerFolderName]);
  }

  /** */
  public purgeUnsafe(): void {
    this.purgeNormal();

    // Also delete everything under ~/.rush except for the recycler folder itself
    console.log('Purging ' + this._rushConfiguration.rushUserFolder);
    this._rushUserFolderRecycler.moveAllItemsInFolder(this._rushConfiguration.rushUserFolder,
      [RushConstants.rushRecyclerFolderName]);
  }
}
