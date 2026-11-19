// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { PnpmCatalogs } from './EffectivePnpmOptions';

export const PNPM_CATALOG_PROTOCOL: 'catalog:' = 'catalog:';

export const DEFAULT_PNPM_CATALOG_NAME: 'default' = 'default';

export interface IPnpmCatalogReference {
  /**
   * The normalized catalog name; `catalog:` and `catalog:default` are both `default`.
   */
  readonly catalogName: string;

  /**
   * The version from the catalog entry, or `undefined` if the catalog has no entry for the package.
   */
  readonly resolvedVersion: string | undefined;
}

/**
 * Returns the normalized catalog name if the specifier is a PNPM catalog reference, otherwise `undefined`.
 * Like PNPM, the name is trimmed and an empty name means `default`.
 */
export function tryParsePnpmCatalogName(versionSpecifier: string): string | undefined {
  if (!versionSpecifier.startsWith(PNPM_CATALOG_PROTOCOL)) {
    return undefined;
  }

  const catalogName: string = versionSpecifier.slice(PNPM_CATALOG_PROTOCOL.length).trim();
  return catalogName || DEFAULT_PNPM_CATALOG_NAME;
}

/**
 * Returns `catalog:` for the default catalog, otherwise `catalog:<catalogName>`.
 */
export function formatPnpmCatalogSpecifier(catalogName: string): string {
  return catalogName === DEFAULT_PNPM_CATALOG_NAME
    ? PNPM_CATALOG_PROTOCOL
    : `${PNPM_CATALOG_PROTOCOL}${catalogName}`;
}

export function tryGetPnpmCatalogVersion(
  catalogs: PnpmCatalogs | undefined,
  catalogName: string,
  packageName: string
): string | undefined {
  // Own-property checks, so names like "constructor" don't resolve to Object.prototype members
  if (!catalogs || !Object.prototype.hasOwnProperty.call(catalogs, catalogName)) {
    return undefined;
  }

  const catalog: Record<string, string> = catalogs[catalogName];
  if (!Object.prototype.hasOwnProperty.call(catalog, packageName)) {
    return undefined;
  }

  return catalog[packageName];
}

/**
 * Returns `undefined` if the specifier isn't a catalog reference.
 *
 * @param catalogs - from `getEffectivePnpmCatalogs()` for the declaring project's subspace
 */
export function tryResolvePnpmCatalogReference(
  packageName: string,
  versionSpecifier: string,
  catalogs: PnpmCatalogs | undefined
): IPnpmCatalogReference | undefined {
  const catalogName: string | undefined = tryParsePnpmCatalogName(versionSpecifier);
  if (catalogName === undefined) {
    return undefined;
  }

  return {
    catalogName,
    resolvedVersion: tryGetPnpmCatalogVersion(catalogs, catalogName, packageName)
  };
}
