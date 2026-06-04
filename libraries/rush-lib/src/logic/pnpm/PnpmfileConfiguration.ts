// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, type IPackageJson } from '@rushstack/node-core-library';

import type { PnpmPackageManager } from '../../api/packageManager/PnpmPackageManager';
import type { RushConfiguration } from '../../api/RushConfiguration';
import * as pnpmfile from './PnpmfileShim';
import { pnpmfileShimFilename, scriptsFolderPath } from '../../utilities/PathConstants';
import type { IPnpmfileContext } from './IPnpmfile';
import type { Subspace } from '../../api/Subspace';
import { PnpmfileSettingsFile } from './PnpmfileSettingsFile';

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
      pnpmfileShimSettings: PnpmfileSettingsFile.getPnpmfileShimSettings(rushConfiguration, subspace, variant)
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

    // Write the settings file used by the shim
    await PnpmfileSettingsFile.writeSettingsFileAsync(
      PnpmfileSettingsFile.getPnpmfileShimSettings(rushConfiguration, subspace, variant),
      targetDir
    );
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
