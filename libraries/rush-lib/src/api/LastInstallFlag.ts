// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { FileSystem, JsonFile, type JsonObject, Path } from '@rushstack/node-core-library';

import type { PackageManagerName } from './packageManager/PackageManager';
import type { RushConfiguration } from './RushConfiguration';
import { objectsAreDeepEqual } from '../utilities/objectUtilities';
import type { Subspace } from './Subspace';

export const LAST_INSTALL_FLAG_FILE_NAME: string = 'last-install.flag';

/**
 * @internal
 */
export interface ILockfileValidityCheckOptions {
  statePropertiesToIgnore?: string[];
  rushVerb?: string;
}

/**
 * A helper class for managing last-install flags, which are persistent and
 * indicate that something installed in the folder was successfully completed.
 * It also compares state, so that if something like the Node.js version has changed,
 * it can invalidate the last install.
 * @internal
 */
export class LastInstallFlag {
  private _state: JsonObject;

  /**
   * Returns the full path to the flag file
   */
  public readonly path: string;

  /**
   * Creates a new LastInstall flag
   * @param folderPath - the folder that this flag is managing
   * @param state - optional, the state that should be managed or compared
   */
  public constructor(folderPath: string, state: JsonObject = {}) {
    this.path = path.join(folderPath, this.flagName);
    this._state = state;
  }

  /**
   * Returns true if the file exists and the contents match the current state.
   */
  public isValid(options?: ILockfileValidityCheckOptions): boolean {
    return this._isValid(false, options);
  }

  /**
   * Same as isValid(), but with an additional check:  If the current state is not equal to the previous
   * state, and an the current state causes an error, then throw an exception with a friendly message.
   *
   * @internal
   */
  public checkValidAndReportStoreIssues(
    options: ILockfileValidityCheckOptions & { rushVerb: string }
  ): boolean {
    return this._isValid(true, options);
  }

  private _isValid(checkValidAndReportStoreIssues: false, options?: ILockfileValidityCheckOptions): boolean;
  private _isValid(
    checkValidAndReportStoreIssues: true,
    options: ILockfileValidityCheckOptions & { rushVerb: string }
  ): boolean;
  private _isValid(
    checkValidAndReportStoreIssues: boolean,
    { rushVerb = 'update', statePropertiesToIgnore }: ILockfileValidityCheckOptions = {}
  ): boolean {
    let oldState: JsonObject;
    try {
      oldState = JsonFile.load(this.path);
    } catch (err) {
      return false;
    }

    const newState: JsonObject = { ...this._state };

    if (statePropertiesToIgnore) {
      for (const optionToIgnore of statePropertiesToIgnore) {
        delete newState[optionToIgnore];
        delete oldState[optionToIgnore];
      }
    }

    if (!objectsAreDeepEqual(oldState, newState)) {
      if (checkValidAndReportStoreIssues) {
        const pkgManager: PackageManagerName = newState.packageManager as PackageManagerName;
        if (pkgManager === 'pnpm') {
          if (
            // Only throw an error if the package manager hasn't changed from PNPM
            oldState.packageManager === pkgManager
          ) {
            const normalizedOldStorePath: string = oldState.storePath
              ? Path.convertToPlatformDefault(oldState.storePath)
              : '<global>';
            const normalizedNewStorePath: string = newState.storePath
              ? Path.convertToPlatformDefault(newState.storePath)
              : '<global>';
            if (
              // Throw if the store path changed
              normalizedOldStorePath !== normalizedNewStorePath
            ) {
              throw new Error(
                'Current PNPM store path does not match the last one used. This may cause inconsistency in your builds.\n\n' +
                  `If you wish to install with the new store path, please run "rush ${rushVerb} --purge"\n\n` +
                  `Old Path: ${normalizedOldStorePath}\n` +
                  `New Path: ${normalizedNewStorePath}`
              );
            }
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
    JsonFile.save(this._state, this.path, {
      ensureFolderExists: true
    });
  }

  /**
   * Removes the flag file
   */
  public clear(): void {
    FileSystem.deleteFile(this.path);
  }

  /**
   * Returns the name of the flag file
   */
  protected get flagName(): string {
    return LAST_INSTALL_FLAG_FILE_NAME;
  }
}

/**
 * A helper class for LastInstallFlag
 *
 * @internal
 */
export class LastInstallFlagFactory {
  /**
   * Gets the LastInstall flag and sets the current state. This state is used to compare
   * against the last-known-good state tracked by the LastInstall flag.
   * @param rushConfiguration - the configuration of the Rush repo to get the install
   * state from
   *
   * @internal
   */
  public static getCommonTempFlag(
    rushConfiguration: RushConfiguration,
    subspace: Subspace,
    extraState: Record<string, string> = {}
  ): LastInstallFlag {
    const currentState: JsonObject = {
      node: process.versions.node,
      packageManager: rushConfiguration.packageManager,
      packageManagerVersion: rushConfiguration.packageManagerToolVersion,
      rushJsonFolder: rushConfiguration.rushJsonFolder,
      ...extraState
    };

    if (currentState.packageManager === 'pnpm' && rushConfiguration.pnpmOptions) {
      currentState.storePath = rushConfiguration.pnpmOptions.pnpmStorePath;
      if (rushConfiguration.pnpmOptions.useWorkspaces) {
        currentState.workspaces = rushConfiguration.pnpmOptions.useWorkspaces;
      }
    }

    return new LastInstallFlag(subspace.getSubspaceTempFolder(), currentState);
  }
}
