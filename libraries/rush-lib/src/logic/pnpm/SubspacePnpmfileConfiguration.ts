// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, Import, type IPackageJson, JsonFile } from '@rushstack/node-core-library';
import * as subspaceGlobalPnpmfile from './SubspaceGlobalPnpmfileShim';
import { subspacePnpmfileShimFilename, scriptsFolderPath } from '../../utilities/PathConstants';

import type { IPnpmfileContext, ISubspacePnpmfileShimSettings, IWorkspaceProjectInfo } from './IPnpmfile';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { PnpmPackageManager } from '../../api/packageManager/PnpmPackageManager';
import { SubspacesConfiguration } from '../../api/SubspacesConfiguration';
import { RushConstants } from '../RushConstants';

/**
 * Loads PNPM's pnpmfile.js configuration, and invokes it to preprocess package.json files,
 * optionally utilizing a pnpmfile shim to inject preferred versions.
 */
export class SubspacePnpmfileConfiguration {
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
      subspacePnpmfileShimSettings: SubspacePnpmfileConfiguration._getSubspacePnpmfileShimSettings(
        rushConfiguration,
        ''
      )
    };
  }

  /**
   * Split workspace use global pnpmfile, because in split workspace, user may set `shared-workspace-lockfile=false`.
   * That means each project owns their individual pnpmfile under project folder. While the global pnpmfile could be
   * under the common/temp-split/ folder and be used by all split workspace projects.
   */
  public static async writeCommonTempSubspaceGlobalPnpmfileAsync(
    rushConfiguration: RushConfiguration,
    subspaceName: string
  ): Promise<void> {
    if (rushConfiguration.packageManager !== 'pnpm') {
      throw new Error(
        `PnpmfileConfiguration cannot be used with package manager "${rushConfiguration.packageManager}"`
      );
    }

    const targetDir: string = rushConfiguration.getCommonTempFolder(subspaceName);
    const subspaceGlobalPnpmfilePath: string = path.join(targetDir, RushConstants.pnpmfileGlobalFilename);

    // Write the shim itself
    await FileSystem.copyFileAsync({
      sourcePath: `${scriptsFolderPath}/${subspacePnpmfileShimFilename}`,
      destinationPath: subspaceGlobalPnpmfilePath
    });

    const subspaceGlobalPnpmfileShimSettings: ISubspacePnpmfileShimSettings =
      SubspacePnpmfileConfiguration._getSubspacePnpmfileShimSettings(rushConfiguration, subspaceName);

    // Write the settings file used by the shim
    await JsonFile.saveAsync(
      subspaceGlobalPnpmfileShimSettings,
      path.join(targetDir, 'pnpmfileSettings.json'),
      {
        ensureFolderExists: true
      }
    );
  }

  private static _getSubspacePnpmfileShimSettings(
    rushConfiguration: RushConfiguration,
    subspaceName: string
  ): ISubspacePnpmfileShimSettings {
    const workspaceProjects: Record<string, IWorkspaceProjectInfo> = {};
    const subspaceProjects: Record<string, IWorkspaceProjectInfo> = {};
    for (const project of rushConfiguration.projects) {
      const { packageName, projectRelativeFolder, packageJson } = project;
      const workspaceProjectInfo: IWorkspaceProjectInfo = {
        packageName,
        projectRelativeFolder,
        packageVersion: packageJson.version
      };
      (SubspacesConfiguration.belongsInSubspace(project, subspaceName)
        ? subspaceProjects
        : workspaceProjects)[packageName] = workspaceProjectInfo;
    }

    const settings: ISubspacePnpmfileShimSettings = {
      workspaceProjects,
      subspaceProjects,
      semverPath: Import.resolveModule({ modulePath: 'semver', baseFolderPath: __dirname })
    };

    // common/config/rush/.pnpmfile-split-workspace.cjs
    const userPnpmfilePath: string = path.join(
      rushConfiguration.getCommonRushConfigFolder(subspaceName),
      (rushConfiguration.packageManagerWrapper as PnpmPackageManager).subspacePnpmfileFilename
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
    if (!subspaceGlobalPnpmfile.hooks?.readPackage || !this._context) {
      return packageJson;
    } else {
      return subspaceGlobalPnpmfile.hooks.readPackage(packageJson, this._context);
    }
  }
}
