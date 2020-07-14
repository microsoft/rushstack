// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as _ from 'lodash';

import { FlagFileBase } from './FlagFileBase';
import { PackageManagerName } from './packageManager/PackageManager';
import { RushConfiguration } from './RushConfiguration';
import { IPackageJson } from '@rushstack/node-core-library';

export const LAST_INSTALL_FLAG_FILE_NAME: string = 'last-install.flag';

/**
 * The interface for the LastInstallFlag JSON file.
 *
 * @internal
 */
export interface ILastInstallFlagJson {
  /**
   * The Node.js version used.
   */
  node?: string;

  /**
   * The package manager used.
   */
  packageManager?: PackageManagerName;

  /**
   * The package manager version used.
   */
  packageManagerVersion?: string;

  /**
   * A package.json associated with the install flag.
   */
  packageJson?: IPackageJson;

  /**
   * The absolute path to the package store used by the package manager.
   */
  storePath?: string;

  /**
   * Whether or not workspaces was used.
   */
  workspaces?: boolean;
}

/**
 * A helper class for managing last-install flags, which are persistent and
 * indicate that something installed in the folder was successfully completed.
 * It also compares state, so that if something like the Node.js version has changed,
 * it can invalidate the last install.
 * @internal
 */
export class LastInstallFlag extends FlagFileBase<ILastInstallFlagJson> {
  /**
   * Creates a new LastInstall flag
   * @param folderPath - the folder that this flag is managing
   * @param state - optional, the state that should be managed or compared
   */
  public constructor(folderPath: string, state: ILastInstallFlagJson = {}) {
    super(path.join(folderPath, LAST_INSTALL_FLAG_FILE_NAME), state);
  }

  /**
   * Gets the current state of the Rush repo. This state is used to compare against
   * the last-known-good state tracked by the LastInstall flag.
   * @param rushConfiguration - the configuration of the Rush repo to get the install
   * state from
   */
  public static getCurrentState(rushConfiguration: RushConfiguration): ILastInstallFlagJson {
    const currentState: ILastInstallFlagJson = {
      node: process.versions.node,
      packageManager: rushConfiguration.packageManager,
      packageManagerVersion: rushConfiguration.packageManagerToolVersion
    };

    if (currentState.packageManager === 'pnpm' && rushConfiguration.pnpmOptions) {
      currentState.storePath = rushConfiguration.pnpmOptions.pnpmStorePath;
      if (rushConfiguration.pnpmOptions.useWorkspaces) {
        currentState.workspaces = rushConfiguration.pnpmOptions.useWorkspaces;
      }
    }

    return currentState;
  }

  /**
   * Returns true if the file exists and the contents match the current state.
   * @param reportStoreIssues - default false, validation will throw if the package manager store
   * is not valid.
   */
  public isValid(reportStoreIssues: boolean = false): boolean {
    const oldState: ILastInstallFlagJson | undefined = this.loadFromFile();
    if (!oldState) {
      return false;
    } else if (_.isEqual(oldState, this.state)) {
      return true;
    }

    if (reportStoreIssues) {
      const pkgManager: PackageManagerName | undefined = this.state.packageManager;
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
            'Current PNPM store path does not match the last one used. This may cause inconsistency in your builds.\n\n' +
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
