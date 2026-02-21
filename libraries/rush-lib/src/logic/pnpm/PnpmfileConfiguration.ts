// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import * as semver from 'semver';

import { FileSystem, Import, type IPackageJson, JsonFile, MapExtensions } from '@rushstack/node-core-library';

import type { PnpmPackageManager } from '../../api/packageManager/PnpmPackageManager.ts';
import type { RushConfiguration } from '../../api/RushConfiguration.ts';
import type { CommonVersionsConfiguration } from '../../api/CommonVersionsConfiguration.ts';
import type { PnpmOptionsConfiguration } from './PnpmOptionsConfiguration.ts';
import * as pnpmfile from './PnpmfileShim.ts';
import { pnpmfileShimFilename, scriptsFolderPath } from '../../utilities/PathConstants.ts';
import type { IPnpmfileContext, IPnpmfileShimSettings } from './IPnpmfile.ts';
import type { Subspace } from '../../api/Subspace.ts';

/**
 * Loads PNPM's pnpmfile.js configuration, and invokes it to preprocess package.json files,
 * optionally utilizing a pnpmfile shim to inject preferred versions.
 */
export class PnpmfileConfiguration {
  private _context: IPnpmfileContext | undefined;

  private constructor(context: IPnpmfileContext) {
    pnpmfile.reset();
    this._context = context;
  }

  public static async initializeAsync(
    rushConfiguration: RushConfiguration,
    subspace: Subspace,
    variant: string | undefined
  ): Promise<PnpmfileConfiguration> {
    if (rushConfiguration.packageManager !== 'pnpm') {
      throw new Error(
        `PnpmfileConfiguration cannot be used with package manager "${rushConfiguration.packageManager}"`
      );
    }

    // Set the context to swallow log output and store our settings
    const context: IPnpmfileContext = {
      log: (message: string) => {},
      pnpmfileShimSettings: await PnpmfileConfiguration._getPnpmfileShimSettingsAsync(
        rushConfiguration,
        subspace,
        variant
      )
    };

    return new PnpmfileConfiguration(context);
  }

  public static async writeCommonTempPnpmfileShimAsync(
    rushConfiguration: RushConfiguration,
    targetDir: string,
    subspace: Subspace,
    variant: string | undefined
  ): Promise<void> {
    if (rushConfiguration.packageManager !== 'pnpm') {
      throw new Error(
        `PnpmfileConfiguration cannot be used with package manager "${rushConfiguration.packageManager}"`
      );
    }

    const pnpmfilePath: string = path.join(
      targetDir,
      (rushConfiguration.packageManagerWrapper as PnpmPackageManager).pnpmfileFilename
    );

    // Write the shim itself
    await FileSystem.copyFileAsync({
      sourcePath: `${scriptsFolderPath}/${pnpmfileShimFilename}`,
      destinationPath: pnpmfilePath
    });

    const pnpmfileShimSettings: IPnpmfileShimSettings =
      await PnpmfileConfiguration._getPnpmfileShimSettingsAsync(rushConfiguration, subspace, variant);

    // Write the settings file used by the shim
    await JsonFile.saveAsync(pnpmfileShimSettings, path.join(targetDir, 'pnpmfileSettings.json'), {
      ensureFolderExists: true
    });
  }

  private static async _getPnpmfileShimSettingsAsync(
    rushConfiguration: RushConfiguration,
    subspace: Subspace,
    variant: string | undefined
  ): Promise<IPnpmfileShimSettings> {
    let allPreferredVersions: { [dependencyName: string]: string } = {};
    let allowedAlternativeVersions: { [dependencyName: string]: readonly string[] } = {};
    const workspaceVersions: Record<string, string> = {};

    // Only workspaces shims in the common versions using pnpmfile
    if ((rushConfiguration.packageManagerOptions as PnpmOptionsConfiguration).useWorkspaces) {
      const commonVersionsConfiguration: CommonVersionsConfiguration = subspace.getCommonVersions(variant);
      const preferredVersions: Map<string, string> = new Map();
      MapExtensions.mergeFromMap(
        preferredVersions,
        rushConfiguration.getImplicitlyPreferredVersions(subspace, variant)
      );
      for (const [name, version] of commonVersionsConfiguration.getAllPreferredVersions()) {
        // Use the most restrictive version range available
        if (!preferredVersions.has(name) || semver.subset(version, preferredVersions.get(name)!)) {
          preferredVersions.set(name, version);
        }
      }
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
      semverPath: Import.resolveModule({ modulePath: 'semver', baseFolderPath: __dirname })
    };

    // Use the provided path if available. Otherwise, use the default path.
    const userPnpmfilePath: string | undefined = subspace.getPnpmfilePath(variant);
    if (userPnpmfilePath && FileSystem.exists(userPnpmfilePath)) {
      settings.userPnpmfilePath = userPnpmfilePath;
    }

    return settings;
  }

  /**
   * Transform a package.json file using the pnpmfile.js hook.
   * @returns the transformed object, or the original input if pnpmfile.js was not found.
   */
  public transform(packageJson: IPackageJson): IPackageJson {
    if (!pnpmfile.hooks?.readPackage || !this._context) {
      return packageJson;
    } else {
      return pnpmfile.hooks.readPackage(packageJson, this._context);
    }
  }
}
