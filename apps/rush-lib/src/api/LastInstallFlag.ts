// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as _ from 'lodash';
import { JsonObject } from '@rushstack/node-core-library';

import { BaseFlagFile } from './BaseFlagFile';
import { PackageManagerName } from './packageManager/PackageManager';

export const LAST_INSTALL_FLAG_FILE_NAME: string = 'last-install.flag';

/**
 * A helper class for managing last-install flags, which are persistent and
 * indicate that something installed in the folder was successfully completed.
 * It also compares state, so that if something like the Node.js version has changed,
 * it can invalidate the last install.
 * @internal
 */
export class LastInstallFlag extends BaseFlagFile {
  /**
   * Creates a new LastInstall flag
   * @param folderPath - the folder that this flag is managing
   * @param state - optional, the state that should be managed or compared
   */
  public constructor(folderPath: string, state: JsonObject = {}) {
    super(path.join(folderPath, LAST_INSTALL_FLAG_FILE_NAME), state);
  }

  /**
   * Returns true if the file exists and the contents match the current state.
   * @param reportStoreIssues - default false, validation will throw if the package manager store
   * is not valid.
   */
  public isValid(reportStoreIssues: boolean = false): boolean {
    const oldState: JsonObject | undefined = this.loadFromFile();
    if (_.isEqual(oldState, this.state)) {
      return true;
    }

    if (reportStoreIssues) {
      const pkgManager: PackageManagerName = this.state.packageManager;
      if (pkgManager === 'pnpm') {
        if (
          // Only throw an error if the package manager hasn't changed from PNPM
          oldState.packageManager === pkgManager && // Throw if the store path changed
          oldState.storePath &&
          oldState.storePath !== this.state.storePath
        ) {
          const oldStorePath: string = oldState.storePath || '<global>';
          const newStorePath: string = this.state.storePath || '<global>';

          throw new Error(
            'Current PNPM store path does not match the last one used.' +
              '  This may cause inconsistency in your builds.\n\n' +
              'If you wish to install with the new store path, please run "rush update --purge"\n\n' +
              `Old Path: ${oldStorePath}\n` +
              `New Path: ${newStorePath}`
          );
        }
      }
    }

    return false;
  }
}
