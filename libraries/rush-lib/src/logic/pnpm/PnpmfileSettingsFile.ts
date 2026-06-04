// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import * as semver from 'semver';

import { FileSystem, Import, JsonFile, MapExtensions } from '@rushstack/node-core-library';

import type { CommonVersionsConfiguration } from '../../api/CommonVersionsConfiguration';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { Subspace } from '../../api/Subspace';
import type { IPnpmfileShimSettings } from './IPnpmfile';
import type { PnpmOptionsConfiguration } from './PnpmOptionsConfiguration';

export type IPnpmfileCommonShimSettings = Omit<IPnpmfileShimSettings, 'workspaceVersions'>;
export type IPnpmfileReferredAndAlternativeShimSettings = Required<
  Pick<
    IPnpmfileShimSettings,
    'allPreferredVersions' | 'semverPath' | 'allowedAlternativeVersions' | 'userPnpmfilePath'
  >
>;

export class PnpmfileSettingsFile {
  public static readonly filename: string = 'pnpmfileSettings.json';

  public static async writeSettingsFileAsync(
    settings: IPnpmfileCommonShimSettings | IPnpmfileShimSettings,
    targetDir: string
  ): Promise<void> {
    await JsonFile.saveAsync(settings, path.join(targetDir, PnpmfileSettingsFile.filename), {
      ensureFolderExists: true
    });
  }

  public static getCommonPnpmfileShimSettings(
    rushConfiguration: RushConfiguration,
    subspace: Subspace,
    variant: string | undefined
  ): IPnpmfileReferredAndAlternativeShimSettings {
    let allPreferredVersions: { [dependencyName: string]: string } = {};
    let allowedAlternativeVersions: { [dependencyName: string]: readonly string[] } = {};

    const pnpmOptions: PnpmOptionsConfiguration =
      rushConfiguration.packageManagerOptions as PnpmOptionsConfiguration;
    if (pnpmOptions?.useWorkspaces) {
      const commonVersionsConfiguration: CommonVersionsConfiguration = subspace.getCommonVersions(variant);
      const preferredVersions: Map<string, string> = new Map();
      MapExtensions.mergeFromMap(
        preferredVersions,
        rushConfiguration.getImplicitlyPreferredVersions(subspace, variant)
      );

      for (const [name, version] of commonVersionsConfiguration.getAllPreferredVersions()) {
        // Use the most restrictive version range available.
        if (!preferredVersions.has(name) || semver.subset(version, preferredVersions.get(name)!)) {
          preferredVersions.set(name, version);
        }
      }

      allPreferredVersions = MapExtensions.toObject(preferredVersions);
      allowedAlternativeVersions = MapExtensions.toObject(
        commonVersionsConfiguration.allowedAlternativeVersions
      );
    }

    const settings: IPnpmfileReferredAndAlternativeShimSettings = {
      allPreferredVersions,
      allowedAlternativeVersions,
      semverPath: Import.resolveModule({
        modulePath: 'semver',
        baseFolderPath: __dirname
      }),
      userPnpmfilePath: ''
    };

    const userPnpmfilePath: string = subspace.getPnpmfilePath(variant);
    if (FileSystem.exists(userPnpmfilePath)) {
      settings.userPnpmfilePath = userPnpmfilePath;
    }

    return settings;
  }

  public static getPnpmfileShimSettings(
    rushConfiguration: RushConfiguration,
    subspace: Subspace,
    variant: string | undefined
  ): IPnpmfileShimSettings {
    const workspaceVersions: Record<string, string> = {};

    const pnpmOptions: PnpmOptionsConfiguration =
      rushConfiguration.packageManagerOptions as PnpmOptionsConfiguration;
    if (pnpmOptions?.useWorkspaces) {
      for (const project of rushConfiguration.projects) {
        workspaceVersions[project.packageName] = project.packageJson.version;
      }
    }

    return {
      ...PnpmfileSettingsFile.getCommonPnpmfileShimSettings(rushConfiguration, subspace, variant),
      workspaceVersions
    };
  }
}
