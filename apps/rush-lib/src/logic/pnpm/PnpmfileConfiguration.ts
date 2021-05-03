// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, IPackageJson, JsonFile, MapExtensions } from '@rushstack/node-core-library';

import { PnpmPackageManager } from '../../api/packageManager/PnpmPackageManager';
import { RushConfiguration } from '../../api/RushConfiguration';

import type { IPnpmfile, IPnpmfileContext, IPnpmfileShimSettings } from './IPnpmfile';
import { CommonVersionsConfiguration } from '../../api/CommonVersionsConfiguration';

/**
 * Options used when generating the pnpmfile shim settings file.
 */
export interface IPnpmfileShimOptions {
  /**
   * Whether or not preferred versions should be included in the shim settings.
   */
  includePreferredVersions: boolean;

  /**
   * The path to the client pnpmfile that is used after running the shim
   */
  clientPnpmfilePath?: string;
}

/**
 * Loads PNPM's pnpmfile.js configuration, and invokes it to preprocess package.json files,
 * optionally utilizing a pnpmfile shim to inject preferred versions.
 */
export class PnpmfileConfiguration {
  protected static readonly CLIENT_PNPMFILE_NAME: string = 'clientPnpmfile.js';

  private _pnpmfile: IPnpmfile | undefined;
  private _context: IPnpmfileContext | undefined;

  public constructor(rushConfiguration: RushConfiguration, pnpmfileShimOptions?: IPnpmfileShimOptions) {
    if (rushConfiguration.packageManager === 'pnpm') {
      if (pnpmfileShimOptions) {
        this._pnpmfile = require('./PnpmfileShim');
      } else {
        const pnpmFilePath: string = rushConfiguration.getPnpmfilePath();
        if (FileSystem.exists(pnpmFilePath)) {
          this._pnpmfile = require(pnpmFilePath);
        }
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
  }

  public static async writeCommonTempPnpmfileShimAsync(
    rushConfiguration: RushConfiguration,
    options: IPnpmfileShimOptions
  ): Promise<void> {
    if (rushConfiguration.packageManager !== 'pnpm') {
      return;
    }

    const pnpmfileShimSettings: IPnpmfileShimSettings = PnpmfileConfiguration._getPnpmfileShimSettings(
      rushConfiguration,
      options
    );

    // Move the original file if it exists
    const targetDir: string = rushConfiguration.commonTempFolder;
    const tempPnpmFilePath: string = path.join(
      targetDir,
      (rushConfiguration.packageManagerWrapper as PnpmPackageManager).pnpmfileFilename
    );

    // If there was no clientPnpmfilePath specified or the path matches the normal pnpmfile path, we will assume
    // they're referencing the common/temp pnpmfile and move it so that we can take it's place
    if (
      !pnpmfileShimSettings.clientPnpmfilePath ||
      pnpmfileShimSettings.clientPnpmfilePath === tempPnpmFilePath
    ) {
      try {
        const clientPnpmfilePath: string = path.join(targetDir, PnpmfileConfiguration.CLIENT_PNPMFILE_NAME);
        await FileSystem.moveAsync({
          sourcePath: tempPnpmFilePath,
          destinationPath: clientPnpmfilePath
        });
        pnpmfileShimSettings.clientPnpmfilePath = clientPnpmfilePath;
      } catch (error) {
        if (!FileSystem.isNotExistError(error)) {
          throw error;
        }
      }
    }

    // Write the shim itself
    await FileSystem.copyFileAsync({
      sourcePath: path.join(__dirname, 'PnpmfileShim.js'),
      destinationPath: tempPnpmFilePath
    });

    // Write the settings file used by the shim
    await JsonFile.saveAsync(pnpmfileShimSettings, path.join(targetDir, 'pnpmfileSettings.json'), {
      ensureFolderExists: true
    });
  }

  private static _getPnpmfileShimSettings(
    rushConfiguration: RushConfiguration,
    options?: IPnpmfileShimOptions
  ): IPnpmfileShimSettings {
    const commonVersionsConfiguration: CommonVersionsConfiguration = rushConfiguration.getCommonVersions();
    const preferredVersions: Map<string, string> = new Map();
    MapExtensions.mergeFromMap(preferredVersions, commonVersionsConfiguration.getAllPreferredVersions());
    MapExtensions.mergeFromMap(preferredVersions, rushConfiguration.getImplicitlyPreferredVersions());

    return {
      allPreferredVersions: options?.includePreferredVersions
        ? MapExtensions.toObject(preferredVersions)
        : {},
      allowedAlternativeVersions: options?.includePreferredVersions
        ? MapExtensions.toObject(commonVersionsConfiguration.allowedAlternativeVersions)
        : {},
      clientPnpmfilePath: options?.clientPnpmfilePath,
      semverPath: require.resolve('semver')
    };
  }

  /**
   * Transform a package.json file using the pnpmfile.js hook.
   * @returns the tranformed object, or the original input if pnpmfile.js was not found.
   */
  public transform(packageJson: IPackageJson): IPackageJson {
    if (!this._pnpmfile?.hooks?.readPackage || !this._context) {
      return packageJson;
    } else {
      return this._pnpmfile.hooks.readPackage(packageJson, this._context);
    }
  }
}
