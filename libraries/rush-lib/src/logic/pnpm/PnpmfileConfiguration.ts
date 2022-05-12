// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, IPackageJson, JsonFile, MapExtensions } from '@rushstack/node-core-library';

import { PnpmPackageManager } from '../../api/packageManager/PnpmPackageManager';
import { PnpmOptionsConfiguration, RushConfiguration } from '../../api/RushConfiguration';
import { CommonVersionsConfiguration } from '../../api/CommonVersionsConfiguration';
import * as pnpmfile from './PnpmfileShim';

import type { IPnpmfileContext, IPnpmfileShimSettings } from './IPnpmfile';

/**
 * Options used when generating the pnpmfile shim settings file.
 */
export interface IPnpmfileShimOptions {
  /**
   * The variant that the client pnpmfile will be sourced from.
   */
  variant?: string;
}

/**
 * Loads PNPM's pnpmfile.js configuration, and invokes it to preprocess package.json files,
 * optionally utilizing a pnpmfile shim to inject preferred versions.
 */
export class PnpmfileConfiguration {
  private _context: IPnpmfileContext | undefined;

  public constructor(rushConfiguration: RushConfiguration, pnpmfileShimOptions?: IPnpmfileShimOptions) {
    if (rushConfiguration.packageManager !== 'pnpm') {
      throw new Error(
        `PnpmfileConfiguration cannot be used with package manager "${rushConfiguration.packageManager}"`
      );
    }

    // Set the context to swallow log output and store our settings
    this._context = {
      log: (message: string) => {},
      pnpmfileShimSettings: PnpmfileConfiguration._getPnpmfileShimSettings(
        rushConfiguration,
        pnpmfileShimOptions
      )
    };
  }

  public static async writeCommonTempPnpmfileShimAsync(
    rushConfiguration: RushConfiguration,
    options?: IPnpmfileShimOptions
  ): Promise<void> {
    if (rushConfiguration.packageManager !== 'pnpm') {
      throw new Error(
        `PnpmfileConfiguration cannot be used with package manager "${rushConfiguration.packageManager}"`
      );
    }

    const targetDir: string = rushConfiguration.commonTempFolder;
    const pnpmfilePath: string = path.join(
      targetDir,
      (rushConfiguration.packageManagerWrapper as PnpmPackageManager).pnpmfileFilename
    );

    // Write the shim itself
    await FileSystem.copyFileAsync({
      sourcePath: path.join(__dirname, 'PnpmfileShim.js'),
      destinationPath: pnpmfilePath
    });

    const pnpmfileShimSettings: IPnpmfileShimSettings = PnpmfileConfiguration._getPnpmfileShimSettings(
      rushConfiguration,
      options
    );

    // Write the settings file used by the shim
    await JsonFile.saveAsync(pnpmfileShimSettings, path.join(targetDir, 'pnpmfileSettings.json'), {
      ensureFolderExists: true
    });
  }

  private static _getPnpmfileShimSettings(
    rushConfiguration: RushConfiguration,
    options?: IPnpmfileShimOptions
  ): IPnpmfileShimSettings {
    let allPreferredVersions: { [dependencyName: string]: string } = {};
    let allowedAlternativeVersions: { [dependencyName: string]: readonly string[] } = {};
    const workspaceVersions: Record<string, string> = {};

    // Only workspaces shims in the common versions using pnpmfile
    if ((rushConfiguration.packageManagerOptions as PnpmOptionsConfiguration).useWorkspaces) {
      const commonVersionsConfiguration: CommonVersionsConfiguration = rushConfiguration.getCommonVersions();
      const preferredVersions: Map<string, string> = new Map();
      MapExtensions.mergeFromMap(preferredVersions, commonVersionsConfiguration.getAllPreferredVersions());
      MapExtensions.mergeFromMap(preferredVersions, rushConfiguration.getImplicitlyPreferredVersions());
      allPreferredVersions = MapExtensions.toObject(preferredVersions);
      allowedAlternativeVersions = MapExtensions.toObject(
        commonVersionsConfiguration.allowedAlternativeVersions
      );

      for (const project of rushConfiguration.projects) {
        workspaceVersions[project.packageName] = project.packageJson.version;
      }
    }

    const settings: IPnpmfileShimSettings = {
      allPreferredVersions,
      allowedAlternativeVersions,
      workspaceVersions,
      semverPath: require.resolve('semver')
    };

    // Use the provided path if available. Otherwise, use the default path.
    const userPnpmfilePath: string | undefined = rushConfiguration.getPnpmfilePath(options?.variant);
    if (userPnpmfilePath && FileSystem.exists(userPnpmfilePath)) {
      settings.userPnpmfilePath = userPnpmfilePath;
    }

    return settings;
  }

  /**
   * Transform a package.json file using the pnpmfile.js hook.
   * @returns the tranformed object, or the original input if pnpmfile.js was not found.
   */
  public transform(packageJson: IPackageJson): IPackageJson {
    if (!pnpmfile.hooks?.readPackage || !this._context) {
      return packageJson;
    } else {
      return pnpmfile.hooks.readPackage(packageJson, this._context);
    }
  }
}
