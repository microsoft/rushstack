// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, IPackageJson, JsonFile } from '@rushstack/node-core-library';
import * as splitWorkspaceGlobalPnpmfile from './SplitWorkspaceGlobalPnpmfileShim';

import type {
  IPnpmfileContext,
  ISplitWorkspacePnpmfileShimSettings,
  IWorkspaceProjectInfo
} from './IPnpmfile';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { PnpmPackageManager } from '../../api/packageManager/PnpmPackageManager';

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
      splitWorkspacePnpmfileShimSettings:
        SplitWorkspacePnpmfileConfiguration._getSplitWorkspacePnpmfileShimSettings(rushConfiguration)
    };
  }

  /**
   * Split workspace use global pnpmfile, because in split workspace, user may set `shared-workspace-lockfile=false`.
   * That means each project owns their individual pnpmfile under project folder. While the global pnpmfile could be
   * under the common/temp-split/ folder and be used by all split workspace projects.
   */
  public static async writeCommonTempSplitGlobalPnpmfileAsync(
    rushConfiguration: RushConfiguration
  ): Promise<void> {
    if (rushConfiguration.packageManager !== 'pnpm') {
      throw new Error(
        `PnpmfileConfiguration cannot be used with package manager "${rushConfiguration.packageManager}"`
      );
    }

    const targetDir: string = rushConfiguration.commonTempSplitFolder;
    const splitWorkspaceGlobalPnpmfilePath: string = path.join(
      targetDir,
      (rushConfiguration.packageManagerWrapper as PnpmPackageManager).globalPnpmfileFilename
    );

    // Write the shim itself
    await FileSystem.copyFileAsync({
      sourcePath: path.join(__dirname, 'SplitWorkspaceGlobalPnpmfileShim.js'),
      destinationPath: splitWorkspaceGlobalPnpmfilePath
    });

    const splitWorkspaceGlobalPnpmfileShimSettings: ISplitWorkspacePnpmfileShimSettings =
      SplitWorkspacePnpmfileConfiguration._getSplitWorkspacePnpmfileShimSettings(rushConfiguration);

    // Write the settings file used by the shim
    await JsonFile.saveAsync(
      splitWorkspaceGlobalPnpmfileShimSettings,
      path.join(targetDir, 'pnpmfileSettings.json'),
      {
        ensureFolderExists: true
      }
    );
  }

  private static _getSplitWorkspacePnpmfileShimSettings(
    rushConfiguration: RushConfiguration
  ): ISplitWorkspacePnpmfileShimSettings {
    const workspaceProjects: Record<string, IWorkspaceProjectInfo> = {};
    const splitWorkspaceProjects: Record<string, IWorkspaceProjectInfo> = {};
    for (const project of rushConfiguration.projects) {
      const { packageName, projectRelativeFolder, packageJson } = project;
      const workspaceProjectInfo: IWorkspaceProjectInfo = {
        packageName,
        projectRelativeFolder,
        packageVersion: packageJson.version
      };
      (project.splitWorkspace ? splitWorkspaceProjects : workspaceProjects)[packageName] =
        workspaceProjectInfo;
    }

    const settings: ISplitWorkspacePnpmfileShimSettings = {
      workspaceProjects,
      splitWorkspaceProjects,
      semverPath: require.resolve('semver')
    };

    // common/config/rush/.pnpmfile-split-workspace.cjs
    const userPnpmfilePath: string = path.join(
      rushConfiguration.commonRushConfigFolder,
      (rushConfiguration.packageManagerWrapper as PnpmPackageManager).splitWorkspacePnpmfileFilename
    );
    if (FileSystem.exists(userPnpmfilePath)) {
      settings.userPnpmfilePath = userPnpmfilePath;
    }

    return settings;
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
