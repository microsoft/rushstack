// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { RushConfiguration } from '../api/RushConfiguration';
import { Utilities } from '../utilities/Utilities';
import { FileSystem } from '@microsoft/node-core-library';

/**
 * This class implements the logic for "rush unlink"
 */
export class UnlinkManager {
  private _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  /**
   * Delete flag file and all the existing node_modules
   * symlinks
   */
  public unlink(): boolean {
    this._deleteFlagFile();
    return this._deleteSymlinks();
  }

  /**
   * Delete all the node_modules symlinks of configured Rush
   * projects
   * */
  private _deleteSymlinks(): boolean {
    let didDeleteSymlinks: boolean = false;

    for (const rushProject of this._rushConfiguration.projects) {
      const localModuleFolder: string = path.join(rushProject.projectFolder, 'node_modules');
      if (FileSystem.exists(localModuleFolder)) {
        console.log('Purging ' + localModuleFolder);
        Utilities.dangerouslyDeletePath(localModuleFolder);
        didDeleteSymlinks = true;
      }
    }

    return didDeleteSymlinks;
  }

  /**
   * Delete the flag file if it exists; this will ensure that
   * a full "rush link" is required next time
   */
  private _deleteFlagFile(): void {
    Utilities.deleteFile(this._rushConfiguration.rushLinkJsonFilename);
  }
}
