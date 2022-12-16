// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile, Import, Path, IPackageJson } from '@rushstack/node-core-library';

import { BaseFlag } from './base/BaseFlag';
import type { PackageManagerName } from './packageManager/PackageManager';
import type { RushConfiguration } from './RushConfiguration';
import type { RushConfigurationProject } from './RushConfigurationProject';

const lodash: typeof import('lodash') = Import.lazy('lodash', require);

export const LAST_INSTALL_FLAG_FILE_NAME: string = 'last-install.flag';

/**
 * Install project state
 * @internal
 */
export interface IInstallProject
  extends Pick<RushConfigurationProject, 'packageName' | 'projectRelativeFolder'> {
  ignoreScripts?: boolean;
}

/**
 * This represents the JSON data structure for the "last-install.flag" file.
 * @internal
 */
export interface ILastInstallFlagJson {
  /**
   * Current node version
   */
  nodeVersion: string;
  /**
   * Current package manager name
   */
  packageManager: PackageManagerName;
  /**
   * Current package manager version
   */
  packageManagerVersion: string;
  /**
   * Current rush json folder
   */
  rushJsonFolder: string;
  /**
   * The content of package.json, used in the flag file of autoinstaller
   */
  autoinstallerPackageJson?: IPackageJson;
  /**
   * Same with pnpmOptions.pnpmStorePath in rush.json
   */
  pnpmStorePath?: string;
  /**
   * @deprecated Use `pnpmStorePath` instead
   */
  storePath?: string;
  /**
   * True when "useWorkspaces" is true in rush.json
   */
  useWorkspaces?: true;
  /**
   * installed projects information indexed by packageName
   */
  installProjects?: Record<string, IInstallProject>;
  /**
   * The hash of .npmrc file
   */
  npmrcHash?: string;
}

/**
 * @internal
 */
export type ILastInstallStateProperty = keyof ILastInstallFlagJson;

/**
 * @internal
 */
export interface ILockfileValidityCheckOptions {
  statePropertiesToIgnore?: ILastInstallStateProperty[];
  rushVerb?: string;
}

/**
 * A helper class for managing last-install flags, which are persistent and
 * indicate that something installed in the folder was successfully completed.
 * It also compares state, so that if something like the Node.js version has changed,
 * it can invalidate the last install.
 * @internal
 */
export class LastInstallFlag extends BaseFlag<ILastInstallFlagJson> {
  /**
   * Check whether selected project is installed
   * @internal
   */
  public isSelectedProjectInstalled(): boolean {
    let oldState: ILastInstallFlagJson;
    try {
      oldState = JsonFile.load(this._path);
    } catch (err) {
      return false;
    }

    const newState: ILastInstallFlagJson = { ...this._state };

    if (oldState.installProjects && newState.installProjects) {
      const newInstallProjectList: IInstallProject[] = Object.values(newState.installProjects);
      const oldInstallProjectList: IInstallProject[] = Object.values(oldState.installProjects);
      const omitProperties: (keyof IInstallProject)[] = ['ignoreScripts'];
      if (oldInstallProjectList.length >= newInstallProjectList.length) {
        if (
          lodash.differenceWith(
            Object.values(newState.installProjects),
            Object.values(oldState.installProjects),
            (a, b) => {
              return lodash.isEqual(lodash.omit(a, omitProperties), lodash.omit(b, omitProperties));
            }
          ).length === 0
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * @override
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
    let oldState: ILastInstallFlagJson;
    try {
      oldState = JsonFile.load(this.path);
    } catch (err) {
      return false;
    }

    const newState: ILastInstallFlagJson = { ...this._state };

    const omitProperties: (keyof ILastInstallFlagJson)[] = statePropertiesToIgnore || [];

    if (!lodash.isEqual(lodash.omit(oldState, omitProperties), lodash.omit(newState, omitProperties))) {
      if (checkValidAndReportStoreIssues) {
        const pkgManager: PackageManagerName = newState.packageManager as PackageManagerName;
        if (pkgManager === 'pnpm') {
          if (
            // Only throw an error if the package manager hasn't changed from PNPM
            oldState.packageManager === pkgManager
          ) {
            // storePath is the legacy name for pnpmStorePath
            const normalizedOldStorePath: string = oldState.pnpmStorePath
              ? Path.convertToPlatformDefault(oldState.pnpmStorePath)
              : oldState.storePath
              ? Path.convertToPlatformDefault(oldState.storePath)
              : '<global>';
            const normalizedNewStorePath: string = newState.pnpmStorePath
              ? Path.convertToPlatformDefault(newState.pnpmStorePath)
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
    extraState: Partial<ILastInstallFlagJson> = {}
  ): LastInstallFlag {
    const currentState: ILastInstallFlagJson = {
      nodeVersion: process.versions.node,
      packageManager: rushConfiguration.packageManager,
      packageManagerVersion: rushConfiguration.packageManagerToolVersion,
      rushJsonFolder: rushConfiguration.rushJsonFolder,
      ...extraState
    };

    if (currentState.packageManager === 'pnpm' && rushConfiguration.pnpmOptions) {
      currentState.pnpmStorePath = rushConfiguration.pnpmOptions.pnpmStorePath;
      if (rushConfiguration.pnpmOptions.useWorkspaces) {
        currentState.useWorkspaces = rushConfiguration.pnpmOptions.useWorkspaces;
      }
    }

    return new LastInstallFlag(rushConfiguration.commonTempFolder, currentState);
  }
}
