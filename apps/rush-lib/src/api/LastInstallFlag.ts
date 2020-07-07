// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as _ from 'lodash';
import { FileSystem, JsonFile, JsonObject } from '@rushstack/node-core-library';

import { PackageManagerName } from './packageManager/PackageManager';

export const LAST_INSTALL_FLAG_FILE_NAME: string = 'last-install.flag';

/**
 * A helper class for managing last-install flags, which are persistent and
 * indicate that something installed in the folder was successfully completed.
 * It also compares state, so that if something like the Node.js version has changed,
 * it can invalidate the last install.
 * @internal
 */
export class LastInstallFlag {
  private _path: string;
  private _state: JsonObject;

  /**
   * Creates a new LastInstall flag
   * @param folderPath - the folder that this flag is managing
   * @param state - optional, the state that should be managed or compared
   */
  public constructor(folderPath: string, state: JsonObject = {}) {
    this._path = path.join(folderPath, LAST_INSTALL_FLAG_FILE_NAME);
    this._state = state;
  }

  /**
   * Returns true if the file exists and the contents match the current state.
   */
  public isValid(): boolean {
    return this._isValid(false);
  }

  /**
   * Same as isValid(), but with an additional check:  If the current state is not equal to the previous
   * state, and an the current state causes an error, then throw an exception with a friendly message.
   */
  public checkValidAndReportStoreIssues(): boolean {
    return this._isValid(true);
  }

  private _isValid(checkValidAndReportStoreIssues: boolean): boolean {
    if (!FileSystem.exists(this._path)) {
      return false;
    }

    let oldState: JsonObject;
    try {
      oldState = JsonFile.load(this._path);
    } catch (err) {
      return false;
    }

    const newState: JsonObject = this._state;

    if (!_.isEqual(oldState, newState)) {
      if (checkValidAndReportStoreIssues) {
        const pkgManager: PackageManagerName = newState.packageManager;
        if (pkgManager === 'pnpm') {
          if (
            // Only throw an error if the package manager hasn't changed from PNPM
            oldState.packageManager === pkgManager && // Throw if the store path changed
            oldState.storePath &&
            oldState.storePath !== newState.storePath
          ) {
            const oldStorePath: string = oldState.storePath || '<global>';
            const newStorePath: string = newState.storePath || '<global>';

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

    return true;
  }

  /**
   * Writes the flag file to disk with the current state
   */
  public create(): void {
    JsonFile.save(this._state, this._path, {
      ensureFolderExists: true
    });
  }

  /**
   * Removes the flag file
   */
  public clear(): void {
    FileSystem.deleteFile(this._path);
  }

  /**
   * Returns the full path to the flag file
   */
  public get path(): string {
    return this._path;
  }
}
