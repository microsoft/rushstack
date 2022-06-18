// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, IPackageJson, JsonFile } from '@rushstack/node-core-library';

import { PnpmPackageManager } from '../../api/packageManager/PnpmPackageManager';
import * as splitWorkspaceGlobalPnpmfile from './SplitWorkspaceGlobalPnpmfileShim';

import type {
  IPnpmfileContext,
  ISplitWorkspaceGlobalPnpmfileShimSettings,
  WorkspaceProjectInfo
} from './IPnpmfile';
import { RushConfiguration } from '../../api/RushConfiguration';

/**
 * Loads PNPM's pnpmfile.js configuration, and invokes it to preprocess package.json files,
 * optionally utilizing a pnpmfile shim to inject preferred versions.
 */
export class SplitWorkspacePnpmfileConfiguration {
  private _context: IPnpmfileContext | undefined;

  public constructor(rushConfiguration: RushConfiguration) {
    if (rushConfiguration.packageManager !== 'pnpm') {
      throw new Error(
        `PnpmfileConfiguration cannot be used with package manager "${rushConfiguration.packageManager}"`
      );
    }

    // Set the context to swallow log output and store our settings
    this._context = {
      log: (message: string) => {},
      splitWorkspaceGlobalPnpmfileShimSettings:
        SplitWorkspacePnpmfileConfiguration._getSplitWorkspaceGlobalPnpmfileShimSettings(rushConfiguration)
    };
  }

  public static async writeCommonTempSplitGlobalPnpmfileAsync(
    rushConfiguration: RushConfiguration
  ): Promise<void> {
    if (rushConfiguration.packageManager !== 'pnpm') {
      throw new Error(
        `PnpmfileConfiguration cannot be used with package manager "${rushConfiguration.packageManager}"`
      );
    }

    const targetDir: string = rushConfiguration.commonTempSplitFolder;
    const pnpmfilePath: string = path.join(
      targetDir,
      (rushConfiguration.packageManagerWrapper as PnpmPackageManager).globalPnpmfileFilename
    );

    // Write the shim itself
    await FileSystem.copyFileAsync({
      sourcePath: path.join(__dirname, 'SplitWorkspaceGlobalPnpmfileShim.js'),
      destinationPath: pnpmfilePath
    });

    const splitWorkspaceGlobalPnpmfileShimSettings: ISplitWorkspaceGlobalPnpmfileShimSettings =
      SplitWorkspacePnpmfileConfiguration._getSplitWorkspaceGlobalPnpmfileShimSettings(rushConfiguration);

    // Write the settings file used by the shim
    await JsonFile.saveAsync(
      splitWorkspaceGlobalPnpmfileShimSettings,
      path.join(targetDir, 'globalPnpmfileSettings.json'),
      {
        ensureFolderExists: true
      }
    );
  }

  private static _getSplitWorkspaceGlobalPnpmfileShimSettings(
    rushConfiguration: RushConfiguration
  ): ISplitWorkspaceGlobalPnpmfileShimSettings {
    const workspaceProjects: Record<string, WorkspaceProjectInfo> = {};
    const splitWorkspaceProjects: Record<string, WorkspaceProjectInfo> = {};
    for (const project of rushConfiguration.projects) {
      const { packageName, projectRelativeFolder, packageJson } = project;
      const workspaceProjectInfo: WorkspaceProjectInfo = {
        packageName,
        projectRelativeFolder,
        packageVersion: packageJson.version
      };
      (project.splitWorkspace ? splitWorkspaceProjects : workspaceProjects)[packageName] =
        workspaceProjectInfo;
    }

    return {
      workspaceProjects,
      splitWorkspaceProjects
    };
  }

  /**
   * Transform a package.json file using the pnpmfile.js hook.
   * @returns the tranformed object, or the original input if pnpmfile.js was not found.
   */
  public transform(packageJson: IPackageJson): IPackageJson {
    if (!splitWorkspaceGlobalPnpmfile.hooks?.readPackage || !this._context) {
      return packageJson;
    } else {
      return splitWorkspaceGlobalPnpmfile.hooks.readPackage(packageJson, this._context);
    }
  }
}
