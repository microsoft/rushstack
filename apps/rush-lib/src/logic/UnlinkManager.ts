// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as path from 'path';
import { FileSystem } from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { Utilities } from '../utilities/Utilities';
import { PnpmProjectDependencyManifest } from './pnpm/PnpmProjectDependencyManifest';
import { LastLinkFlag } from '../api/LastLinkFlag';
import { AlreadyReportedError } from '../utilities/AlreadyReportedError';

/**
 * This class implements the logic for "rush unlink"
 */
export class UnlinkManager {
  private _rushConfiguration: RushConfiguration;
  private _lastLinkFlag: LastLinkFlag;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    this._lastLinkFlag = new LastLinkFlag(rushConfiguration.commonTempFolder);
  }

  /**
   * Delete flag file and all the existing node_modules symlinks and all
   * project/.rush/temp/shrinkwrap-deps.json files
   *
   * Returns true if anything was deleted.
   *
   * @param force - (default false) Whether or not the unlink should be forced
   */
  public unlink(force: boolean = false): boolean {
    const useWorkspaces: boolean =
      this._rushConfiguration.packageManager === 'pnpm' &&
      this._rushConfiguration.pnpmOptions &&
      this._rushConfiguration.pnpmOptions.useWorkspaces;
    if (!force && useWorkspaces) {
      console.log(
        colors.red(
          '"rush unlink" is not supported when workspaces is enabled. Run "rush purge" to remove' +
            ' links between projects.'
        )
      );
      throw new AlreadyReportedError();
    }

    this._lastLinkFlag.clear();
    return this._deleteProjectFiles();
  }

  /**
   * Delete:
   *  - all the node_modules symlinks of configured Rush projects
   *  - all of the project/.rush/temp/shrinkwrap-deps.json files of configured Rush projects
   *
   * Returns true if anything was deleted
   * */
  private _deleteProjectFiles(): boolean {
    let didDeleteAnything: boolean = false;

    for (const rushProject of this._rushConfiguration.projects) {
      const localModuleFolder: string = path.join(rushProject.projectFolder, 'node_modules');
      if (FileSystem.exists(localModuleFolder)) {
        console.log(`Purging ${localModuleFolder}`);
        Utilities.dangerouslyDeletePath(localModuleFolder);
        didDeleteAnything = true;
      }

      const projectDependencyManifestFilePath: string = PnpmProjectDependencyManifest.getFilePathForProject(
        rushProject
      );
      if (FileSystem.exists(projectDependencyManifestFilePath)) {
        console.log(`Deleting ${projectDependencyManifestFilePath}`);
        FileSystem.deleteFile(projectDependencyManifestFilePath);
        didDeleteAnything = true;
      }
    }

    return didDeleteAnything;
  }
}
