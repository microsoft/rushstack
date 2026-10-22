// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { Subspace } from '../../api/Subspace';
import { RushConstants } from '../RushConstants';
import type { PnpmOptionsConfiguration } from './PnpmOptionsConfiguration';

/**
 * PNPM catalog definitions, keyed by catalog name and then by package name.
 * The default catalog (referenced as `catalog:` or `catalog:default`) uses the key `default`.
 */
export type PnpmCatalogs = Record<string, Record<string, string>>;

/**
 * The pnpm-config.json settings that are in effect for a subspace.
 */
export interface IEffectivePnpmOptions {
  /**
   * The PNPM options that Rush uses when installing the subspace.
   */
  readonly pnpmOptions: PnpmOptionsConfiguration;

  /**
   * The absolute path of the pnpm-config.json file that `pnpmOptions` was loaded from.
   *
   * @remarks
   * When `isFallback` is true, this is `common/config/rush/pnpm-config.json`. That file might not exist
   * if the repo still uses the legacy `pnpmOptions` field in rush.json.
   */
  readonly pnpmConfigFilePath: string;

  /**
   * True if the subspace does not have a pnpm-config.json of its own, so the options come from
   * `common/config/rush/pnpm-config.json` (or the legacy `pnpmOptions` field in rush.json).
   *
   * @remarks
   * When the subspaces feature is disabled, the subspace's own pnpm-config.json path is
   * `common/config/rush/pnpm-config.json`, so this is only true if that file does not exist.
   */
  readonly isFallback: boolean;
}

/**
 * Returns the pnpm-config.json settings that are in effect for the specified subspace.
 *
 * @remarks
 * This mirrors the fallback that install uses: the subspace's own pnpm-config.json
 * (see {@link Subspace.getPnpmConfigFilePath}) if it exists, otherwise
 * {@link RushConfiguration.pnpmOptions}. Every consumer of the PNPM settings for a subspace
 * (install, the repo-state.json catalog hash, change detection, and `rush-pnpm` sync-back)
 * must use this function so that they cannot disagree.
 */
export function getEffectivePnpmOptions(
  subspace: Subspace,
  rushConfiguration: RushConfiguration
): IEffectivePnpmOptions {
  const subspacePnpmOptions: PnpmOptionsConfiguration | undefined = subspace.getPnpmOptions();
  if (subspacePnpmOptions) {
    return {
      pnpmOptions: subspacePnpmOptions,
      pnpmConfigFilePath: subspace.getPnpmConfigFilePath(),
      isFallback: false
    };
  }

  return {
    pnpmOptions: rushConfiguration.pnpmOptions,
    pnpmConfigFilePath: getCommonPnpmConfigFilePath(rushConfiguration),
    isFallback: true
  };
}

/**
 * Returns the PNPM catalogs that Rush writes to the generated pnpm-workspace.yaml for the
 * specified subspace, or `undefined` if no catalogs are defined or the package manager is not PNPM.
 */
export function getEffectivePnpmCatalogs(
  subspace: Subspace,
  rushConfiguration: RushConfiguration
): PnpmCatalogs | undefined {
  if (!rushConfiguration.isPnpm) {
    return undefined;
  }

  const { globalCatalogs } = getEffectivePnpmOptions(subspace, rushConfiguration).pnpmOptions;
  if (!globalCatalogs || Object.keys(globalCatalogs).length === 0) {
    return undefined;
  }

  return globalCatalogs;
}

/**
 * Returns the other subspaces whose effective pnpm-config.json is the same file as the
 * specified subspace's effective pnpm-config.json. The specified subspace is not included.
 *
 * @remarks
 * This can only return a non-empty array when the subspaces feature is enabled and the specified
 * subspace falls back to `common/config/rush/pnpm-config.json`. Editing the catalogs in that file
 * affects every returned subspace, so each of them needs `rush update` to refresh its lockfile.
 */
export function getOtherSubspacesSharingPnpmConfig(
  subspace: Subspace,
  rushConfiguration: RushConfiguration
): Subspace[] {
  const { pnpmConfigFilePath } = getEffectivePnpmOptions(subspace, rushConfiguration);
  const result: Subspace[] = [];
  if (!rushConfiguration.subspacesFeatureEnabled) {
    return result;
  }

  for (const otherSubspace of rushConfiguration.subspaces) {
    if (
      otherSubspace !== subspace &&
      getEffectivePnpmOptions(otherSubspace, rushConfiguration).pnpmConfigFilePath === pnpmConfigFilePath
    ) {
      result.push(otherSubspace);
    }
  }

  return result;
}

/**
 * Returns the absolute path of `common/config/rush/pnpm-config.json`.
 */
export function getCommonPnpmConfigFilePath(rushConfiguration: RushConfiguration): string {
  return `${rushConfiguration.commonRushConfigFolder}/${RushConstants.pnpmConfigFilename}`;
}

/**
 * Adds the entries of `catalogsToAdd` to `existingCatalogs` without removing any existing catalog or entry.
 * If a package is in both, the version from `catalogsToAdd` wins.
 *
 * @remarks
 * Use this instead of replacing the catalogs when the pnpm-config.json is shared by several subspaces
 * (see {@link getOtherSubspacesSharingPnpmConfig}), because a subspace's workspace cannot tell which
 * entries the other subspaces use. The inputs are not modified.
 *
 * @returns A new plain object (without the configuration file annotations that loaded catalogs have),
 * or `existingCatalogs` if the result would have no catalogs.
 */
export function mergePnpmCatalogs(
  existingCatalogs: PnpmCatalogs | undefined,
  catalogsToAdd: PnpmCatalogs | undefined
): PnpmCatalogs | undefined {
  const result: PnpmCatalogs = {};
  for (const catalogs of [existingCatalogs, catalogsToAdd]) {
    for (const [catalogName, packages] of Object.entries(catalogs ?? {})) {
      const mergedPackages: Record<string, string> = (result[catalogName] ??= {});
      // Copy only the string keys; object spread would also copy annotation symbols
      for (const [packageName, version] of Object.entries(packages)) {
        mergedPackages[packageName] = version;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : existingCatalogs;
}
