// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { Subspace } from '../../api/Subspace';
import { RushConstants } from '../RushConstants';
import type { PnpmOptionsConfiguration } from './PnpmOptionsConfiguration';

/**
 * Catalog name to package name to version. The default catalog uses the key `default`.
 */
export type PnpmCatalogs = Record<string, Record<string, string>>;

export interface IEffectivePnpmOptions {
  readonly pnpmOptions: PnpmOptionsConfiguration;
  /**
   * The file `pnpmOptions` came from. It might not exist if rush.json uses the legacy `pnpmOptions` field.
   */
  readonly pnpmConfigFilePath: string;
  /**
   * True if the subspace has no pnpm-config.json of its own and uses the common one.
   */
  readonly isFallback: boolean;
}

/**
 * Returns the subspace's own pnpm-config.json settings if it has one, otherwise the common ones.
 * This is the rule install uses, so every other reader of a subspace's PNPM settings must use it too.
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
 * The catalogs that install writes to the subspace's pnpm-workspace.yaml, or `undefined` if there are none.
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
 * Returns the other subspaces that read their settings from the same pnpm-config.json as `subspace`.
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

export function getCommonPnpmConfigFilePath(rushConfiguration: RushConfiguration): string {
  return `${rushConfiguration.commonRushConfigFolder}/${RushConstants.pnpmConfigFilename}`;
}

/**
 * Adds and updates entries from `catalogsToAdd` without removing anything from `existingCatalogs`.
 * Neither input is modified.
 */
export function mergePnpmCatalogs(
  existingCatalogs: PnpmCatalogs | undefined,
  catalogsToAdd: PnpmCatalogs | undefined
): PnpmCatalogs | undefined {
  const result: PnpmCatalogs = {};
  for (const catalogs of [existingCatalogs, catalogsToAdd]) {
    for (const [catalogName, packages] of Object.entries(catalogs ?? {})) {
      const mergedPackages: Record<string, string> = (result[catalogName] ??= {});
      // Not object spread, which would copy heft-config-file's annotation symbols
      for (const [packageName, version] of Object.entries(packages)) {
        mergedPackages[packageName] = version;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : existingCatalogs;
}
