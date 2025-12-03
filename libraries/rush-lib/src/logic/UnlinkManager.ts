// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, AlreadyReportedError } from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';

import type { RushConfiguration } from '../api/RushConfiguration';
import { Utilities } from '../utilities/Utilities';
import { BaseProjectShrinkwrapFile } from './base/BaseProjectShrinkwrapFile';
import { FlagFile } from '../api/FlagFile';
import { RushConstants } from './RushConstants';

/**
 * This class implements the logic for "rush unlink"
 */
export class UnlinkManager {
  private _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  /**
   * Delete flag file and all the existing node_modules symlinks and all
   * project/.rush/temp/shrinkwrap-deps.json files
   *
   * Returns true if anything was deleted.
   */
  public async unlinkAsync(force: boolean = false): Promise<boolean> {
    const useWorkspaces: boolean =
      this._rushConfiguration.pnpmOptions && this._rushConfiguration.pnpmOptions.useWorkspaces;
    if (!force && useWorkspaces) {
      // eslint-disable-next-line no-console
      console.log(
        Colorize.red(
          'Unlinking is not supported when using workspaces. Run "rush purge" to remove ' +
            'project node_modules folders.'
        )
      );
      throw new AlreadyReportedError();
    }

    await new FlagFile(
      this._rushConfiguration.defaultSubspace.getSubspaceTempFolderPath(),
      RushConstants.lastLinkFlagFilename,
      {}
    ).clearAsync();
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
        // eslint-disable-next-line no-console
        console.log(`Purging ${localModuleFolder}`);
        Utilities.dangerouslyDeletePath(localModuleFolder);
        didDeleteAnything = true;
      }

      const projectShrinkwrapFilePath: string = BaseProjectShrinkwrapFile.getFilePathForProject(rushProject);
      if (FileSystem.exists(projectShrinkwrapFilePath)) {
        // eslint-disable-next-line no-console
        console.log(`Deleting ${projectShrinkwrapFilePath}`);
        FileSystem.deleteFile(projectShrinkwrapFilePath);
        didDeleteAnything = true;
      }
    }

    return didDeleteAnything;
  }
}
